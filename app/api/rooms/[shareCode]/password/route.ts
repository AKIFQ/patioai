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
      .select('id, created_by, password, password_expires_at, password_generated_at')
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

    // Check if password has expired
    const isExpired = room.password_expires_at < new Date();
    
    // If password is expired, regenerate it
    if (isExpired) {
      const { data: updatedRoom, error: updateError } = await supabase
        .rpc('regenerate_expired_passwords')
        .eq('id', room.id);

      if (updateError) {
        console.error('Error regenerating password:', updateError);
        return NextResponse.json(
          { error: 'Failed to regenerate password' },
          { status: 500 }
        );
      }

      // Fetch the updated room data
      const { data: refreshedRoom, error: refreshError } = await supabase
        .from('rooms')
        .select('id, password, password_expires_at, password_generated_at')
        .eq('id', room.id)
        .single();

      if (refreshError || !refreshedRoom) {
        return NextResponse.json(
          { error: 'Failed to fetch updated password' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        password: refreshedRoom.password,
        expiresAt: refreshedRoom.password_expires_at,
        generatedAt: refreshedRoom.password_generated_at,
        isExpired: false,
        message: 'Password has been regenerated'
      });
    }

    // Return current password info
    return NextResponse.json({
      password: room.password,
      expiresAt: room.password_expires_at,
      generatedAt: room.password_generated_at,
      isExpired: false,
      timeUntilExpiry: new Date(room.password_expires_at).getTime() - Date.now()
    });

  } catch (error) {
    console.error('Error fetching room password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 