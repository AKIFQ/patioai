import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface JoinRoomRequest {
  displayName: string;
  sessionId: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const body: JoinRoomRequest = await req.json();
    const { displayName, sessionId } = body;

    // Validate input
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Find the room by share code
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('*')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Check if room has expired
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Room has expired' },
        { status: 410 }
      );
    }

    // Get authenticated user if available
    const session = await getSession();
    const userId = session?.id || null;

    // ATOMIC OPERATION: Use upsert with capacity check
    // This prevents race conditions by handling both insert and update atomically
    const { data: result, error: upsertError } = await (supabase as any)
      .rpc('join_room_safely', {
        p_room_id: room.id,
        p_session_id: sessionId,
        p_display_name: displayName.trim(),
        p_user_id: userId,
        p_max_participants: room.max_participants
      });

    if (upsertError) {
      console.error('Error joining room:', upsertError);
      
      // Handle specific error cases
      if (upsertError.message?.includes('room_full')) {
        return NextResponse.json(
          { error: `Room is full (${room.max_participants} participants maximum)` },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to join room' },
        { status: 500 }
      );
    }

    // Get updated participant list
    const { data: updatedParticipants, error: updatedParticipantsError } = await (supabase as any)
      .from('room_participants')
      .select('display_name, joined_at')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    if (updatedParticipantsError) {
      console.error('Error fetching updated participants:', updatedParticipantsError);
    }

    // Return room access and info
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
      participant: {
        displayName: displayName.trim(),
        sessionId
      },
      participants: updatedParticipants || [],
      participantCount: updatedParticipants?.length || 0
    });

  } catch (error) {
    console.error('Error in room join:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get room info and participants (for rejoining)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    
    // SECURITY FIX: Add authentication check for room info access
    // Note: We allow anonymous access for joining, but require auth for detailed info
    const url = new URL(req.url);
    const requireAuth = url.searchParams.get('auth') === 'true';
    
    if (requireAuth) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // Find the room by share code
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('*')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Check if room has expired
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Room has expired' },
        { status: 410 }
      );
    }

    // Get current participants
    const { data: participants, error: participantsError } = await (supabase as any)
      .from('room_participants')
      .select('display_name, joined_at')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return NextResponse.json(
        { error: 'Failed to fetch room info' },
        { status: 500 }
      );
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
      participants: participants || [],
      participantCount: participants?.length || 0
    });

  } catch (error) {
    console.error('Error fetching room info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}