import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserInfo } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get user's rooms
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get rooms with accurate participant counts using database function
    let roomsData: any[] = [];

    try {
      const { data, error } = await (supabase as any)
        .rpc('get_user_rooms_with_counts', {
          user_id_param: userInfo.id
        });

      if (data && Array.isArray(data)) {
        roomsData = data
          .filter((room: any) => room.room_id) // Filter out any null/invalid rooms
          .map((room: any) => ({
            id: room.room_id,
            name: room.room_name,
            shareCode: room.share_code,
            participantCount: room.participant_count,
            maxParticipants: room.max_participants,
            tier: room.creator_tier as 'free' | 'pro',
            expiresAt: room.expires_at,
            createdAt: room.created_at,
            isCreator: room.is_creator !== undefined ? room.is_creator : (room.created_by === userInfo.id)
          }));
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      roomsData = [];
    }

    return NextResponse.json({ rooms: roomsData });
  } catch (error) {
    console.error('Error in rooms API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}