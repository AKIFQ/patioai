import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Enable realtime for chat_messages table
    const { error: chatMessagesError } = await supabase.rpc('sql', {
      query: `
        DO $
        BEGIN
            BEGIN
                ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
            EXCEPTION WHEN duplicate_object THEN
                -- Table already in publication, skip
                NULL;
            END;
        END $;
      `
    });

    if (chatMessagesError) {
      console.error('Error enabling realtime for chat_messages:', chatMessagesError);
    }

    // Enable realtime for chat_sessions table
    const { error: chatSessionsError } = await supabase.rpc('sql', {
      query: `
        DO $
        BEGIN
            BEGIN
                ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
            EXCEPTION WHEN duplicate_object THEN
                -- Table already in publication, skip
                NULL;
            END;
        END $;
      `
    });

    if (chatSessionsError) {
      console.error('Error enabling realtime for chat_sessions:', chatSessionsError);
    }

    // Create indexes for better performance
    const { error: indexError } = await supabase.rpc('sql', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_chat_messages_realtime 
        ON chat_messages (chat_session_id, created_at DESC, id);
        
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_realtime 
        ON chat_sessions (user_id, created_at DESC, id);
      `
    });

    if (indexError) {
      console.error('Error creating indexes:', indexError);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Realtime enabled for chat tables',
      errors: {
        chatMessages: chatMessagesError?.message,
        chatSessions: chatSessionsError?.message,
        indexes: indexError?.message
      }
    });

  } catch (error) {
    console.error('Error enabling realtime:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}