import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Message } from 'ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string; sessionId: string }> }
) {
  try {
    const { shareCode, sessionId } = await params;

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

    // Get messages for this specific chat session
    const { data: messages, error: messagesError } = await (supabase as any)
      .from('room_messages')
      .select('*')
      .eq('room_id', room.id)
      .eq('room_chat_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching room session messages:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json([]);
    }

    // Convert room messages to AI SDK Message format
    const formattedMessages: Message[] = [];

    for (const msg of messages) {
      if (msg.is_ai_response) {
        // AI message
        formattedMessages.push({
          id: msg.id,
          role: 'assistant',
          content: msg.content,
          createdAt: new Date(msg.created_at)
        });
      } else {
        // User message - format with sender name for room context
        formattedMessages.push({
          id: msg.id,
          role: 'user',
          content: `${msg.sender_name}: ${msg.content}`,
          createdAt: new Date(msg.created_at)
        });
      }
    }

    return NextResponse.json(formattedMessages);

  } catch (error) {
    console.error('Error in room session messages API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}