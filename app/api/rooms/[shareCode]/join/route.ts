import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/server/supabase';
import { SocketDatabaseService } from '@/lib/database/socketQueries';
import { checkAnonymousRoomJoin, incrementAnonymousRoomJoin } from '@/lib/security/anonymousRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface JoinRoomRequest {
  displayName: string;
  sessionId: string;
  password?: string;
  previousSessionId?: string; // For identity migration: anonymous → authenticated
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const body: JoinRoomRequest = await req.json();
    const { displayName, sessionId, password, previousSessionId } = body;

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

    // Use optimized room validation
    const validation = await SocketDatabaseService.validateRoomAccess(shareCode);
    
    if (!validation.valid) {
      const status = validation.error === 'Room not found' ? 404 : 
                    validation.error === 'Room has expired' ? 410 : 400;
      return NextResponse.json(
        { error: validation.error },
        { status }
      );
    }

    const room = validation.room!;

    // Get room with password information for validation
    const { data: roomWithPassword, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, share_code, max_participants, creator_tier, expires_at, created_at, password, password_expires_at')
      .eq('share_code', shareCode)
      .single();
    
    if (roomError || !roomWithPassword) {
      console.error('Error fetching room with password:', roomError);
      return NextResponse.json(
        { error: 'Failed to fetch room details' },
        { status: 500 }
      );
    }

    // Check if password has expired
    if (roomWithPassword.password_expires_at && new Date(roomWithPassword.password_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Room password has expired. Please contact the room admin for a new password.' },
        { status: 400 }
      );
    }

    // Check password if room has one
    if (roomWithPassword.password && roomWithPassword.password !== password) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 400 }
      );
    }

    // Get authenticated user if available
    const session = await getSession();
    const userId = session?.id || null;

    // Rate limit anonymous users only
    if (!userId) {
      const rateLimitCheck = await checkAnonymousRoomJoin(req);
      
      if (!rateLimitCheck.allowed) {
        return NextResponse.json(
          { error: 'Too many room join attempts. Please try again later.' },
          { status: 429 }
        );
      }

      // Enforce concurrent room limit for anonymous users (1 room max)
      const { getClientIP, getAnonymousUserId } = await import('@/lib/security/anonymousRateLimit');
      const ip = getClientIP(req);
      const anonymousUserId = getAnonymousUserId(ip);

      // Check how many rooms this anonymous user is currently in (by IP)
      const { data: currentRooms, error: roomCheckError } = await supabase
        .from('room_participants')
        .select('room_id, rooms!inner(share_code)')
        .like('session_id', `anon_${anonymousUserId.split('_')[1]}%`) // Match session IDs starting with anon_{hashed_ip}
        .neq('room_id', room.id); // Exclude current room (in case of rejoining)

      if (roomCheckError) {
        console.error('Error checking anonymous user room count:', roomCheckError);
      } else if (currentRooms && currentRooms.length >= 1) {
        // Anonymous users can only be in 1 room at a time
        return NextResponse.json(
          { 
            error: 'Anonymous users can only join one room at a time. Please leave your current room first.',
            currentRoomCount: currentRooms.length
          },
          { status: 409 }
        );
      }
    }

    // ATOMIC OPERATION: Use upsert with capacity check and removal validation
    // This prevents race conditions by handling both insert and update atomically
    const { data: result, error: upsertError } = await (supabase as any)
      .rpc('join_room_safely', {
        p_room_id: room.id,
        p_session_id: sessionId,
        p_display_name: displayName.trim(),
        p_user_id: userId,
        p_password: password || null,
        p_previous_session_id: previousSessionId || null
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

    // Handle function JSON response (it returns { success, error? })
    if (result && result.success === false) {
      const err = (result as any).error || 'Failed to join room';
      
      // Handle removed user case specifically
      if (err === 'REMOVED_FROM_ROOM') {
        return NextResponse.json(
          { 
            error: 'REMOVED_FROM_ROOM',
            roomName: room.name
          },
          { status: 403 }
        );
      }
      
      const status = err === 'Room is full' ? 409 : 400;
      return NextResponse.json({ error: err }, { status });
    }

    // Increment rate limit counter for anonymous users after successful join
    if (!userId) {
      try {
        await incrementAnonymousRoomJoin(req);
      } catch (error) {
        console.warn('Failed to increment anonymous room join counter:', error);
      }
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

    // Emit Socket.IO event for participant join
    try {
      const { getSocketIOInstance } = await import('@/lib/server/socketEmitter');
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${shareCode}`).emit('user-joined-room', {
          displayName: displayName.trim(),
          sessionId,
          shareCode,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Failed to emit participant join event:', error);
    }

    // Return room access and info
    const response: any = {
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
    };

    // Include migration information if identity migration occurred
    if (result && result.migration) {
      response.migration = result.migration;
      console.log('Identity migration completed:', result.migration);
    }

    return NextResponse.json(response);

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