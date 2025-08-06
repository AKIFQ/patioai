import { NextRequest, NextResponse } from 'next/server';
import { CacheManager } from '@/lib/cache/cacheManager';
import { APICache } from '@/lib/cache/apiCache';
import { createRedisCache } from '@/lib/cache/redisCache';

export async function POST(request: NextRequest) {
  try {
    const { type = 'all' } = await request.json().catch(() => ({}));
    
    const results: any = {
      timestamp: new Date().toISOString(),
      memoryBefore: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      cleanupResults: {}
    };

    // Clean up different cache types
    if (type === 'all' || type === 'memory') {
      const cacheManager = CacheManager.getInstance();
      const cleaned = await cacheManager.cleanup();
      results.cleanupResults.memory = { cleaned };
    }

    if (type === 'all' || type === 'api') {
      const apiCache = APICache.getInstance();
      const cleared = await apiCache.invalidateUserCache('*');
      results.cleanupResults.api = { cleared };
    }

    if (type === 'all' || type === 'redis') {
      const redisCache = createRedisCache();
      const cleared = await redisCache.clear();
      results.cleanupResults.redis = { cleared };
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      results.gcTriggered = true;
    }

    results.memoryAfter = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    results.memoryFreed = results.memoryBefore - results.memoryAfter;

    console.log(`Cache cleanup completed: freed ${results.memoryFreed}MB`);

    return NextResponse.json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('Cache cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const memory = process.memoryUsage();
    const cacheManager = CacheManager.getInstance();
    const redisCache = createRedisCache();
    
    const stats = {
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024)
      },
      cache: {
        memory: cacheManager.getStats(),
        redis: await redisCache.getStats()
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(stats);

  } catch (error) {
    console.error('Cache stats error:', error);
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}