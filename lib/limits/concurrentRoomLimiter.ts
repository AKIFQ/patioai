/**
 * Concurrent Room Limits Service
 * Enforces tier-based concurrent room participation limits
 */

import { createClient } from '@supabase/supabase-js';
import { getTierLimits, type UserTier } from './tierLimits';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ConcurrentRoomCheckResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  reason?: string;
  currentRooms?: Array<{ roomId: string; shareCode: string; roomName: string }>;
}

/**
 * Check if user can join another room based on their tier limits
 */
export async function checkConcurrentRoomLimit(
  userId: string | null,
  userTier: UserTier,
  targetRoomId?: string,
  sessionId?: string
): Promise<ConcurrentRoomCheckResult> {
  try {
    const tierLimits = getTierLimits(userTier);
    const maxRooms = tierLimits.concurrentRooms || 1;

    let currentRoomsQuery;

    if (userId) {
      // Authenticated user - check by user_id
      currentRoomsQuery = supabase
        .from('room_participants')
        .select(`
          room_id,
          rooms!inner(share_code, name)
        `)
        .eq('user_id', userId);
    } else if (sessionId) {
      // Anonymous user - check by session_id pattern
      currentRoomsQuery = supabase
        .from('room_participants')
        .select(`
          room_id,
          rooms!inner(share_code, name)
        `)
        .like('session_id', `${sessionId.split('_')[0]}_${sessionId.split('_')[1]}%`);
    } else {
      return {
        allowed: false,
        currentCount: 0,
        maxAllowed: maxRooms,
        reason: 'Invalid user identification'
      };
    }

    // Exclude target room if provided (for rejoining scenarios)
    if (targetRoomId) {
      currentRoomsQuery = currentRoomsQuery.neq('room_id', targetRoomId);
    }

    const { data: currentRooms, error } = await currentRoomsQuery;

    if (error) {
      console.error('Error checking concurrent room limit:', error);
      return {
        allowed: false,
        currentCount: 0,
        maxAllowed: maxRooms,
        reason: 'Failed to check current rooms'
      };
    }

    const currentCount = currentRooms?.length || 0;
    const allowed = currentCount < maxRooms;

    const roomList = currentRooms?.map(room => ({
      roomId: room.room_id,
      shareCode: (room as any).rooms.share_code,
      roomName: (room as any).rooms.name
    })) || [];

    return {
      allowed,
      currentCount,
      maxAllowed: maxRooms,
      reason: allowed ? undefined : `Maximum concurrent rooms exceeded for ${userTier} tier`,
      currentRooms: roomList
    };

  } catch (error) {
    console.error('Failed to check concurrent room limit:', error);
    return {
      allowed: false,
      currentCount: 0,
      maxAllowed: 1,
      reason: 'System error checking room limits'
    };
  }
}

/**
 * Get user's current room participation details
 */
export async function getCurrentRoomParticipation(
  userId: string | null,
  sessionId?: string
): Promise<Array<{ roomId: string; shareCode: string; roomName: string; joinedAt: string }>> {
  try {
    let query;

    if (userId) {
      query = supabase
        .from('room_participants')
        .select(`
          room_id,
          joined_at,
          rooms!inner(share_code, name)
        `)
        .eq('user_id', userId);
    } else if (sessionId) {
      query = supabase
        .from('room_participants')
        .select(`
          room_id,
          joined_at,
          rooms!inner(share_code, name)
        `)
        .like('session_id', `${sessionId.split('_')[0]}_${sessionId.split('_')[1]}%`);
    } else {
      return [];
    }

    const { data: rooms, error } = await query;

    if (error || !rooms) {
      console.error('Error getting current room participation:', error);
      return [];
    }

    return rooms.map(room => ({
      roomId: room.room_id,
      shareCode: (room as any).rooms.share_code,
      roomName: (room as any).rooms.name,
      joinedAt: room.joined_at
    }));

  } catch (error) {
    console.error('Failed to get current room participation:', error);
    return [];
  }
}

/**
 * Force leave a room (for tier enforcement)
 */
export async function forceLeaveRoom(
  userId: string | null,
  sessionId: string | null,
  roomId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let deleteQuery;

    if (userId) {
      deleteQuery = supabase
        .from('room_participants')
        .delete()
        .eq('user_id', userId)
        .eq('room_id', roomId);
    } else if (sessionId) {
      deleteQuery = supabase
        .from('room_participants')
        .delete()
        .eq('session_id', sessionId)
        .eq('room_id', roomId);
    } else {
      return { success: false, error: 'Invalid user identification' };
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error('Error force leaving room:', error);
      return { success: false, error: error.message };
    }

    console.log(`User ${userId || sessionId} force removed from room ${roomId}: ${reason}`);
    return { success: true };

  } catch (error) {
    console.error('Failed to force leave room:', error);
    return { success: false, error: 'System error' };
  }
}

/**
 * Get tier-specific room limit information for UI display
 */
export function getTierRoomLimitsInfo(tier: UserTier): {
  maxRooms: number;
  description: string;
  upgradeMessage?: string;
} {
  const limits = getTierLimits(tier);
  const maxRooms = limits.concurrentRooms || 1;

  const descriptions = {
    anonymous: 'Anonymous users can join 1 room at a time',
    free: 'Free users can be in up to 3 rooms simultaneously',
    basic: 'Basic users can be in up to 5 rooms simultaneously',
    premium: 'Premium users can be in up to 15 rooms simultaneously'
  };

  const upgradeMessages = {
    anonymous: 'Sign up to join multiple rooms!',
    free: 'Upgrade to Basic for 5 concurrent rooms',
    basic: 'Upgrade to Premium for 15 concurrent rooms',
    premium: undefined
  };

  return {
    maxRooms,
    description: descriptions[tier],
    upgradeMessage: upgradeMessages[tier]
  };
}

/**
 * Singleton service class
 */
export class ConcurrentRoomLimiter {
  async checkLimit(
    userId: string | null,
    userTier: UserTier,
    targetRoomId?: string,
    sessionId?: string
  ): Promise<ConcurrentRoomCheckResult> {
    return checkConcurrentRoomLimit(userId, userTier, targetRoomId, sessionId);
  }

  async getCurrentRooms(userId: string | null, sessionId?: string) {
    return getCurrentRoomParticipation(userId, sessionId);
  }

  async forceLeave(
    userId: string | null,
    sessionId: string | null,
    roomId: string,
    reason: string
  ) {
    return forceLeaveRoom(userId, sessionId, roomId, reason);
  }

  getTierInfo(tier: UserTier) {
    return getTierRoomLimitsInfo(tier);
  }
}

// Export singleton instance
export const concurrentRoomLimiter = new ConcurrentRoomLimiter();