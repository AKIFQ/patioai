import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MemoryManager } from '@/lib/monitoring/memoryManager';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting aggressive cleanup...');
    const startTime = Date.now();
    const beforeMemory = process.memoryUsage().heapUsed;
    
    const results = {
      emptyThreads: 0,
      oldSessions: 0,
      abandonedConnections: 0,
      memoryFreed: 0,
      errors: [] as string[]
    };

    // 1. Clean up empty threads (more aggressive - last 2 hours)
    try {
      const { data: emptyThreads, error: threadsError } = await supabase
        .from('room_chat_sessions')
        .select('id, room_id, created_at')
        .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .limit(100);

      if (threadsError) throw threadsError;

      if (emptyThreads && emptyThreads.length > 0) {
        for (const thread of emptyThreads) {
          // Check if thread has any messages
          const { data: messages } = await supabase
            .from('room_messages')
            .select('id')
            .eq('room_chat_session_id', thread.id)
            .limit(1);

          if (!messages || messages.length === 0) {
            const { error: deleteError } = await supabase
              .from('room_chat_sessions')
              .delete()
              .eq('id', thread.id);

            if (!deleteError) {
              results.emptyThreads++;
console.log(` Deleted empty thread: ${thread.id}`);
            }
          }
        }
      }
    } catch (error) {
      results.errors.push(`Thread cleanup: ${error}`);
    }

    // 2. Clean up old chat sessions (more aggressive - last 24 hours)
    try {
      const { data: oldSessions, error: sessionsError } = await supabase
        .from('chat_sessions')
        .select('id, user_id, created_at')
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(50);

      if (sessionsError) throw sessionsError;

      if (oldSessions && oldSessions.length > 0) {
        for (const session of oldSessions) {
          // Check if session has any messages
          const { data: messages } = await supabase
            .from('chat_messages')
            .select('id')
            .eq('chat_session_id', session.id)
            .limit(1);

          if (!messages || messages.length === 0) {
            const { error: deleteError } = await supabase
              .from('chat_sessions')
              .delete()
              .eq('id', session.id);

            if (!deleteError) {
              results.oldSessions++;
console.log(` Deleted old session: ${session.id}`);
            }
          }
        }
      }
    } catch (error) {
      results.errors.push(`Session cleanup: ${error}`);
    }

    // 3. Clean up abandoned room participants
    try {
      const { data: abandonedParticipants, error: participantsError } = await supabase
        .from('room_participants')
        .select('id, room_id, user_id')
        .lt('joined_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .is('left_at', null)
        .limit(100);

      if (participantsError) throw participantsError;

      if (abandonedParticipants && abandonedParticipants.length > 0) {
        const participantIds = abandonedParticipants.map(p => p.id);
        
        const { error: updateError } = await supabase
          .from('room_participants')
          .update({ left_at: new Date().toISOString() })
          .in('id', participantIds);

        if (!updateError) {
          results.abandonedConnections = participantIds.length;
console.log(` Cleaned up ${participantIds.length} abandoned participants`);
        }
      }
    } catch (error) {
      results.errors.push(`Participant cleanup: ${error}`);
    }

    // 4. Trigger memory cleanup
    try {
      const memoryManager = MemoryManager.getInstance();
      const memoryResult = await memoryManager.forceCleanup();
      
      if (memoryResult.success) {
        results.memoryFreed = memoryResult.freedMemory;
console.log(` Memory cleanup freed ${Math.round(memoryResult.freedMemory / 1024 / 1024)}MB`);
      }
    } catch (error) {
      results.errors.push(`Memory cleanup: ${error}`);
    }

    // 5. Force garbage collection if available
    if (global.gc) {
      global.gc();
console.log(' Forced garbage collection');
    }

    const afterMemory = process.memoryUsage().heapUsed;
    const totalMemoryFreed = beforeMemory - afterMemory;
    const duration = Date.now() - startTime;

    console.log(`🧹 Aggressive cleanup completed in ${duration}ms`);
console.log(` Results: ${results.emptyThreads} threads, ${results.oldSessions} sessions, ${results.abandonedConnections} connections`);
console.log(` Total memory freed: ${Math.round(totalMemoryFreed / 1024 / 1024)}MB`);

    return NextResponse.json({
      success: true,
      results: {
        ...results,
        totalMemoryFreed,
        duration
      },
      message: `Aggressive cleanup completed: ${results.emptyThreads + results.oldSessions + results.abandonedConnections} items cleaned`
    });

  } catch (error) {
console.error(' Aggressive cleanup failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Aggressive cleanup failed',
        details: String(error)
      },
      { status: 500 }
    );
  }
}