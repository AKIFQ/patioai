import { type NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/supabase';
import { threadManager } from '@/lib/ai/threadManager';
import { userTierService } from '@/lib/ai/userTierService';
import { type UserTier } from '@/lib/limits/tierLimits';

export const dynamic = 'force-dynamic';

/**
 * Thread Management API
 * GET: Get thread status and warnings
 * POST: Perform thread actions (compress, new thread, etc.)
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const url = new URL(req.url);
    const chatSessionId = url.searchParams.get('chatSessionId');

    if (!chatSessionId) {
      return NextResponse.json({ error: 'Missing chatSessionId parameter' }, { status: 400 });
    }

    // Get user tier
    const userSubscription = await userTierService.getUserTier(session.id);
    const userTier = userSubscription.tier as UserTier;

    // Analyze thread status
    const threadStatus = await threadManager.analyzeThreadStatus(chatSessionId, userTier);
    const threadWarning = threadManager.generateThreadWarning(threadStatus, userTier);
    const threadStats = await threadManager.getThreadStats(chatSessionId);

    return NextResponse.json({
      status: threadStatus,
      warning: threadWarning,
      stats: threadStats,
      userTier,
      contextLimit: threadManager.getTierContextLimit(userTier)
    });

  } catch (error) {
    console.error('Error getting thread status:', error);
    return NextResponse.json(
      { error: 'Failed to get thread status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { action, chatSessionId, title } = body;

    if (!action || !chatSessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, chatSessionId' },
        { status: 400 }
      );
    }

    const userId = session.id;
    const userSubscription = await userTierService.getUserTier(userId);
    const userTier = userSubscription.tier as UserTier;

    switch (action) {
      case 'compress':
        // Only premium users can compress
        if (userTier !== 'premium') {
          return NextResponse.json(
            { 
              error: 'Context compression is a premium feature',
              upgradeRequired: true 
            },
            { status: 403 }
          );
        }

        const compressionResult = await threadManager.compressContext(chatSessionId, 0.5);
        
        return NextResponse.json({
          success: compressionResult.success,
          originalTokens: compressionResult.originalTokens,
          compressedTokens: compressionResult.compressedTokens,
          compressionRatio: compressionResult.compressionRatio,
          message: compressionResult.success 
            ? `Compressed ${compressionResult.originalTokens} tokens to ${compressionResult.compressedTokens} tokens (${Math.round(compressionResult.compressionRatio * 100)}% reduction)`
            : 'Compression failed'
        });

      case 'new_thread':
        const newThreadId = await threadManager.createNewThread(userId, title);
        
        return NextResponse.json({
          success: true,
          newThreadId,
          message: 'New conversation thread created'
        });

      case 'get_status':
        const threadStatus = await threadManager.analyzeThreadStatus(chatSessionId, userTier);
        const threadWarning = threadManager.generateThreadWarning(threadStatus, userTier);
        
        return NextResponse.json({
          status: threadStatus,
          warning: threadWarning,
          userTier
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: compress, new_thread, get_status' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in thread management:', error);
    return NextResponse.json(
      { error: 'Failed to perform thread action' },
      { status: 500 }
    );
  }
}