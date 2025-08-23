/**
 * Room Usage Counters Service
 * Provides room-level usage tracking for messages, AI responses, and threads
 * 
 * This is the critical foundation for room-centric rate limiting architecture
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type RoomResource = 'messages' | 'ai_responses' | 'threads' | 'reasoning_messages';
export type UsagePeriod = 'hour' | 'day' | 'month';

export interface RoomUsageCounter {
  room_id: string;
  resource: RoomResource;
  period: UsagePeriod;
  period_start: string;
  count: number;
  created_at: string;
  updated_at: string;
}

export interface RoomUsageResult {
  success: boolean;
  count?: number;
  error?: string;
}

export interface RoomLimitCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  resetTime?: Date;
}

/**
 * Increment room usage counter for a specific resource and period
 */
export async function incrementRoomUsage(
  roomId: string,
  resource: RoomResource,
  period: UsagePeriod,
  increment: number = 1
): Promise<RoomUsageResult> {
  try {
    const { error } = await supabase.rpc('increment_room_usage_counter', {
      p_room_id: roomId,
      p_resource: resource,
      p_period: period,
      p_increment: increment
    });

    if (error) {
      console.error('Error incrementing room usage:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to increment room usage:', error);
    return { success: false, error: 'Failed to increment room usage' };
  }
}

/**
 * Get current room usage counter for a specific resource and period
 */
export async function getRoomUsage(
  roomId: string,
  resource: RoomResource,
  period: UsagePeriod
): Promise<RoomUsageResult> {
  try {
    const { data, error } = await supabase.rpc('get_room_usage_counter', {
      p_room_id: roomId,
      p_resource: resource,
      p_period: period
    });

    if (error) {
      console.error('Error getting room usage:', error);
      return { success: false, error: error.message };
    }

    return { success: true, count: data || 0 };
  } catch (error) {
    console.error('Failed to get room usage:', error);
    return { success: false, error: 'Failed to get room usage' };
  }
}

/**
 * Check if room usage is within the specified limit
 */
export async function checkRoomUsageLimit(
  roomId: string,
  resource: RoomResource,
  period: UsagePeriod,
  limit: number
): Promise<RoomLimitCheckResult> {
  try {
    // Get current usage
    const usageResult = await getRoomUsage(roomId, resource, period);
    if (!usageResult.success) {
      return {
        allowed: false,
        currentUsage: 0,
        limit,
        remaining: 0
      };
    }

    const currentUsage = usageResult.count || 0;
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    // Calculate reset time based on period
    let resetTime: Date | undefined;
    const now = new Date();
    
    switch (period) {
      case 'hour':
        resetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
        break;
      case 'day':
        resetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
        break;
      case 'month':
        resetTime = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        break;
    }

    return {
      allowed,
      currentUsage,
      limit,
      remaining,
      resetTime
    };
  } catch (error) {
    console.error('Failed to check room usage limit:', error);
    return {
      allowed: false,
      currentUsage: 0,
      limit,
      remaining: 0
    };
  }
}

/**
 * Get multiple room usage counters at once
 */
export async function getRoomUsageMultiple(
  roomId: string,
  checks: Array<{ resource: RoomResource; period: UsagePeriod }>
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  try {
    const promises = checks.map(async ({ resource, period }) => {
      const result = await getRoomUsage(roomId, resource, period);
      const key = `${resource}_${period}`;
      results[key] = result.success ? (result.count || 0) : 0;
    });

    await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('Failed to get multiple room usage counters:', error);
    return results;
  }
}

/**
 * Clean up old room usage counters (utility function)
 */
export async function cleanupOldRoomUsageCounters(): Promise<RoomUsageResult> {
  try {
    const { error } = await supabase.rpc('cleanup_old_room_usage_counters');

    if (error) {
      console.error('Error cleaning up old room usage counters:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup old room usage counters:', error);
    return { success: false, error: 'Failed to cleanup old counters' };
  }
}

/**
 * Helper function to get room resource limits based on room tier
 */
export function getRoomResourceLimits(roomTier: 'free' | 'basic' | 'premium') {
  const limits = {
    free: {
      messages_hour: 100,
      messages_day: 400,
      ai_responses_hour: 20,
      ai_responses_day: 80,
      reasoning_messages_hour: 15,
      reasoning_messages_day: 50,
      threads_day: 3
    },
    basic: {
      messages_hour: 200,
      messages_day: 800,
      ai_responses_hour: 50,
      ai_responses_day: 200,
      reasoning_messages_hour: 80,
      reasoning_messages_day: 300,
      threads_day: 5
    },
    premium: {
      messages_hour: 500,
      messages_day: 2000,
      ai_responses_hour: 100,
      ai_responses_day: 400,
      reasoning_messages_hour: 200,
      reasoning_messages_day: 800,
      threads_day: 10
    }
  };

  return limits[roomTier];
}

/**
 * Comprehensive room limit check for multiple resources
 */
export async function checkRoomLimitsComprehensive(
  roomId: string,
  roomTier: 'free' | 'basic' | 'premium'
): Promise<{
  messages: RoomLimitCheckResult;
  ai_responses: RoomLimitCheckResult;
  reasoning_messages: RoomLimitCheckResult;
  threads: RoomLimitCheckResult;
}> {
  const limits = getRoomResourceLimits(roomTier);

  const [messages, aiResponses, reasoningMessages, threads] = await Promise.all([
    checkRoomUsageLimit(roomId, 'messages', 'hour', limits.messages_hour),
    checkRoomUsageLimit(roomId, 'ai_responses', 'hour', limits.ai_responses_hour),
    checkRoomUsageLimit(roomId, 'reasoning_messages', 'hour', limits.reasoning_messages_hour),
    checkRoomUsageLimit(roomId, 'threads', 'day', limits.threads_day)
  ]);

  return {
    messages,
    ai_responses: aiResponses,
    reasoning_messages: reasoningMessages,
    threads
  };
}