/**
 * Room Tier Service
 * Central service for room tier management and room-level rate limiting
 * 
 * This service manages room capabilities based on creator tier and enforces
 * room-wide limits for messages, AI responses, and threads.
 */

import { createClient } from '@supabase/supabase-js';
import { 
  checkRoomUsageLimit, 
  incrementRoomUsage, 
  RoomLimitCheckResult,
  RoomResource,
  getRoomResourceLimits,
  checkRoomLimitsComprehensive
} from './roomUsageCounters';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type RoomTier = 'free' | 'basic' | 'premium';

export interface RoomCapabilities {
  maxParticipants: number;
  messagesPerHour: number;
  messagesPerDay: number;
  threadMessageLimit: number;
  aiResponsesPerHour: number;
  aiResponsesPerDay: number;
  reasoningMessagesPerHour: number;
  reasoningMessagesPerDay: number;
  concurrentThreads: number;
  contextWindow: number;
}

export interface RoomInfo {
  id: string;
  shareCode: string;
  creatorTier: RoomTier;
  capabilities: RoomCapabilities;
  participantCount: number;
}

export interface JoinResult {
  allowed: boolean;
  reason?: string;
  maxParticipants?: number;
  currentParticipants?: number;
}

export interface RoomAILimitCheck {
  allowed: boolean;
  reason?: string;
  limitType?: 'room' | 'user';
  currentUsage?: number;
  limit?: number;
  resetTime?: Date;
}

/**
 * Room tier configurations matching the original matrix
 */
export const ROOM_TIER_CONFIGS: Record<RoomTier, RoomCapabilities> = {
  free: {
    maxParticipants: 3,
    messagesPerHour: 100,
    messagesPerDay: 400,
    threadMessageLimit: 30,
    aiResponsesPerHour: 20,
    aiResponsesPerDay: 80,
    reasoningMessagesPerHour: 15,
    reasoningMessagesPerDay: 50,
    concurrentThreads: 3,
    contextWindow: 32000
  },
  basic: {
    maxParticipants: 8,
    messagesPerHour: 200,
    messagesPerDay: 800,
    threadMessageLimit: 60,
    aiResponsesPerHour: 50,
    aiResponsesPerDay: 200,
    reasoningMessagesPerHour: 80,
    reasoningMessagesPerDay: 300,
    concurrentThreads: 5,
    contextWindow: 128000
  },
  premium: {
    maxParticipants: 25,
    messagesPerHour: 500,
    messagesPerDay: 2000,
    threadMessageLimit: 200,
    aiResponsesPerHour: 100,
    aiResponsesPerDay: 400,
    reasoningMessagesPerHour: 200,
    reasoningMessagesPerDay: 800,
    concurrentThreads: 10,
    contextWindow: 512000
  }
};

/**
 * Get room tier from database
 */
export async function getRoomTier(shareCode: string): Promise<RoomTier | null> {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('creator_tier')
      .eq('share_code', shareCode)
      .single();

    if (error) {
      console.error('Error getting room tier:', error);
      return null;
    }

    return (data?.creator_tier as RoomTier) || 'free';
  } catch (error) {
    console.error('Failed to get room tier:', error);
    return null;
  }
}

/**
 * Get room information including tier and capabilities
 */
export async function getRoomInfo(shareCode: string): Promise<RoomInfo | null> {
  try {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('id, share_code, creator_tier')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !roomData) {
      console.error('Error getting room info:', roomError);
      return null;
    }

    // Get participant count
    const { count: participantCount } = await supabase
      .from('room_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomData.id);

    const creatorTier = (roomData.creator_tier as RoomTier) || 'free';
    const capabilities = ROOM_TIER_CONFIGS[creatorTier];

    return {
      id: roomData.id,
      shareCode: roomData.share_code,
      creatorTier,
      capabilities,
      participantCount: participantCount || 0
    };
  } catch (error) {
    console.error('Failed to get room info:', error);
    return null;
  }
}

/**
 * Get room capabilities based on creator tier
 */
export function getRoomCapabilities(tier: RoomTier): RoomCapabilities {
  return ROOM_TIER_CONFIGS[tier];
}

/**
 * Check if user can join room based on participant limits
 */
export async function canUserJoinRoom(shareCode: string, userId?: string): Promise<JoinResult> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { allowed: false, reason: 'Room not found' };
    }

    // Check if user is already in room
    if (userId) {
      const { data: existingParticipant } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', roomInfo.id)
        .eq('user_id', userId)
        .single();

      if (existingParticipant) {
        return { allowed: true };
      }
    }

    // Check participant limit
    if (roomInfo.participantCount >= roomInfo.capabilities.maxParticipants) {
      return {
        allowed: false,
        reason: 'Room is full',
        maxParticipants: roomInfo.capabilities.maxParticipants,
        currentParticipants: roomInfo.participantCount
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Failed to check if user can join room:', error);
    return { allowed: false, reason: 'Failed to check room access' };
  }
}

/**
 * Check room AI response limits (both regular and reasoning)
 */
