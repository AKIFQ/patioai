import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { SocketMonitor } from '@/lib/monitoring/socketMonitor';
import { ErrorTracker } from '@/lib/monitoring/errorTracker';
import { PerformanceMonitor } from '@/lib/monitoring/performanceMonitor';

export async function GET(request: NextRequest) {
  try {
    const socketMonitor = SocketMonitor.getInstance();
    const errorTracker = ErrorTracker.getInstance();
    const performanceMonitor = PerformanceMonitor.getInstance();

    // Get metrics from all monitoring systems
    const socketMetrics = socketMonitor.getMetrics();
    const errorMetrics = errorTracker.getMetrics();
    const performanceMetrics = performanceMonitor.getPerformanceSummary();

    // Determine overall health status
    let status = 'healthy';
    const checks = [];

    // Socket.IO health check
    const socketHealth = {
      name: 'socket_io',
      status: 'healthy',
      details: {
        activeConnections: socketMetrics.activeConnections,
        totalConnections: socketMetrics.totalConnections
      }
    };

    if (socketMetrics.activeConnections > 2000) {
      socketHealth.status = 'critical';
      status = 'critical';
    } else if (socketMetrics.activeConnections > 1000) {
      socketHealth.status = 'warning';
      if (status === 'healthy') status = 'warning';
    }

    checks.push(socketHealth);

    // Error rate health check
    const errorHealth = {
      name: 'error_rate',
      status: 'healthy',
      details: {
        errorRate: errorMetrics.errorRate,
        recentErrors: errorMetrics.recentErrors
      }
    };

    if (errorMetrics.errorRate > 15) {
      errorHealth.status = 'critical';
      status = 'critical';
    } else if (errorMetrics.errorRate > 5) {
      errorHealth.status = 'warning';
      if (status === 'healthy') status = 'warning';
    }

    checks.push(errorHealth);

    // Memory health check
    const memUsage = process.memoryUsage();
    const memoryHealth = {
      name: 'memory',
      status: 'healthy',
      details: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      }
    };

    if (memUsage.heapUsed / 1024 / 1024 > 1000) {
      memoryHealth.status = 'critical';
      status = 'critical';
    } else if (memUsage.heapUsed / 1024 / 1024 > 500) {
      memoryHealth.status = 'warning';
      if (status === 'healthy') status = 'warning';
    }

    checks.push(memoryHealth);

    const healthData = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      checks
    };

    // Return appropriate HTTP status code
    const httpStatus = status === 'healthy' ? 200 : 
                      status === 'warning' ? 200 : 503;

    return NextResponse.json(healthData, { status: httpStatus });

  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'critical',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      },
      { status: 503 }
    );
  }
}

// HEAD request for simple health check
export async function HEAD(request: NextRequest) {
  try {
    const response = await GET(request);
    const data = await response.json();
    
    return new NextResponse(null, {
      status: response.status,
      headers: {
        'X-Health-Status': data.status,
        'X-Uptime': data.uptime?.toString() || '0'
      }
    });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}