import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/server/server';
import { getUserInfo } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // 1. Check if user is authenticated
    const userInfo = await getUserInfo();
    console.log('User Info:', userInfo);
    
    if (!userInfo) {
      return NextResponse.json({
        error: 'User not authenticated',
        authenticated: false
      }, { status: 401 });
    }

    // 2. Check if user exists in users table
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userInfo.id)
      .maybeSingle();

    // 3. Check for chat sessions
    const { data: chatSessions, error: chatError } = await supabase
      .from('chat_sessions')
      .select('id, created_at, chat_title, user_id')
      .eq('user_id', userInfo.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // 4. Check for documents
    const { data: documents, error: docsError } = await supabase
      .from('user_documents')
      .select('id, title, created_at, user_id')
      .eq('user_id', userInfo.id)
      .limit(5);

    // 5. Count total records
    const { count: sessionCount } = await supabase
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userInfo.id);

    const { count: messageCount } = await supabase
      .from('chat_messages')
      .select('*, chat_sessions!inner(user_id)', { count: 'exact', head: true })
      .eq('chat_sessions.user_id', userInfo.id);

    return NextResponse.json({
      authenticated: true,
      userId: userInfo.id,
      userEmail: userInfo.email,
      userRecord: userRecord,
      userRecordError: userError?.message,
      chatSessions: chatSessions,
      chatSessionsError: chatError?.message,
      documents: documents,
      documentsError: docsError?.message,
      counts: {
        sessions: sessionCount,
        messages: messageCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({
      error: 'Debug check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 