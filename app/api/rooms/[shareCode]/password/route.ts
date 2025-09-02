import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.id;

    // Get room info to check if user is admin
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, created_by, password')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Check if user is the room creator/admin
    if (room.created_by !== userId) {
      return NextResponse.json(
        { error: 'Access denied. Only room admin can view password.' },
        { status: 403 }
      );
    }

    // Return current password info (no expiry info)
    return NextResponse.json({
      password: room.password
    });

  } catch (error) {
    console.error('Error fetching room password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.id;

    // Get room info to check if user is admin
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, created_by')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Check if user is the room creator/admin
    if (room.created_by !== userId) {
      return NextResponse.json(
        { error: 'Access denied. Only room admin can regenerate password.' },
        { status: 403 }
      );
    }

    // Generate new password manually
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let newPassword = '';
    for (let i = 0; i < 8; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Update room with new password (no expiry tracking)
    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({
        password: newPassword
      })
      .eq('id', room.id)
      .select('password')
      .single();

    if (updateError || !updatedRoom) {
      console.error('Error updating room password:', updateError);
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Notify existing room participants about password change
    try {
      const { getSocketIOInstance } = await import('@/lib/server/socketEmitter');
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${shareCode}`).emit('password-changed', {
          message: 'Room password has been updated by the room creator',
          newPassword: updatedRoom.password, // Only for existing participants
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Failed to emit password change notification:', error);
    }

    // Return the new password info
    return NextResponse.json({
      password: updatedRoom.password,
      message: 'Password regenerated successfully'
    });

  } catch (error) {
    console.error('Error regenerating password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 