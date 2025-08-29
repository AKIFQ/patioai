import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const { searchParams } = new URL(request.url);
    const displayName = searchParams.get('displayName');

    if (!displayName) {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }

    // Get room info
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, share_code')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Check if user is a participant in the room
    const { data: participant } = await supabase
      .from('room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('display_name', displayName)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: 'User is not a participant in this room' },
        { status: 403 }
      );
    }

    // Get all messages for this room, grouped by thread
    const { data: messages, error: messagesError } = await supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching room messages:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch room messages' },
        { status: 500 }
      );
    }

    // Group messages by thread_id and find the first user message for each thread
    const threadMap = new Map();
    const threadLatestTimes = new Map();

    (messages || []).forEach((msg: any) => {
      if (msg.thread_id) {
        // Track the first user message for each thread
        if (!msg.is_ai_response && !threadMap.has(msg.thread_id)) {
          threadMap.set(msg.thread_id, msg);
        }
        
        // Track latest message time for each thread
        const currentLatest = threadLatestTimes.get(msg.thread_id);
        if (!currentLatest || new Date(msg.created_at) > new Date(currentLatest)) {
          threadLatestTimes.set(msg.thread_id, msg.created_at);
        }
      }
    });

    // Convert to thread format
    const threads = Array.from(threadMap.entries()).map(([threadId, firstMsg]) => {
      // Use the first few words of the first user message as the title
      let title = 'New Chat';
      if (firstMsg.content) {
        const words = firstMsg.content.trim().split(/\s+/);
        title = words.slice(0, 4).join(' ');
        if (title.length > 30) {
          title = title.substring(0, 30) + '...';
        }
      }

      return {
        threadId,
        firstMessage: title,
        createdAt: firstMsg.created_at,
        senderName: firstMsg.sender_name,
        latestActivity: threadLatestTimes.get(threadId) || firstMsg.created_at
      };
    });

    // Sort by latest activity
    threads.sort((a, b) => 
      new Date(b.latestActivity).getTime() - new Date(a.latestActivity).getTime()
    );

    return NextResponse.json({
      threads,
      room: {
        id: room.id,
        name: room.name,
        shareCode: room.share_code
      }
    });

  } catch (error) {
    console.error('Error in threads API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}