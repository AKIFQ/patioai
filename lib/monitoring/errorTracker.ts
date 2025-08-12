interface ErrorEvent {
  id: string;
  timestamp: Date;
  level: 'error' | 'warning' | 'info';
  category: 'socket' | 'api' | 'database' | 'auth' | 'system';
  message: string;
  stack?: string;
  context?: Record<string, any>;
  userId?: string;
  sessionId?: string;
  resolved: boolean;
}

interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Map<string, number>;
  errorsByLevel: Map<string, number>;
  recentErrors: number;
  errorRate: number;
  lastError?: Date;
}

export class ErrorTracker {
  private static instance: ErrorTracker;
  private errors: ErrorEvent[] = [];
  private metrics: ErrorMetrics;

  private constructor() {
    this.metrics = {
      totalErrors: 0,
      errorsByCategory: new Map(),
      errorsByLevel: new Map(),
      recentErrors: 0,
      errorRate: 0
    };

    // Clean up old errors every hour
    setInterval(() => {
      this.cleanupErrors();
    }, 60 * 60 * 1000);

    // Update error rate every minute
    setInterval(() => {
      this.updateErrorRate();
    }, 60 * 1000);
  }

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  // Track different types of errors
  trackError(
    level: 'error' | 'warning' | 'info',
    category: 'socket' | 'api' | 'database' | 'auth' | 'system',
    message: string,
    context?: Record<string, any>,
    error?: Error
  ) {
    const errorEvent: ErrorEvent = {
      id: this.generateErrorId(),
      timestamp: new Date(),
      level,
      category,
      message,
      stack: error?.stack,
      context,
      userId: context?.userId,
      sessionId: context?.sessionId,
      resolved: false
    };

    this.errors.push(errorEvent);
    this.updateMetrics(errorEvent);

    // Log to console with appropriate level
    const logMessage = `🚨 [${category.toUpperCase()}] ${message}`;
    const logContext = context ? JSON.stringify(context, null, 2) : '';

    switch (level) {
      case 'error':
        console.error(logMessage, logContext, error?.stack || '');
        break;
      case 'warning':
        console.warn(logMessage, logContext);
        break;
      case 'info':
        console.info(logMessage, logContext);
        break;
    }

    // Check for critical alerts
    this.checkAlerts(errorEvent);

    return errorEvent.id;
  }

  // Specific error tracking methods
  trackSocketError(message: string, context?: Record<string, any>, error?: Error) {
    return this.trackError('error', 'socket', message, context, error);
  }

  trackAPIError(message: string, context?: Record<string, any>, error?: Error) {
    return this.trackError('error', 'api', message, context, error);
  }

  trackDatabaseError(message: string, context?: Record<string, any>, error?: Error) {
    return this.trackError('error', 'database', message, context, error);
  }

  trackAuthError(message: string, context?: Record<string, any>, error?: Error) {
    return this.trackError('error', 'auth', message, context, error);
  }

  trackWarning(category: 'socket' | 'api' | 'database' | 'auth' | 'system', message: string, context?: Record<string, any>) {
    return this.trackError('warning', category, message, context);
  }

