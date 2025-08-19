// Performance monitoring for Socket.IO and database operations

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  metadata?: any;
}

interface ConnectionMetrics {
  activeConnections: number;
  totalConnections: number;
  averageConnectionTime: number;
  connectionErrors: number;
  lastConnectionTime: Date;
}

interface DatabaseMetrics {
  queryCount: number;
  averageQueryTime: number;
  slowQueries: number;
  queryErrors: number;
  connectionPoolUsage: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private connectionMetrics: ConnectionMetrics = {
    activeConnections: 0,
    totalConnections: 0,
    averageConnectionTime: 0,
    connectionErrors: 0,
    lastConnectionTime: new Date()
  };
  private databaseMetrics: DatabaseMetrics = {
    queryCount: 0,
    averageQueryTime: 0,
    slowQueries: 0,
    queryErrors: 0,
    connectionPoolUsage: 0
  };
  private maxMetrics = 1000; // Keep last 1000 metrics

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Record a performance metric
  recordMetric(operation: string, startTime: number, success: boolean, error?: string, metadata?: any): void {
    const duration = Date.now() - startTime;
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: new Date(),
      success,
      error,
      metadata
    };

    this.metrics.push(metric);

    // Keep only the last N metrics to prevent memory issues
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Update specific metrics based on operation type
    this.updateSpecificMetrics(metric);
  }

  // Update connection metrics
  updateConnectionMetrics(type: 'connect' | 'disconnect' | 'error', duration?: number): void {
    switch (type) {
      case 'connect':
        this.connectionMetrics.activeConnections++;
        this.connectionMetrics.totalConnections++;
        this.connectionMetrics.lastConnectionTime = new Date();
        if (duration) {
          this.connectionMetrics.averageConnectionTime = 
            (this.connectionMetrics.averageConnectionTime + duration) / 2;
        }
        break;
      case 'disconnect':
        if (this.connectionMetrics.activeConnections > 0) {
          this.connectionMetrics.activeConnections--;
        }
        break;
      case 'error':
        this.connectionMetrics.connectionErrors++;
        break;
    }
  }

  // Update database metrics
  updateDatabaseMetrics(duration: number, success: boolean): void {
    this.databaseMetrics.queryCount++;
    this.databaseMetrics.averageQueryTime = 
      (this.databaseMetrics.averageQueryTime + duration) / 2;
    
    if (duration > 1000) { // Queries taking more than 1 second are considered slow
      this.databaseMetrics.slowQueries++;
    }
    
    if (!success) {
      this.databaseMetrics.queryErrors++;
    }
  }

  // Get performance summary
  getPerformanceSummary(): {
    overall: any;
    connections: ConnectionMetrics;
    database: DatabaseMetrics;
    recentMetrics: PerformanceMetric[];
  } {
    const recentMetrics = this.metrics.slice(-50); // Last 50 metrics
    const successRate = recentMetrics.length > 0 
      ? (recentMetrics.filter(m => m.success).length / recentMetrics.length) * 100 
      : 100;
    
    const averageDuration = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;

    return {
      overall: {
        totalOperations: this.metrics.length,
        successRate: successRate.toFixed(2) + '%',
        averageDuration: averageDuration.toFixed(2) + 'ms',
        lastUpdated: new Date().toISOString()
      },
      connections: this.connectionMetrics,
      database: this.databaseMetrics,
      recentMetrics: recentMetrics.slice(-10) // Last 10 for detailed view
    };
  }

  // Get metrics for specific operation
  getOperationMetrics(operation: string): {
    count: number;
    averageDuration: number;
    successRate: number;
    recentErrors: string[];
  } {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    const successCount = operationMetrics.filter(m => m.success).length;
    const averageDuration = operationMetrics.length > 0
      ? operationMetrics.reduce((sum, m) => sum + m.duration, 0) / operationMetrics.length
      : 0;
    const recentErrors = operationMetrics
      .filter(m => !m.success && m.error)
      .slice(-5)
      .map(m => m.error!);

    return {
      count: operationMetrics.length,
      averageDuration: Math.round(averageDuration),
      successRate: operationMetrics.length > 0 
        ? Math.round((successCount / operationMetrics.length) * 100)
        : 100,
      recentErrors
    };
  }

  // Check if system is healthy
  isSystemHealthy(): {
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check connection metrics
    if (this.connectionMetrics.connectionErrors > 10) {
      issues.push('High connection error rate');
      recommendations.push('Check network connectivity and server resources');
    }

    if (this.connectionMetrics.averageConnectionTime > 5000) {
      issues.push('Slow connection times');
      recommendations.push('Optimize server performance or increase resources');
    }

    // Check database metrics
    if (this.databaseMetrics.slowQueries > 5) {
      issues.push('Multiple slow database queries detected');
      recommendations.push('Review and optimize database queries and indexes');
    }

    if (this.databaseMetrics.queryErrors > 5) {
      issues.push('High database error rate');
      recommendations.push('Check database connectivity and query validity');
    }

    // Check recent operation success rate
    const recentMetrics = this.metrics.slice(-100);
    if (recentMetrics.length > 0) {
      const successRate = (recentMetrics.filter(m => m.success).length / recentMetrics.length) * 100;
      if (successRate < 90) {
        issues.push('Low operation success rate');
        recommendations.push('Investigate recent errors and improve error handling');
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  // Clear old metrics (for memory management)
  clearOldMetrics(olderThanHours = 24): number {
    const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
    const initialCount = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoffTime);
    return initialCount - this.metrics.length;
  }

  // Export metrics for external monitoring
  exportMetrics(): string {
    return JSON.stringify({
      summary: this.getPerformanceSummary(),
      health: this.isSystemHealthy(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  private updateSpecificMetrics(metric: PerformanceMetric): void {
    // Update database metrics for database operations
    if (metric.operation.includes('database') || metric.operation.includes('query')) {
      this.updateDatabaseMetrics(metric.duration, metric.success);
    }

    // Log slow operations
    if (metric.duration > 2000) {
      console.warn(`Slow operation detected: ${metric.operation} took ${metric.duration}ms`);
    }

    // Log errors
    if (!metric.success && metric.error) {
      console.error(`Operation failed: ${metric.operation} - ${metric.error}`);
    }
  }

  // === Added: Safe cleanup APIs ===

  /**
   * Aggressively clear recorded performance metrics and shrink arrays
   */
  public clearAllMetrics(): void {
    this.metrics = [];
  }

  /**
   * Trim to last N metrics to control memory footprint
   */
  public trimMetricsTo(limit: number): number {
    if (limit <= 0) {
      const removed = this.metrics.length;
      this.metrics = [];
      return removed;
    }
    if (this.metrics.length <= limit) return 0;
    const removed = this.metrics.length - limit;
    this.metrics = this.metrics.slice(-limit);
    return removed;
  }

  /**
   * Reset internal per-operation maps used by external managers
   */
  public resetOperationMaps(): void {
    // No exposed maps here, but provide a hook for compatibility
    // Could be expanded if we add maps similar to SocketMonitor
  }
}

// Helper function to measure operation performance
export function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: any
): Promise<T> {
  const startTime = Date.now();
  const monitor = PerformanceMonitor.getInstance();

  return fn()
    .then(result => {
      monitor.recordMetric(operation, startTime, true, undefined, metadata);
      return result;
    })
    .catch(error => {
      monitor.recordMetric(operation, startTime, false, error.message, metadata);
      throw error;
    });
}

// Decorator for automatic performance monitoring
export function monitorPerformance(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return measurePerformance(
        `${operation}.${propertyName}`,
        () => method.apply(this, args),
        { args: args.length }
      );
    };
  };
}