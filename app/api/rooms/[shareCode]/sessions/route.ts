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

    // Get room chat sessions
    const { data: sessions, error: sessionsError } = await (supabase as any)
      .from('room_chat_sessions')
      .select('id, chat_title, created_at, display_name')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching room chat sessions:', sessionsError);
      return NextResponse.json(
        { error: 'Failed to fetch chat sessions' },
        { status: 500 }
      );
    }

    // Get first message for each session
    const chatSessions = await Promise.all((sessions || []).map(async (session: any) => {
      // Get first message for this session
      const { data: firstMessage } = await (supabase as any)
        .from('room_messages')
        .select('content')
        .eq('room_chat_session_id', session.id)
        .eq('is_ai_response', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      return {
        id: session.id,
        firstMessage: session.chat_title || firstMessage?.content || 'New conversation',
        created_at: session.created_at,
        displayName: session.display_name,
        type: 'room',
        roomName: room.name,
        shareCode: shareCode
      };
    }));

    // Also check for legacy messages (messages without session IDs) and create virtual sessions
    const { data: legacyMessages, error: legacyError } = await (supabase as any)
      .from('room_messages')
      .select('id, sender_name, content, created_at')
      .eq('room_id', room.id)
      .is('room_chat_session_id', null)
      .eq('is_ai_response', false)
      .order('created_at', { ascending: true });

    if (!legacyError && legacyMessages && legacyMessages.length > 0) {
      // Group legacy messages by sender and create virtual sessions
      const senderGroups: { [key: string]: any[] } = {};
      legacyMessages.forEach((msg: any) => {
        if (!senderGroups[msg.sender_name]) {
          senderGroups[msg.sender_name] = [];
        }
        senderGroups[msg.sender_name].push(msg);
      });

      // Create virtual sessions for each sender's messages
      Object.entries(senderGroups).forEach(([senderName, messages]) => {
        const firstMessage = messages[0];
        chatSessions.push({
          id: `legacy_${room.id}_${senderName}`, // Virtual ID for legacy messages
          firstMessage: firstMessage.content || 'Legacy conversation',
          created_at: firstMessage.created_at,
          displayName: senderName,
          type: 'room',
          roomName: room.name,
          shareCode: shareCode,
          isLegacy: true
        });
      });
    }

    // Sort all sessions by creation date
    chatSessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(chatSessions);

  } catch (error) {
    console.error('Error in room sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}