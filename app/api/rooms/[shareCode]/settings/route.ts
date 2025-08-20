import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserInfo } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Update room settings (name, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const body = await request.json();
    const { name } = body;

    // Get authenticated user
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is the room creator
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('id, created_by, name')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (room.created_by !== userInfo.id) {
      return NextResponse.json({ error: 'Only room creator can update settings' }, { status: 403 });
    }

    // Update room name
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return NextResponse.json({ error: 'Room name cannot be empty' }, { status: 400 });
      }

      if (name.trim().length > 100) {
        return NextResponse.json({ error: 'Room name too long' }, { status: 400 });
      }

      const { error: updateError } = await (supabase as any)
        .from('rooms')
        .update({ name: name.trim() })
        .eq('id', room.id);

      if (updateError) {
        console.error('Error updating room name:', updateError);
        return NextResponse.json({ error: 'Failed to update room name' }, { status: 500 });
      }
    }

    // Emit Socket.IO event for room settings update
    try {
      const { getSocketIOInstance } = await import('@/lib/server/socketEmitter');
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${shareCode}`).emit('room-settings-updated', {
          shareCode,
          name: name?.trim(),
          timestamp: new Date().toISOString()
        });
      }
    } catch (socketError) {
      console.warn('Failed to emit Socket.IO event for room settings update:', socketError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating room settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}