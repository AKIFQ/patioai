import { NextRequest, NextResponse } from 'next/server';
import { APICache } from '@/lib/cache/apiCache';
import { CacheManager } from '@/lib/cache/cacheManager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const format = searchParams.get('format') || 'json';

    const apiCache = APICache.getInstance();
    const cacheManager = CacheManager.getInstance();

    let response: any = {};

    switch (type) {
      case 'api':
        response = await apiCache.getCacheStats();
        break;
      case 'memory':
        response = cacheManager.getStats();
        break;
      case 'health':
        response = { healthy: true, message: 'Cache system operational' };
        break;
      case 'all':
      default:
        const [apiStats, memoryStats, health] = await Promise.all([
          apiCache.getCacheStats(),
          Promise.resolve(cacheManager.getStats()),
          Promise.resolve({ healthy: true, message: 'Cache system operational' })
        ]);

        response = {
          api: apiStats,
          memory: memoryStats,
          health,
          timestamp: new Date().toISOString()
        };
        break;
    }

    if (format === 'text') {
      return new NextResponse(
        formatCacheStatsAsText(response),
        { 
          headers: { 'Content-Type': 'text/plain' },
          status: 200 
        }
      );
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json(
      { error: 'Failed to get cache statistics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, pattern } = await request.json();
    const apiCache = APICache.getInstance();
    const cacheManager = CacheManager.getInstance();

    let result: any = {};

    switch (action) {
      case 'warm':
        await apiCache.warmCache();
        result = { message: 'Cache warming initiated', timestamp: new Date().toISOString() };
        break;

      case 'clear':
        if (pattern) {
          const cleared = await cacheManager.invalidatePattern(pattern);
          result = { message: `Cleared ${cleared} entries matching pattern`, pattern, cleared };
        } else {
          await cacheManager.clear();
          result = { message: 'All cache cleared', timestamp: new Date().toISOString() };
        }
        break;

      case 'cleanup':
        const cleaned = await cacheManager.cleanup();
        result = { message: `Cleaned up ${cleaned} expired entries`, cleaned };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: warm, clear, cleanup' },
          { status: 400 }
        );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error performing cache action:', error);
    return NextResponse.json(
      { error: 'Failed to perform cache action' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pattern = searchParams.get('pattern');
    const userId = searchParams.get('userId');

    const apiCache = APICache.getInstance();
    let cleared = 0;

    if (userId) {
      cleared = await apiCache.invalidateUserCache(userId);
    } else if (pattern) {
      const cacheManager = CacheManager.getInstance();
      cleared = await cacheManager.invalidatePattern(pattern);
    } else {
      return NextResponse.json(
        { error: 'Either pattern or userId parameter is required' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: `Invalidated ${cleared} cache entries`,
      cleared,
      pattern: pattern || `user:${userId}`,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}

function formatCacheStatsAsText(stats: any): string {
  if (stats.api) {
    // Full stats format
    return `Cache Statistics
==================

API Cache:
  Metadata - Hits: ${stats.api.metadata.hits}, Misses: ${stats.api.metadata.misses}, Hit Rate: ${stats.api.metadata.hitRate}%
  Search - Hits: ${stats.api.search.hits}, Misses: ${stats.api.search.misses}, Hit Rate: ${stats.api.search.hitRate}%
  AI - Hits: ${stats.api.ai.hits}, Misses: ${stats.api.ai.misses}, Hit Rate: ${stats.api.ai.hitRate}%
  Document - Hits: ${stats.api.document.hits}, Misses: ${stats.api.document.misses}, Hit Rate: ${stats.api.document.hitRate}%

Memory Cache:
  Total Operations: ${stats.memory.overall.totalOperations}
  Success Rate: ${stats.memory.overall.successRate}
  Average Duration: ${stats.memory.overall.averageDuration}

System Health: ${stats.health.healthy ? 'HEALTHY' : 'ISSUES DETECTED'}
Issues: ${stats.health.issues.join(', ') || 'None'}
Recommendations: ${stats.health.recommendations.join(', ') || 'None'}

Generated: ${stats.timestamp}`;
  } else {
    // Single type format
    return JSON.stringify(stats, null, 2);
  }
}