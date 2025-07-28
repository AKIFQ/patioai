import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/server/supabase';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/server/server';

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
    
    // CRITICAL: Add authentication check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // CRITICAL: Add rate limiting to prevent abuse
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1m') // 60 requests per minute
    });

    const { success, limit, reset, remaining } = await ratelimit.limit(
      `room_sessions_${session.id}_${shareCode}`
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': new Date(reset * 1000).toISOString()
          }
        }
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

    // PERFORMANCE FIX: Get all first messages in single query instead of N+1
    const sessionIds = (sessions || []).map(s => s.id);
    let firstMessages: { [key: string]: string } = {};
    
    if (sessionIds.length > 0) {
      const { data: messagesData } = await (supabase as any)
        .from('room_messages')
        .select('room_chat_session_id, content')
        .in('room_chat_session_id', sessionIds)
        .eq('is_ai_response', false)
        .order('created_at', { ascending: true });
      
      // Group by session ID and take first message
      if (messagesData) {
        messagesData.forEach((msg: any) => {
          if (!firstMessages[msg.room_chat_session_id]) {
            firstMessages[msg.room_chat_session_id] = msg.content;
          }
        });
      }
    }

    // Build sessions with first messages
    const chatSessions = (sessions || []).map((session: any) => ({
      id: session.id,
      firstMessage: session.chat_title || firstMessages[session.id] || 'New conversation',
      created_at: session.created_at,
      displayName: session.display_name,
      type: 'room',
      roomName: room.name,
      shareCode: shareCode
    }));

    // MEMORY FIX: Limit legacy messages to prevent memory exhaustion
    const { data: legacyMessages, error: legacyError } = await (supabase as any)
      .from('room_messages')
      .select('id, sender_name, content, created_at')
      .eq('room_id', room.id)
      .is('room_chat_session_id', null)
      .eq('is_ai_response', false)
      .order('created_at', { ascending: true })
      .limit(100); // CRITICAL: Prevent memory exhaustion

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
          id: `legacy_${room.id}_${encodeURIComponent(senderName)}`, // Virtual ID for legacy messages (URL encoded)
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
    // MONITORING: Enhanced error logging
    console.error('CRITICAL ERROR in room sessions API:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      shareCode,
      userId: session?.id,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}