export async function checkRoomAILimits(
  shareCode: string,
  threadId: string,
  isReasoning: boolean = false
): Promise<RoomAILimitCheck> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { allowed: false, reason: 'Room not found' };
    }

    const resource: RoomResource = isReasoning ? 'reasoning_messages' : 'ai_responses';
    const hourlyLimit = isReasoning 
      ? roomInfo.capabilities.reasoningMessagesPerHour
      : roomInfo.capabilities.aiResponsesPerHour;

    // Check room-level hourly limit
    const limitCheck = await checkRoomUsageLimit(
      roomInfo.id,
      resource,
      'hour',
      hourlyLimit
    );

    if (!limitCheck.allowed) {
      return {
        allowed: false,
        reason: `Room ${isReasoning ? 'reasoning' : 'AI'} response limit exceeded`,
        limitType: 'room',
        currentUsage: limitCheck.currentUsage,
        limit: limitCheck.limit,
        resetTime: limitCheck.resetTime
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Failed to check room AI limits:', error);
    return { allowed: false, reason: 'Failed to check room AI limits' };
  }
}

/**
 * Check room message limits
 */
export async function checkRoomMessageLimits(shareCode: string): Promise<RoomAILimitCheck> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { allowed: false, reason: 'Room not found' };
    }

    // Check room-level hourly message limit
    const limitCheck = await checkRoomUsageLimit(
      roomInfo.id,
      'messages',
      'hour',
      roomInfo.capabilities.messagesPerHour
    );

    if (!limitCheck.allowed) {
      return {
        allowed: false,
        reason: 'Room message limit exceeded',
        limitType: 'room',
        currentUsage: limitCheck.currentUsage,
        limit: limitCheck.limit,
        resetTime: limitCheck.resetTime
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Failed to check room message limits:', error);
    return { allowed: false, reason: 'Failed to check room message limits' };
  }
}

/**
 * Increment room AI response usage
 */
export async function incrementRoomAIUsage(
  shareCode: string,
  isReasoning: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { success: false, error: 'Room not found' };
    }

    const resource: RoomResource = isReasoning ? 'reasoning_messages' : 'ai_responses';
    
    // Increment both hourly and daily counters
    await Promise.all([
      incrementRoomUsage(roomInfo.id, resource, 'hour'),
      incrementRoomUsage(roomInfo.id, resource, 'day')
    ]);

    return { success: true };
  } catch (error) {
    console.error('Failed to increment room AI usage:', error);
    return { success: false, error: 'Failed to increment room AI usage' };
  }
}

/**
 * Increment room message usage
 */
export async function incrementRoomMessageUsage(shareCode: string): Promise<{ success: boolean; error?: string }> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { success: false, error: 'Room not found' };
    }

    // Increment both hourly and daily counters
    await Promise.all([
      incrementRoomUsage(roomInfo.id, 'messages', 'hour'),
      incrementRoomUsage(roomInfo.id, 'messages', 'day')
    ]);

    return { success: true };
  } catch (error) {
    console.error('Failed to increment room message usage:', error);
    return { success: false, error: 'Failed to increment room message usage' };
  }
}

/**
 * Get comprehensive room usage status
 */
export async function getRoomUsageStatus(shareCode: string) {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return null;
    }

    const limits = await checkRoomLimitsComprehensive(roomInfo.id, roomInfo.creatorTier);
    
    return {
      roomInfo,
      limits,
      capabilities: roomInfo.capabilities
    };
  } catch (error) {
    console.error('Failed to get room usage status:', error);
    return null;
  }
}

/**
 * Check thread message limits for a specific thread
 */
export async function checkThreadMessageLimit(
  shareCode: string,
  threadId: string
): Promise<{ allowed: boolean; messageCount?: number; limit?: number }> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { allowed: false };
    }

    // Get current message count for this thread
    const { count: messageCount } = await supabase
      .from('room_messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomInfo.id)
      .eq('thread_id', threadId);

    const currentCount = messageCount || 0;
    const limit = roomInfo.capabilities.threadMessageLimit;

    return {
      allowed: currentCount < limit,
      messageCount: currentCount,
      limit
    };
  } catch (error) {
    console.error('Failed to check thread message limit:', error);
    return { allowed: false };
  }
}

/**
 * Main room tier service class
 */
export class RoomTierService {
  async getRoomTier(shareCode: string): Promise<RoomTier | null> {
    return getRoomTier(shareCode);
  }

  async getRoomInfo(shareCode: string): Promise<RoomInfo | null> {
    return getRoomInfo(shareCode);
  }

  async checkRoomAILimits(shareCode: string, threadId: string, isReasoning?: boolean): Promise<RoomAILimitCheck> {
    return checkRoomAILimits(shareCode, threadId, isReasoning);
  }

  async checkRoomMessageLimits(shareCode: string): Promise<RoomAILimitCheck> {
    return checkRoomMessageLimits(shareCode);
  }

  async canUserJoinRoom(shareCode: string, userId?: string): Promise<JoinResult> {
    return canUserJoinRoom(shareCode, userId);
  }

  async incrementRoomAIUsage(shareCode: string, isReasoning?: boolean): Promise<{ success: boolean; error?: string }> {
    return incrementRoomAIUsage(shareCode, isReasoning);
  }

  async incrementRoomMessageUsage(shareCode: string): Promise<{ success: boolean; error?: string }> {
    return incrementRoomMessageUsage(shareCode);
  }

  async getRoomUsageStatus(shareCode: string) {
    return getRoomUsageStatus(shareCode);
  }

  async checkThreadMessageLimit(shareCode: string, threadId: string) {
    return checkThreadMessageLimit(shareCode, threadId);
  }

  getRoomCapabilities(tier: RoomTier): RoomCapabilities {
    return getRoomCapabilities(tier);
  }
}

// Export singleton instance
export const roomTierService = new RoomTierService();