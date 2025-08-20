import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserInfo } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Delete room (only room creator can delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;

    // Get authenticated user
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get room information and verify ownership
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('id, created_by, name')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Only room creator can delete the room
    if (room.created_by !== userInfo.id) {
      return NextResponse.json({ error: 'Only room creator can delete the room' }, { status: 403 });
    }

    // Delete the room (CASCADE will handle related records)
    const { error: deleteError } = await (supabase as any)
      .from('rooms')
      .delete()
      .eq('id', room.id);

    if (deleteError) {
      console.error('Error deleting room:', deleteError);
      return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
    }

    // Emit Socket.IO event for room deletion
    try {
      const { getSocketIOInstance } = await import('@/lib/server/socketEmitter');
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${shareCode}`).emit('room-deleted', {
          shareCode,
          roomName: room.name,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Failed to emit room deletion event:', error);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Room "${room.name}" has been deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get room information
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;

    // Get room information
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select(`
        id,
        name,
        created_by,
        share_code,
        creator_tier,
        max_participants,
        created_at,
        expires_at,
        room_participants(
          session_id,
          display_name,
          joined_at,
          user_id
        )
      `)
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Check if room has expired
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
      return NextResponse.json({ error: 'Room has expired' }, { status: 410 });
    }

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        shareCode: room.share_code,
        createdBy: room.created_by,
        tier: room.creator_tier,
        maxParticipants: room.max_participants,
        createdAt: room.created_at,
        expiresAt: room.expires_at
      },
      participants: room.room_participants || []
    });
  } catch (error) {
    console.error('Error fetching room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}