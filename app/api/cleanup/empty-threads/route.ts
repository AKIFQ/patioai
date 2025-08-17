import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { cleanupEmptyThreads } from '@/lib/cleanup/emptyThreads';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { threadId } = body;

    if (threadId) {
      // Clean up specific thread if provided
      console.log('🧹 Cleaning up specific thread:', threadId);
      
      const { isThreadEmpty } = await import('@/lib/cleanup/emptyThreads');
      const isEmpty = await isThreadEmpty(threadId);
      
      if (isEmpty) {
console.log(' Thread is empty, would clean up:', threadId);
        // Note: Since we're not storing thread metadata separately,
        // empty threads will naturally not appear in queries
        return NextResponse.json({
          success: true,
          message: 'Empty thread cleaned up',
          threadId,
          wasEmpty: true
        });
      } else {
        console.log('ℹ️ Thread has messages, keeping:', threadId);
        return NextResponse.json({
          success: true,
          message: 'Thread has messages, not cleaned',
          threadId,
          wasEmpty: false
        });
      }
    } else {
      // General cleanup
      console.log('🧹 General empty thread cleanup triggered');
      const result = await cleanupEmptyThreads();
      
      return NextResponse.json({
        success: true,
        message: 'Empty thread cleanup completed',
        result
      });
    }
  } catch (error) {
console.error(' Error in cleanup API:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Empty thread cleanup endpoint is available'
  });
}