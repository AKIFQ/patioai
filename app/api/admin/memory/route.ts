import { NextRequest, NextResponse } from 'next/server';
import { memoryMonitor } from '@/lib/monitoring/memoryMonitor';
import { memoryProfiler } from '@/lib/monitoring/memoryProfiler';
import { safeCleanup } from '@/lib/monitoring/safeCleanup';
import EmergencyMemoryCleanup from '@/lib/utils/memoryCleanup';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';

    const currentStats = memoryMonitor.getCurrentStats();
    const memoryHistory = memoryMonitor.getMemoryHistory();
    const status = EmergencyMemoryCleanup.getMemoryStatus();

    const response: any = {
      current: {
        heapUsed: Math.round(currentStats.heapUsed / 1024 / 1024),
        heapTotal: Math.round(currentStats.heapTotal / 1024 / 1024),
        rss: Math.round(currentStats.rss / 1024 / 1024),
        external: Math.round(currentStats.external / 1024 / 1024),
        arrayBuffers: Math.round(currentStats.arrayBuffers / 1024 / 1024)
      },
      status: status.status,
      recommendation: status.recommendation,
      history: memoryHistory.slice(-20).map(stat => ({
        heapUsed: Math.round(stat.heapUsed / 1024 / 1024),
        timestamp: Date.now() // Approximate
      })),
      uptime: Math.round(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      isCritical: memoryMonitor.isMemoryCritical(),
      isHigh: memoryMonitor.isMemoryHigh()
    };

    // Add detailed analysis if requested
    if (detailed) {
      const memoryObjects = memoryProfiler.analyzeMemoryUsage();
      response.detailed = {
        objects: memoryObjects.map(obj => ({
          name: obj.name,
          type: obj.type,
          sizeMB: Math.round(obj.size / 1024 / 1024 * 100) / 100,
          sizeKB: Math.round(obj.size / 1024),
          count: obj.count,
          location: obj.location,
          examples: obj.examples.slice(0, 2) // Limit examples for API response
        })),
        report: memoryProfiler.generateMemoryReport()
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Memory API error:', error);
    return NextResponse.json(
      { error: 'Failed to get memory stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    switch (action) {
      case 'gc':
        const gcResult = memoryMonitor.forceGarbageCollection();
        return NextResponse.json({
          success: gcResult,
          message: gcResult ? 'Garbage collection completed' : 'Garbage collection not available'
        });

      case 'emergency-cleanup':
        // Run emergency cleanup in background
        EmergencyMemoryCleanup.performEmergencyCleanup().catch(error => {
          console.error('Emergency cleanup failed:', error);
        });
        
        return NextResponse.json({
          success: true,
          message: 'Emergency cleanup started in background'
        });

      case 'status':
        const status = EmergencyMemoryCleanup.getMemoryStatus();
        return NextResponse.json(status);

      case 'analyze':
        // Generate detailed memory analysis
        const memoryObjects = memoryProfiler.analyzeMemoryUsage();
        const report = memoryProfiler.generateMemoryReport();
        
        // Also log to server console for debugging
        console.log('\n🔍 MEMORY ANALYSIS REQUESTED');
        memoryProfiler.logMemoryReport();
        
        return NextResponse.json({
          success: true,
          analysis: memoryObjects,
          report,
          timestamp: new Date().toISOString()
        });

      case 'safe-cleanup':
        // Trigger safe cleanup (only monitoring data)
        const cleanupStats = await safeCleanup.triggerManualCleanup();
        return NextResponse.json({
          success: true,
          message: 'Safe cleanup completed',
          stats: cleanupStats
        });

      case 'emergency-safe-cleanup':
        // More aggressive but still safe cleanup
        const emergencyStats = await safeCleanup.emergencyCleanup();
        return NextResponse.json({
          success: true,
          message: 'Emergency safe cleanup completed',
          stats: emergencyStats
        });

      case 'cleanup-status':
        // Get cleanup system status
        const lastStats = safeCleanup.getLastStats();
        const lastCleanup = safeCleanup.getLastCleanupTime();
        const isRunning = safeCleanup.isCleanupRunning();
        
        return NextResponse.json({
          success: true,
          isRunning,
          lastCleanup,
          lastStats,
          history: safeCleanup.getCleanupHistory().slice(-10) // Last 10 cleanups
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: gc, emergency-cleanup, status, analyze, safe-cleanup, emergency-safe-cleanup, or cleanup-status' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Memory action error:', error);
    return NextResponse.json(
      { error: 'Failed to perform memory action' },
      { status: 500 }
    );
  }
}