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

        // Get current metrics
        const socketMetrics = socketMonitor.getMetrics();
        const errorMetrics = errorTracker.getMetrics();
        const performanceMetrics = performanceMonitor.getPerformanceSummary();

        // Calculate system health status
        const systemHealth = calculateSystemHealth(socketMetrics, errorMetrics, performanceMetrics);

        const dashboardData = {
            timestamp: new Date().toISOString(),
            systemHealth,
            metrics: {
                socket: {
                    activeConnections: socketMetrics.activeConnections,
                    totalConnections: socketMetrics.totalConnections,
                    peakConnections: socketMetrics.peakConnections,
                    connectionsPerMinute: socketMetrics.connectionsPerMinute,
                    averageConnectionTime: socketMetrics.averageConnectionTime,
                    connectionsByRoom: Object.fromEntries(socketMetrics.connectionsByRoom),
                    connectionsByUser: Object.fromEntries(socketMetrics.connectionsByUser)
                },
                errors: {
                    totalErrors: errorMetrics.totalErrors,
                    recentErrors: errorMetrics.recentErrors,
                    errorRate: errorMetrics.errorRate,
                    errorsByCategory: Object.fromEntries(errorMetrics.errorsByCategory),
                    errorsByLevel: Object.fromEntries(errorMetrics.errorsByLevel)
                },
                performance: performanceMetrics
            },
            alerts: generateAlerts(socketMetrics, errorMetrics, performanceMetrics)
        };

        return NextResponse.json(dashboardData);
    } catch (error) {
        console.error('Dashboard API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch dashboard data' },
            { status: 500 }
        );
    }
}

function calculateSystemHealth(socketMetrics: any, errorMetrics: any, performanceMetrics: any) {
    let status = 'healthy';
    const issues = [];

    // Check connection health
    if (socketMetrics.activeConnections > 1000) {
        status = 'warning';
        issues.push('High connection count');
    }

    // Check error rate
    if (errorMetrics.errorRate > 10) {
        status = 'critical';
        issues.push('High error rate');
    } else if (errorMetrics.errorRate > 5) {
        status = 'warning';
        issues.push('Elevated error rate');
    }

    // Check recent errors
    if (errorMetrics.recentErrors > 20) {
        status = 'critical';
        issues.push('Many recent errors');
    }

    return {
        status,
        issues,
        uptime: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage()
    };
}

function generateAlerts(socketMetrics: any, errorMetrics: any, performanceMetrics: any) {
    const alerts = [];

    // Connection alerts
    if (socketMetrics.activeConnections > 1000) {
        alerts.push({
            type: 'warning',
            category: 'connections',
            message: `High connection count: ${socketMetrics.activeConnections}`,
            timestamp: new Date().toISOString()
        });
    }

    if (socketMetrics.connectionsPerMinute > 100) {
        alerts.push({
            type: 'info',
            category: 'connections',
            message: `High connection rate: ${socketMetrics.connectionsPerMinute}/min`,
            timestamp: new Date().toISOString()
        });
    }

    // Error alerts
    if (errorMetrics.errorRate > 10) {
        alerts.push({
            type: 'critical',
            category: 'errors',
            message: `Critical error rate: ${errorMetrics.errorRate}%`,
            timestamp: new Date().toISOString()
        });
    }

    if (errorMetrics.recentErrors > 20) {
        alerts.push({
            type: 'warning',
            category: 'errors',
            message: `${errorMetrics.recentErrors} errors in the last hour`,
            timestamp: new Date().toISOString()
        });
    }

    return alerts;
}