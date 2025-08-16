import { type NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/supabase';
import { createClient } from '@supabase/supabase-js';
// Rate limiting removed - using new tier-based system
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

async function getUserTier(userId: string): Promise<'free' | 'pro'> {
  const { data, error } = await supabase
    .from('user_tiers')
    .select('tier')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    // Default to free tier if no record exists
    return 'free';
  }
  
  return data.tier as 'free' | 'pro';
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
    
    // No legacy rate limiting
    const userTier = await getUserTier(userId);
    
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
    
    const maxRooms = userTier === 'pro' ? 50 : 10;
    if (existingRooms && existingRooms.length >= maxRooms) {
      return NextResponse.json(
        { error: `Room limit reached (${maxRooms} active rooms maximum for ${userTier} tier)` },
        { status: 409 }
      );
    }
    
    // Set tier-based limits
    const maxParticipants = userTier === 'pro' ? 20 : 5;
    const expirationDays = userTier === 'pro' ? 30 : 7;
    
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
      return NextResponse.json(
        { error: 'Failed to generate unique share code' },
        { status: 500 }
      );
    }

    // Create the room
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        name: name.trim(),
        created_by: userId,
        share_code: shareCode,
        creator_tier: userTier,
        max_participants: maxParticipants,
        expires_at: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating room:', error);
      return NextResponse.json(
        { error: 'Failed to create room' },
        { status: 500 }
      );
    }

    // Return room details with shareable link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
    const shareableLink = `${baseUrl}/room/${shareCode}`;

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
        createdAt: room.created_at
      },
      shareableLink
    });

  } catch (error) {
    console.error('Error in room creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}