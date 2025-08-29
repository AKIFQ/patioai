import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const url = new URL(req.url);
    const displayName = url.searchParams.get('displayName');

    if (!displayName) {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }

    // Get room info
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, share_code, expires_at')
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

    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('display_name', displayName.trim())
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: 'Not a participant in this room' },
        { status: 403 }
      );
    }

    // Get all threads for this room with their first messages
    const { data: threads, error: threadsError } = await supabase
      .from('room_messages')
      .select(`
        thread_id,
        content,
        sender_name,
        created_at,
        is_ai_response
      `)
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
      return NextResponse.json(
        { error: 'Failed to fetch threads' },
        { status: 500 }
      );
    }

    // Group messages by thread and get first message of each thread
    const threadMap = new Map();
    
    threads?.forEach((message) => {
      if (!threadMap.has(message.thread_id)) {
        threadMap.set(message.thread_id, {
          threadId: message.thread_id,
          firstMessage: message.content,
          senderName: message.sender_name,
          createdAt: message.created_at,
          messageCount: 0
        });
      }
      threadMap.get(message.thread_id).messageCount++;
    });

    const threadList = Array.from(threadMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        shareCode: room.share_code
      },
      threads: threadList
    });

  } catch (error) {
    console.error('Error in room threads API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
