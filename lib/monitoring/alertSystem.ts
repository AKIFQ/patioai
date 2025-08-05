import { SocketMonitor } from './socketMonitor';
import { ErrorTracker } from './errorTracker';
import { PerformanceMonitor } from './performanceMonitor';
import { MemoryManager } from './memoryManager';

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  category: 'connections' | 'errors' | 'performance' | 'system';
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: any;
}

interface AlertRule {
  id: string;
  name: string;
  category: string;
  condition: (metrics: any) => boolean;
  severity: 'info' | 'warning' | 'critical';
  message: (metrics: any) => string;
  cooldown: number; // minutes
}

export class AlertSystem {
  private static instance: AlertSystem;
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private lastAlertTimes: Map<string, Date> = new Map();
  private alertHandlers: Array<(alert: Alert) => void> = [];
  private monitoringIntervals: NodeJS.Timeout[] = [];

  private constructor() {
    this.initializeDefaultRules();
    this.startMonitoring();
  }

  static getInstance(): AlertSystem {
    if (!AlertSystem.instance) {
      AlertSystem.instance = new AlertSystem();
    }
    return AlertSystem.instance;
  }

  private initializeDefaultRules() {
    // Connection-based alerts
    this.alertRules.push({
      id: 'high-connection-count',
      name: 'High Connection Count',
      category: 'connections',
      condition: (metrics) => metrics.socket?.activeConnections > 1000,
      severity: 'warning',
      message: (metrics) => `High connection count: ${metrics.socket.activeConnections} active connections`,
      cooldown: 5
    });

    this.alertRules.push({
      id: 'critical-connection-count',
      name: 'Critical Connection Count',
      category: 'connections',
      condition: (metrics) => metrics.socket?.activeConnections > 2000,
      severity: 'critical',
      message: (metrics) => `Critical connection count: ${metrics.socket.activeConnections} active connections - scaling required`,
      cooldown: 2
    });

    this.alertRules.push({
      id: 'high-connection-rate',
      name: 'High Connection Rate',
      category: 'connections',
      condition: (metrics) => metrics.socket?.connectionsPerMinute > 100,
      severity: 'info',
      message: (metrics) => `High connection rate: ${metrics.socket.connectionsPerMinute} connections per minute`,
      cooldown: 10
    });

    // Error-based alerts
    this.alertRules.push({
      id: 'high-error-rate',
      name: 'High Error Rate',
      category: 'errors',
      condition: (metrics) => metrics.errors?.errorRate > 5,
      severity: 'warning',
      message: (metrics) => `High error rate: ${metrics.errors.errorRate}% error rate`,
      cooldown: 5
    });

    this.alertRules.push({
      id: 'critical-error-rate',
      name: 'Critical Error Rate',
      category: 'errors',
      condition: (metrics) => metrics.errors?.errorRate > 15,
      severity: 'critical',
      message: (metrics) => `Critical error rate: ${metrics.errors.errorRate}% error rate`,
      cooldown: 2
    });

    this.alertRules.push({
      id: 'many-recent-errors',
      name: 'Many Recent Errors',
      category: 'errors',
      condition: (metrics) => metrics.errors?.recentErrors > 50,
      severity: 'warning',
      message: (metrics) => `${metrics.errors.recentErrors} errors in the last hour`,
      cooldown: 15
    });

    // Performance-based alerts
    this.alertRules.push({
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      category: 'performance',
      condition: (metrics) => {
        const memUsage = process.memoryUsage();
        return memUsage.heapUsed / 1024 / 1024 > 2000; // 2GB
      },
      severity: 'warning',
      message: () => {
        const memUsage = process.memoryUsage();
        return `High memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap used`;
      },
      cooldown: 2
    });

    this.alertRules.push({
      id: 'critical-memory-usage',
      name: 'Critical Memory Usage',
      category: 'performance',
      condition: (metrics) => {
        const memUsage = process.memoryUsage();
        return memUsage.heapUsed / 1024 / 1024 > 3000; // 3GB
      },
      severity: 'critical',
      message: () => {
        const memUsage = process.memoryUsage();
        return `Critical memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap used`;
      },
      cooldown: 1
    });
  }

  private startMonitoring() {
    // Check alerts every 5 minutes (less frequent)
    const alertInterval = setInterval(() => {
      this.checkAlerts();
    }, 5 * 60 * 1000);
    this.monitoringIntervals.push(alertInterval);

    // Clean up old alerts every 10 minutes (more frequent)
    const cleanupInterval = setInterval(() => {
      this.cleanupAlerts();
    }, 10 * 60 * 1000);
    this.monitoringIntervals.push(cleanupInterval);


  }

  private async checkAlerts() {
    try {
      // Gather metrics from all monitoring systems
      const socketMonitor = SocketMonitor.getInstance();
      const errorTracker = ErrorTracker.getInstance();
      const performanceMonitor = PerformanceMonitor.getInstance();

      const metrics = {
        socket: socketMonitor.getMetrics(),
        errors: errorTracker.getMetrics(),
        performance: performanceMonitor.getPerformanceSummary()
      };

      // Check each alert rule
      for (const rule of this.alertRules) {
        if (this.shouldCheckRule(rule) && rule.condition(metrics)) {
          this.triggerAlert(rule, metrics);
        }
      }
    } catch (error) {
      console.error('Error checking alerts:', error);
    }
  }

