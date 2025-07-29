import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserInfo } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get room chat sessions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;

    // Get room information
    const { data: room, error: roomError } = await (supabase as any)
      .from('rooms')
      .select('id, name')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Get all chat sessions for this room with their first message
    const { data: sessions, error: sessionsError } = await (supabase as any)
      .from('room_chat_sessions')
      .select(`
        id,
        display_name,
        chat_title,
        created_at,
        updated_at
      `)
      .eq('room_id', room.id)
      .order('updated_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching room sessions:', sessionsError);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // For each session, get the first user message to use as title
    const sessionsWithTitles = await Promise.all(
      (sessions || []).map(async (session: any) => {
        if (session.chat_title) {
          return {
            ...session,
            title: session.chat_title
          };
        }

        // Get first user message for this session
        const { data: firstMessage } = await (supabase as any)
          .from('room_messages')
          .select('content, sender_name')
          .eq('room_chat_session_id', session.id)
          .eq('is_ai_response', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        const title = firstMessage 
          ? firstMessage.content.substring(0, 50) + (firstMessage.content.length > 50 ? '...' : '')
          : `Chat by ${session.display_name}`;

        return {
          ...session,
          title
        };
      })
    );

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        shareCode: shareCode
      },
      sessions: sessionsWithTitles
    });

  } catch (error) {
    console.error('Error fetching room sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}