  // Mark error as resolved
  resolveError(errorId: string) {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      console.log(`✅ Error resolved: ${errorId}`);
    }
  }

  // Get error metrics
  getMetrics(): ErrorMetrics {
    return {
      ...this.metrics,
      errorsByCategory: new Map(this.metrics.errorsByCategory),
      errorsByLevel: new Map(this.metrics.errorsByLevel)
    };
  }

  // Get recent errors
  getRecentErrors(limit: number = 50): ErrorEvent[] {
    return this.errors
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Get unresolved errors
  getUnresolvedErrors(): ErrorEvent[] {
    return this.errors
      .filter(error => !error.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Get errors by category
  getErrorsByCategory(category: string, limit: number = 20): ErrorEvent[] {
    return this.errors
      .filter(error => error.category === category)
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Get system health based on error patterns
  getHealthStatus() {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const recentErrors = this.errors.filter(
      error => error.timestamp >= fiveMinutesAgo && error.level === 'error'
    ).length;

    const recentWarnings = this.errors.filter(
      error => error.timestamp >= fiveMinutesAgo && error.level === 'warning'
    ).length;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (recentErrors >= 10) {
      status = 'critical';
    } else if (recentErrors >= 5 || recentWarnings >= 10) {
      status = 'warning';
    }

    return {
      status,
      recentErrors,
      recentWarnings,
      errorRate: this.metrics.errorRate,
      totalUnresolved: this.getUnresolvedErrors().length,
      lastError: this.metrics.lastError
    };
  }

  // Get alerts for critical error patterns
  getAlerts() {
    const alerts = [];
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // High error rate alert
    if (this.metrics.errorRate > 10) {
      alerts.push({
        level: 'critical',
        message: `High error rate: ${this.metrics.errorRate} errors/minute`,
        timestamp: now
      });
    }

    // Recent critical errors
    const recentCriticalErrors = this.errors.filter(
      error => error.timestamp >= fiveMinutesAgo && error.level === 'error'
    ).length;

    if (recentCriticalErrors >= 5) {
      alerts.push({
        level: 'critical',
        message: `Multiple critical errors: ${recentCriticalErrors} errors in last 5 minutes`,
        timestamp: now
      });
    }

    // Database error pattern
    const recentDbErrors = this.errors.filter(
      error => error.timestamp >= fiveMinutesAgo && error.category === 'database'
    ).length;

    if (recentDbErrors >= 3) {
      alerts.push({
        level: 'warning',
        message: `Database issues detected: ${recentDbErrors} database errors in last 5 minutes`,
        timestamp: now
      });
    }

    return alerts;
  }

  private updateMetrics(errorEvent: ErrorEvent) {
    this.metrics.totalErrors++;
    this.metrics.lastError = errorEvent.timestamp;

    // Update category counts
    const categoryCount = this.metrics.errorsByCategory.get(errorEvent.category) || 0;
    this.metrics.errorsByCategory.set(errorEvent.category, categoryCount + 1);

    // Update level counts
    const levelCount = this.metrics.errorsByLevel.get(errorEvent.level) || 0;
    this.metrics.errorsByLevel.set(errorEvent.level, levelCount + 1);
  }

  private updateErrorRate() {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    
    const errorsInLastMinute = this.errors.filter(
      error => error.timestamp >= oneMinuteAgo
    ).length;

    this.metrics.errorRate = errorsInLastMinute;
  }

  private cleanupErrors() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const beforeCount = this.errors.length;
    
    this.errors = this.errors.filter(
      error => error.timestamp >= threeDaysAgo || !error.resolved
    );

    const removedCount = beforeCount - this.errors.length;
    if (removedCount > 0) {
      console.log(`🧹 Error Tracker: Cleaned up ${removedCount} old errors, ${this.errors.length} remaining`);
    }

    // Rebuild aggregates after cleanup
    this.rebuildAggregates();
  }

  private checkAlerts(errorEvent: ErrorEvent) {
    // Immediate critical alerts
    if (errorEvent.level === 'error' && errorEvent.category === 'database') {
      console.error(`🚨 CRITICAL ALERT: Database error detected - ${errorEvent.message}`);
    }

    if (errorEvent.level === 'error' && errorEvent.category === 'auth') {
      console.error(`🚨 SECURITY ALERT: Authentication error - ${errorEvent.message}`);
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // Export for external monitoring
  exportMetrics() {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();
    const alerts = this.getAlerts();

    return {
      timestamp: new Date().toISOString(),
      metrics: {
        total_errors: metrics.totalErrors,
        error_rate: metrics.errorRate,
        recent_errors: metrics.recentErrors,
        unresolved_errors: this.getUnresolvedErrors().length,
        errors_by_category: Object.fromEntries(metrics.errorsByCategory),
        errors_by_level: Object.fromEntries(metrics.errorsByLevel)
      },
      health,
      alerts,
      recent_errors: this.getRecentErrors(10).map(error => ({
        id: error.id,
        timestamp: error.timestamp.toISOString(),
        level: error.level,
        category: error.category,
        message: error.message,
        resolved: error.resolved
      }))
    };
  }

  // === Added: Safe cleanup APIs ===

  /**
   * Trim stored errors to the last N entries to aggressively free memory
   */
  public trimErrorsTo(limit: number): number {
    if (limit <= 0) {
      const removed = this.errors.length;
      this.errors = [];
      this.rebuildAggregates();
      return removed;
    }
    if (this.errors.length <= limit) return 0;
    const removed = this.errors.length - limit;
    this.errors = this.errors.slice(-limit);
    this.rebuildAggregates();
    return removed;
  }

  /**
   * Remove errors older than the specified cutoff time (in ms)
   */
  public removeErrorsOlderThan(cutoffMs: number): number {
    const cutoff = new Date(Date.now() - cutoffMs);
    const before = this.errors.length;
    this.errors = this.errors.filter(e => e.timestamp >= cutoff);
    const removed = before - this.errors.length;
    if (removed > 0) this.rebuildAggregates();
    return removed;
  }

  /**
   * Clear aggregate maps to reduce memory usage. They will be rebuilt as new errors are tracked.
   */
  public clearAggregates(): void {
    this.metrics.errorsByCategory.clear();
    this.metrics.errorsByLevel.clear();
    // Keep counters consistent with current stored errors
    this.metrics.totalErrors = this.errors.length;
    this.metrics.lastError = this.errors.length > 0 ? this.errors[this.errors.length - 1].timestamp : undefined;
  }

  /**
   * Recompute aggregate maps from the current error list
   */
  private rebuildAggregates(): void {
    this.metrics.errorsByCategory = new Map();
    this.metrics.errorsByLevel = new Map();
    this.metrics.totalErrors = this.errors.length;
    this.metrics.lastError = this.errors.length > 0 ? this.errors[this.errors.length - 1].timestamp : undefined;

    for (const err of this.errors) {
      this.metrics.errorsByCategory.set(
        err.category,
        (this.metrics.errorsByCategory.get(err.category) || 0) + 1
      );
      this.metrics.errorsByLevel.set(
        err.level,
        (this.metrics.errorsByLevel.get(err.level) || 0) + 1
      );
    }
  }
}