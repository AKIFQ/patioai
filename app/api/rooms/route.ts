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

    const url = new URL(request.url);
    const includeChats = url.searchParams.get('includeChats') === 'true';

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

    // If includeChats is requested, also fetch room chat data
    let roomChatsData: any[] = [];
    if (includeChats && roomsData.length > 0) {
      const userRoomIds = roomsData.map((room: any) => room.id);

      try {
        // Get all room messages to properly group by thread
        const { data, error } = await (supabase as any)
          .from('room_messages')
          .select(`
            id,
            created_at,
            content,
            sender_name,
            is_ai_response,
            room_id,
            thread_id
          `)
          .in('room_id', userRoomIds)
          .order('created_at', { ascending: true }); // Order by oldest first to get first message per thread

        roomChatsData = data || [];
      } catch (error) {
        // This is expected when RLS policies are working correctly
        roomChatsData = [];
      }
    }

    return NextResponse.json({ 
      rooms: roomsData,
      roomChatsData: includeChats ? roomChatsData : undefined
    });
  } catch (error) {
    console.error('Error in rooms API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}