import { type NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/supabase';
import { createClient } from '@supabase/supabase-js';
import { tierRateLimiter } from '@/lib/limits/rateLimiter';
import { MessageGenerator } from '@/lib/notifications/messageGenerator';
import { type UserTier } from '@/lib/limits/tierLimits';
import { randomBytes } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limiting now handled by tier-based system

// Generate secure cryptographic share codes
function generateShareCode(): string {
  return randomBytes(6).toString('hex').toUpperCase(); // 12-character hex (48-bit)
}

async function getUserTier(userId: string): Promise<UserTier> {
  const { data, error } = await supabase
    .from('user_tiers')
    .select('tier')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return 'free';
  }
  
  return data.tier as UserTier;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      );
    }

    const userId = session.id;
    const userTier = await getUserTier(userId);
    
    // Check room creation rate limits
    const rateLimitCheck = await tierRateLimiter.check(userId, userTier, 'room_creation');
    
    if (!rateLimitCheck.allowed) {
      const notification = MessageGenerator.roomCreationLimitExceeded(userTier);
      
      return NextResponse.json(
        {
          ...notification,
          remaining: rateLimitCheck.remaining,
          type: 'rate_limit_exceeded'
        },
        { status: 429 }
      );
    }
    
    // SECURITY FIX: Check user's existing room count
    const { data: existingRooms, error: countError } = await supabase
      .from('rooms')
      .select('id')
      .eq('created_by', userId)
      .gt('expires_at', new Date().toISOString());
    
    if (countError) {
      console.error('Error checking existing rooms:', countError);
      return NextResponse.json(
        { error: 'Failed to check room limits' },
        { status: 500 }
      );
    }
    
    // Define tier-based room limits
    const tierLimits = {
      free: { maxRooms: 10, maxParticipants: 3, expirationDays: 7 },
      basic: { maxRooms: 25, maxParticipants: 8, expirationDays: 14 },
      premium: { maxRooms: 100, maxParticipants: 25, expirationDays: 30 }
    };
    
    const currentTierLimits = tierLimits[userTier];
    
    if (existingRooms && existingRooms.length >= currentTierLimits.maxRooms) {
      const notification = MessageGenerator.roomCreationLimitExceeded(userTier);
      
      return NextResponse.json(
        {
          ...notification,
          currentCount: existingRooms.length,
          maxAllowed: currentTierLimits.maxRooms,
          type: 'room_count_limit'
        },
        { status: 409 }
      );
    }
    
    // Set tier-based limits
    const maxParticipants = currentTierLimits.maxParticipants;
    const expirationDays = currentTierLimits.expirationDays;
    
    // Generate unique share code
    let shareCode = generateShareCode();
    let attempts = 0;
    const maxAttempts = 10;
    
    // Ensure share code is unique
    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from('rooms')
        .select('id')
        .eq('share_code', shareCode)
        .single();
      
      if (!existing) break;
      
      shareCode = generateShareCode();
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      const notification = MessageGenerator.genericError('Unable to generate unique room code. Please try again!');
      
      return NextResponse.json(
        notification,
        { status: 500 }
      );
    }

    // Create the room with auto-generated password
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        name: name.trim(),
        created_by: userId,
        share_code: shareCode,
        creator_tier: userTier,
        max_participants: maxParticipants,
        expires_at: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString(),
        password: null // Will be set by database trigger
      })
      .select('id, name, share_code, creator_tier, max_participants, expires_at, created_at, password, password_expires_at')
      .single();

    if (error) {
      console.error('Error creating room:', error);
      const notification = MessageGenerator.genericError('Room creation failed. Our team has been notified!');
      
      return NextResponse.json(
        notification,
        { status: 500 }
      );
    }

    // Return room details with shareable link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
    const shareableLink = `${baseUrl}/room/${shareCode}`;

    // Increment room creation counter after successful creation
    try {
      await tierRateLimiter.increment(userId, userTier, 'room_creation', 1);
    } catch (error) {
      console.warn('Failed to increment room creation counter:', error);
    }
    
    // Emit Socket.IO event for room creation
    try {
      const { emitSidebarRefresh } = await import('@/lib/server/socketEmitter');
      emitSidebarRefresh(userId);
    } catch (socketError) {
      console.warn('Failed to emit Socket.IO event for room creation:', socketError);
    }

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        shareCode: room.share_code,
        maxParticipants: room.max_participants,
        tier: room.creator_tier,
        expiresAt: room.expires_at,
        createdAt: room.created_at,
        password: room.password,
        passwordExpiresAt: room.password_expires_at
      },
      shareableLink
    });

  } catch (error) {
    console.error('Error in room creation:', error);
    const notification = MessageGenerator.genericError('Something went wrong creating your room. Please try again!');
    
    return NextResponse.json(
      notification,
      { status: 500 }
    );
  }
}