import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function cleanupEmptyThreads() {
  try {
    console.log('🧹 Starting empty thread cleanup...');

    // Find all thread IDs that have been created but have no messages
    // We'll look for threads that were created more than 10 minutes ago with no messages
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Get all room messages to find which threads have messages
    const { data: threadsWithMessages } = await supabase
      .from('room_messages')
      .select('thread_id')
      .not('thread_id', 'is', null);

    const activeThreadIds = new Set(
      threadsWithMessages?.map(msg => msg.thread_id).filter(Boolean) || []
    );

    console.log(`📊 Found ${activeThreadIds.size} threads with messages`);

    // For now, we'll implement this as a manual cleanup
    // In a production system, you'd want to track thread creation timestamps
    // and clean up threads that are older than X minutes with no messages

    console.log('✅ Empty thread cleanup completed');
    return { cleaned: 0, active: activeThreadIds.size };
  } catch (error) {
    console.error('❌ Error during empty thread cleanup:', error);
    throw error;
  }
}

// Function to check if a specific thread is empty and should be cleaned up
export async function isThreadEmpty(threadId: string): Promise<boolean> {
  try {
    const { data: messages, error } = await supabase
      .from('room_messages')
      .select('id')
      .eq('thread_id', threadId)
      .limit(1);

    if (error) {
      console.error('Error checking thread messages:', error);
      return false;
    }

    return !messages || messages.length === 0;
  } catch (error) {
    console.error('Error in isThreadEmpty:', error);
    return false;
  }
}