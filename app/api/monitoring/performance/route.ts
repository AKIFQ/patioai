import { NextRequest, NextResponse } from 'next/server';
import { PerformanceMonitor } from '@/lib/monitoring/performanceMonitor';

export async function GET(request: NextRequest) {
  try {
    const monitor = PerformanceMonitor.getInstance();
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation');
    const format = searchParams.get('format') || 'json';

    if (operation) {
      // Get metrics for specific operation
      const operationMetrics = monitor.getOperationMetrics(operation);
      
      if (format === 'text') {
        return new NextResponse(
          `Operation: ${operation}\n` +
          `Count: ${operationMetrics.count}\n` +
          `Average Duration: ${operationMetrics.averageDuration}ms\n` +
          `Success Rate: ${operationMetrics.successRate}%\n` +
          `Recent Errors: ${operationMetrics.recentErrors.join(', ') || 'None'}`,
          { 
            headers: { 'Content-Type': 'text/plain' },
            status: 200 
          }
        );
      }

      return NextResponse.json(operationMetrics, { status: 200 });
    }

    // Get overall performance summary
    const summary = monitor.getPerformanceSummary();
    const health = monitor.isSystemHealthy();

    const response = {
      ...summary,
      health,
      timestamp: new Date().toISOString()
    };

    if (format === 'text') {
      return new NextResponse(
        `Performance Summary\n` +
        `==================\n` +
        `Total Operations: ${summary.overall.totalOperations}\n` +
        `Success Rate: ${summary.overall.successRate}\n` +
        `Average Duration: ${summary.overall.averageDuration}\n` +
        `Active Connections: ${summary.connections.activeConnections}\n` +
        `Total Connections: ${summary.connections.totalConnections}\n` +
        `Database Queries: ${summary.database.queryCount}\n` +
        `Slow Queries: ${summary.database.slowQueries}\n` +
        `System Health: ${health.healthy ? 'HEALTHY' : 'ISSUES DETECTED'}\n` +
        `Issues: ${health.issues.join(', ') || 'None'}\n` +
        `Recommendations: ${health.recommendations.join(', ') || 'None'}`,
        { 
          headers: { 'Content-Type': 'text/plain' },
          status: 200 
        }
      );
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to get performance metrics' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const monitor = PerformanceMonitor.getInstance();
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');

    const clearedCount = monitor.clearOldMetrics(hours);

    return NextResponse.json({
      message: `Cleared ${clearedCount} old metrics`,
      clearedCount,
      olderThanHours: hours,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  } catch (error) {
    console.error('Error clearing performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to clear performance metrics' },
      { status: 500 }
    );
  }
}