  private shouldCheckRule(rule: AlertRule): boolean {
    const lastAlertTime = this.lastAlertTimes.get(rule.id);
    if (!lastAlertTime) return true;

    const cooldownMs = rule.cooldown * 60 * 1000;
    return Date.now() - lastAlertTime.getTime() > cooldownMs;
  }

  private triggerAlert(rule: AlertRule, metrics: any) {
    const alert: Alert = {
      id: `${rule.id}-${Date.now()}`,
      type: rule.severity,
      category: rule.category as any,
      message: rule.message(metrics),
      timestamp: new Date(),
      resolved: false,
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        metrics: this.sanitizeMetrics(metrics)
      }
    };

    this.alerts.push(alert);
    this.lastAlertTimes.set(rule.id, new Date());

    // Trigger automatic cleanup for critical memory alerts
    if (rule.id === 'critical-memory-usage') {
      const memoryManager = MemoryManager.getInstance();
      memoryManager.forceCleanup().then(result => {
        if (result.success) {
          console.log(`🧹 Auto-cleanup freed ${Math.round(result.freedMemory / 1024 / 1024)}MB`);
        }
      }).catch(error => {
        console.error('Auto-cleanup failed:', error);
      });
    }

    // Notify alert handlers
    this.alertHandlers.forEach(handler => {
      try {
        handler(alert);
      } catch (error) {
        console.error('Error in alert handler:', error);
      }
    });

    console.log(`🚨 ALERT [${alert.type.toUpperCase()}]: ${alert.message}`);
  }

  private sanitizeMetrics(metrics: any) {
    // Remove sensitive data and limit size
    return {
      socket: {
        activeConnections: metrics.socket?.activeConnections,
        connectionsPerMinute: metrics.socket?.connectionsPerMinute,
        totalConnections: metrics.socket?.totalConnections
      },
      errors: {
        errorRate: metrics.errors?.errorRate,
        recentErrors: metrics.errors?.recentErrors,
        totalErrors: metrics.errors?.totalErrors
      }
    };
  }

  private cleanupAlerts() {
    // Keep only last 10 alerts maximum
    if (this.alerts.length > 10) {
      this.alerts = this.alerts.slice(-10);
    }

    // Keep only last 30 minutes of alert times
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [ruleId, time] of this.lastAlertTimes.entries()) {
      if (time.getTime() < cutoff) {
        this.lastAlertTimes.delete(ruleId);
      }
    }
  }

  // Public methods
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  getAllAlerts(limit: number = 100): Alert[] {
    return this.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  resolveAlert(alertId: string) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  addAlertHandler(handler: (alert: Alert) => void) {
    this.alertHandlers.push(handler);
  }

  removeAlertHandler(handler: (alert: Alert) => void) {
    const index = this.alertHandlers.indexOf(handler);
    if (index > -1) {
      this.alertHandlers.splice(index, 1);
    }
  }

  // Add custom alert rule
  addAlertRule(rule: AlertRule) {
    this.alertRules.push(rule);
  }

  // Remove alert rule
  removeAlertRule(ruleId: string) {
    this.alertRules = this.alertRules.filter(rule => rule.id !== ruleId);
    this.lastAlertTimes.delete(ruleId);
  }

  // Get alert statistics
  getAlertStats() {
    const now = new Date();
    const last6h = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    const alerts6h = this.alerts.filter(a => a.timestamp > last6h);
    const alertsLastHour = this.alerts.filter(a => a.timestamp > lastHour);

    return {
      total: this.alerts.length,
      active: this.getActiveAlerts().length,
      last6Hours: alerts6h.length,
      lastHour: alertsLastHour.length,
      byType: {
        info: alerts6h.filter(a => a.type === 'info').length,
        warning: alerts6h.filter(a => a.type === 'warning').length,
        critical: alerts6h.filter(a => a.type === 'critical').length
      },
      byCategory: {
        connections: alerts6h.filter(a => a.category === 'connections').length,
        errors: alerts6h.filter(a => a.category === 'errors').length,
        performance: alerts6h.filter(a => a.category === 'performance').length,
        system: alerts6h.filter(a => a.category === 'system').length
      }
    };
  }

  // Add cleanup method for graceful shutdown
  cleanup() {
    console.log('🧹 Cleaning up AlertSystem...');

    // Clear all intervals
    this.monitoringIntervals.forEach(interval => {
      clearInterval(interval);
    });
    this.monitoringIntervals = [];

    // Clear data structures
    this.alerts = [];
    this.lastAlertTimes.clear();
    this.alertHandlers = [];

    console.log('✅ AlertSystem cleanup completed');
  }
}

// Export singleton instance
export const alertSystem = AlertSystem.getInstance();
export default alertSystem;