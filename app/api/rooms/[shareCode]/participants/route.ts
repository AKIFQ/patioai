import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserInfo } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Remove participant from room
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Get authenticated user
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get room information
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('id, created_by')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Get participant information
    const { data: participant, error: participantError } = await (supabase as any)
      .from('room_participants')
      .select('session_id, user_id, display_name')
      .eq('room_id', room.id)
      .eq('session_id', sessionId)
      .single();

    if (participantError || !participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    // Check permissions:
    // 1. Room creator can remove anyone (except themselves)
    // 2. Users can remove themselves
    const isCreator = room.created_by === userInfo.id;
    const isOwnSession = participant.user_id === userInfo.id;

    if (!isCreator && !isOwnSession) {
      return NextResponse.json({ error: 'Not authorized to remove this participant' }, { status: 403 });
    }

    // Prevent creator from removing themselves (they should delete the room instead)
    if (isCreator && isOwnSession) {
      return NextResponse.json({ error: 'Room creator cannot leave the room. Delete the room instead.' }, { status: 400 });
    }

    // Add user to removed participants list BEFORE deleting from participants
    const { error: removeError } = await (supabase as any)
      .from('removed_room_participants')
      .insert({
        room_id: room.id,
        removed_user_id: participant.user_id,
        removed_session_id: participant.session_id,
        removed_display_name: participant.display_name,
        removed_by: userInfo.id,
        reason: 'removed_by_creator'
      });

    if (removeError) {
      console.error('Error tracking participant removal:', removeError);
      return NextResponse.json({ error: 'Failed to track participant removal' }, { status: 500 });
    }

    // Remove participant from room
    const { error: deleteError } = await (supabase as any)
      .from('room_participants')
      .delete()
      .eq('room_id', room.id)
      .eq('session_id', sessionId);

    if (deleteError) {
      console.error('Error removing participant:', deleteError);
      return NextResponse.json({ error: 'Failed to remove participant' }, { status: 500 });
    }

    // Get updated participant list for the event
    const { data: updatedParticipants } = await (supabase as any)
      .from('room_participants')
      .select('session_id, display_name, joined_at, user_id')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    // Emit Socket.IO event for participant removal with updated participant list
    try {
      const { getSocketIOInstance } = await import('@/lib/server/socketEmitter');
      const io = getSocketIOInstance();
      if (io) {
        // Force disconnect the removed user from the room
        const sockets = await io.in(`room:${shareCode}`).fetchSockets();
        for (const socket of sockets) {
          // Check if this socket belongs to the removed user
          if ((socket as any).userId === participant.user_id || 
              (socket as any).sessionId === sessionId) {
console.log(` Forcing disconnect for removed user: ${participant.display_name}`);
            socket.leave(`room:${shareCode}`);
            socket.emit('room-error', { 
              error: 'REMOVED_FROM_ROOM',
              roomName: 'Room' // Will be filled by frontend
            });
          }
        }

        // Emit removal event
        io.to(`room:${shareCode}`).emit('user-removed-from-room', {
          removedUser: {
            displayName: participant.display_name,
            sessionId,
            userId: participant.user_id
          },
          shareCode,
          timestamp: new Date().toISOString(),
          updatedParticipants: updatedParticipants || [],
          participantCount: (updatedParticipants || []).length
        });

        // Also emit the legacy event for backward compatibility
        io.to(`room:${shareCode}`).emit('user-left-room', {
          displayName: participant.display_name,
          sessionId,
          shareCode,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Failed to emit participant removal event:', error);
    }

    // Also remove any chat sessions for this participant
    const { error: sessionDeleteError } = await (supabase as any)
      .from('room_chat_sessions')
      .delete()
      .eq('room_id', room.id)
      .eq('session_id', sessionId);

    if (sessionDeleteError) {
      console.error('Error removing chat sessions:', sessionDeleteError);
      // Don't fail the request for this, just log it
    }

    return NextResponse.json({ 
      success: true, 
      message: `${participant.display_name} has been removed from the room` 
    });
  } catch (error) {
    console.error('Error removing participant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get room participants (optional endpoint for future use)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;

    // Get room information
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('id, name, max_participants, creator_tier')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Get participants
    const { data: participants, error: participantsError } = await (supabase as any)
      .from('room_participants')
      .select('session_id, display_name, joined_at, user_id')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 500 });
    }

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        maxParticipants: room.max_participants,
        tier: room.creator_tier
      },
      participants: participants || []
    });
  } catch (error) {
    console.error('Error fetching participants:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}