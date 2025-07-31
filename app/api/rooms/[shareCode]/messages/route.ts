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
    
    // SECURITY FIX: Add authentication check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find the room by share code
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('id, name')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Get room messages (last 50 messages)
    const { data: messages, error: messagesError } = await (supabase as any)
      .from('room_messages')
      .select('id, sender_name, content, is_ai_response, created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (messagesError) {
      console.error('Error fetching room messages:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // Transform messages for chat history display
    const chatHistory = (messages || []).reverse().map((msg: any) => ({
      id: msg.id,
      content: msg.is_ai_response ? msg.content : `${msg.sender_name}: ${msg.content}`,
      isAI: msg.is_ai_response,
      senderName: msg.sender_name,
      timestamp: msg.created_at,
      created_at: msg.created_at
    }));

    return NextResponse.json(chatHistory);

  } catch (error) {
    console.error('Error in room messages API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}