import { type NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Generate human-readable share codes
function generateShareCode(roomName?: string): string {
  const adjectives = ['SUNNY', 'HAPPY', 'BRIGHT', 'COOL', 'SMART', 'QUICK', 'BOLD', 'CALM'];
  const nouns = ['CHAT', 'ROOM', 'SPACE', 'TALK', 'MEET', 'GROUP', 'TEAM', 'CLUB'];
  const years = ['2024', '2025'];
  
  if (roomName) {
    // Convert room name to share code format
    const cleanName = roomName
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 20);
    
    const year = years[Math.floor(Math.random() * years.length)];
    return `${cleanName}-${year}`;
  }
  
  // Generate random code
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const year = years[Math.floor(Math.random() * years.length)];
  
  return `${adj}-${noun}-${year}`;
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
    const userTier = await getUserTier(userId);
    
    // Set tier-based limits
    const maxParticipants = userTier === 'pro' ? 20 : 5;
    const expirationDays = userTier === 'pro' ? 30 : 7;
    
    // Generate unique share code
    let shareCode = generateShareCode(name);
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
      
      shareCode = generateShareCode(name) + `-${Math.floor(Math.random() * 100)}`;
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
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const shareableLink = `${baseUrl}/room/${shareCode}`;

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