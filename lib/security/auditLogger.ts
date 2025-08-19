import { ErrorTracker } from '../monitoring/errorTracker';

// Audit event interface
interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'blocked';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  clientIP?: string;
  userAgent?: string;
  requestId?: string;
}

// Audit statistics
interface AuditStats {
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByAction: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  recentFailures: number;
  suspiciousActivity: number;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private events: AuditEvent[] = [];
  private errorTracker: ErrorTracker;
  private maxEvents = 10000; // Keep last 10k events in memory
  private suspiciousPatterns = new Map<string, number>();

  private constructor() {
    this.errorTracker = ErrorTracker.getInstance();
    
    // Clean up old events every hour
    setInterval(() => this.cleanupOldEvents(), 60 * 60 * 1000);
    
    // Analyze suspicious patterns every 15 minutes
    setInterval(() => this.analyzeSuspiciousPatterns(), 15 * 60 * 1000);
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  // Log audit event
  logEvent(
    action: string,
    resource: string,
    outcome: 'success' | 'failure' | 'blocked',
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any> = {},
    context?: {
      userId?: string;
      sessionId?: string;
      clientIP?: string;
      userAgent?: string;
      requestId?: string;
    }
  ): void {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      action,
      resource,
      outcome,
      severity,
      details,
      ...context
    };

    this.events.push(event);

    // Keep events within limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to console for immediate visibility
    this.logToConsole(event);

    // Track in error monitoring if it's a failure or blocked action
    if (outcome !== 'success') {
      this.errorTracker.trackError(
        severity === 'critical' ? 'error' : 'warning',
        'security',
        `Audit: ${action} on ${resource} - ${outcome}`,
        {
          auditEventId: event.id,
          action,
          resource,
          outcome,
          severity,
          ...details,
          ...context
        }
      );
    }

    // Track suspicious patterns
    this.trackSuspiciousActivity(event);
  }

  // Predefined audit methods for common security events
  logAuthentication(
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, any>,
    context?: any
  ) {
    this.logEvent(
      'authentication',
      'user_session',
      outcome,
      outcome === 'success' ? 'low' : 'medium',
      details,
      context
    );
  }

  logAuthorization(
    outcome: 'success' | 'failure' | 'blocked',
    resource: string,
    details: Record<string, any>,
    context?: any
  ) {
    this.logEvent(
      'authorization',
      resource,
      outcome,
      outcome === 'blocked' ? 'high' : 'medium',
      details,
      context
    );
  }

  logDataAccess(
    action: 'read' | 'write' | 'delete',
    resource: string,
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, any>,
    context?: any
  ) {
    const severity = action === 'delete' ? 'high' : 
                    action === 'write' ? 'medium' : 'low';
    
    this.logEvent(
      `data_${action}`,
      resource,
      outcome,
      severity,
      details,
      context
    );
  }

  logSecurityViolation(
    violationType: string,
    details: Record<string, any>,
    context?: any
  ) {
    this.logEvent(
      'security_violation',
      violationType,
      'blocked',
      'critical',
      details,
      context
    );
  }

  logAdminAction(
    action: string,
    resource: string,
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, any>,
    context?: any
  ) {
    this.logEvent(
      `admin_${action}`,
      resource,
      outcome,
      'high',
      details,
      context
    );
  }

  logPasswordChange(
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, any>,
    context?: any
  ) {
    this.logEvent(
      'password_change',
      'user_credentials',
      outcome,
      'medium',
      details,
      context
    );
  }

  logSessionManagement(
    action: 'create' | 'destroy' | 'extend' | 'hijack_attempt',
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, any>,
    context?: any
  ) {
    const severity = action === 'hijack_attempt' ? 'critical' : 'low';
    
    this.logEvent(
      `session_${action}`,
      'user_session',
      outcome,
      severity,
      details,
      context
    );
  }

  // Get audit events with filtering
  getEvents(filters?: {
    userId?: string;
    action?: string;
    resource?: string;
    outcome?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditEvent[] {
    let filteredEvents = [...this.events];

    if (filters) {
      if (filters.userId) {
        filteredEvents = filteredEvents.filter(e => e.userId === filters.userId);
      }
      if (filters.action) {
        filteredEvents = filteredEvents.filter(e => e.action === filters.action);
      }
      if (filters.resource) {
        filteredEvents = filteredEvents.filter(e => e.resource === filters.resource);
      }
      if (filters.outcome) {
        filteredEvents = filteredEvents.filter(e => e.outcome === filters.outcome);
      }
      if (filters.severity) {
        filteredEvents = filteredEvents.filter(e => e.severity === filters.severity);
      }
      if (filters.startDate) {
        filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.endDate!);
      }
    }

    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (filters?.limit) {
      filteredEvents = filteredEvents.slice(0, filters.limit);
    }

    return filteredEvents;
  }

  // Get audit statistics
  getStats(): AuditStats {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp >= oneHourAgo);

    const stats: AuditStats = {
      totalEvents: this.events.length,
      eventsBySeverity: {},
      eventsByAction: {},
      eventsByOutcome: {},
      recentFailures: recentEvents.filter(e => e.outcome === 'failure').length,
      suspiciousActivity: this.suspiciousPatterns.size
    };

    // Calculate statistics
    for (const event of this.events) {
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
      stats.eventsByAction[event.action] = (stats.eventsByAction[event.action] || 0) + 1;
      stats.eventsByOutcome[event.outcome] = (stats.eventsByOutcome[event.outcome] || 0) + 1;
    }

    return stats;
  }

  // Get security alerts based on audit events
  getSecurityAlerts(): {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    count: number;
    lastOccurrence: Date;
  }[] {
    const alerts = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp >= oneHourAgo);

    // Multiple failed authentication attempts
    const failedAuth = recentEvents.filter(e => 
      e.action === 'authentication' && e.outcome === 'failure'
    );
    if (failedAuth.length > 10) {
      alerts.push({
        type: 'multiple_auth_failures',
        severity: 'high',
        message: `${failedAuth.length} failed authentication attempts in the last hour`,
        count: failedAuth.length,
        lastOccurrence: failedAuth[0]?.timestamp || now
      });
    }

    // Security violations
    const violations = recentEvents.filter(e => e.action === 'security_violation');
    if (violations.length > 0) {
      alerts.push({
        type: 'security_violations',
        severity: 'critical',
        message: `${violations.length} security violations detected`,
        count: violations.length,
        lastOccurrence: violations[0]?.timestamp || now
      });
    }

    // Suspicious IP activity
    const ipActivity = new Map<string, number>();
    for (const event of recentEvents) {
      if (event.clientIP && event.outcome !== 'success') {
        ipActivity.set(event.clientIP, (ipActivity.get(event.clientIP) || 0) + 1);
      }
    }

    for (const [ip, count] of ipActivity.entries()) {
      if (count > 20) {
        alerts.push({
          type: 'suspicious_ip_activity',
          severity: 'high',
          message: `Suspicious activity from IP ${ip}: ${count} failed attempts`,
          count,
          lastOccurrence: now
        });
      }
    }

    return alerts.sort((a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime());
  }

  // Export audit log for external analysis
  exportAuditLog(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'ID', 'Timestamp', 'User ID', 'Session ID', 'Action', 'Resource',
        'Outcome', 'Severity', 'Client IP', 'User Agent', 'Details'
      ];
      
      const rows = this.events.map(event => [
        event.id,
        event.timestamp.toISOString(),
        event.userId || '',
        event.sessionId || '',
        event.action,
        event.resource,
        event.outcome,
        event.severity,
        event.clientIP || '',
        event.userAgent || '',
        JSON.stringify(event.details)
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalEvents: this.events.length,
      events: this.events
    }, null, 2);
  }

  // Private helper methods
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private logToConsole(event: AuditEvent): void {
    const emoji = this.getSeverityEmoji(event.severity);
const outcomeEmoji = event.outcome === 'success' ? '' :
event.outcome === 'failure' ? '' : '';
    
    console.log(
      `${emoji} AUDIT [${event.severity.toUpperCase()}] ${outcomeEmoji} ${event.action} on ${event.resource}`,
      {
        id: event.id,
        userId: event.userId,
        clientIP: event.clientIP,
        details: event.details
      }
    );
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🟠';
case 'critical': return '';
default: return '';
    }
  }

  private trackSuspiciousActivity(event: AuditEvent): void {
    if (event.outcome !== 'success') {
      const key = `${event.clientIP || 'unknown'}_${event.action}`;
      const count = this.suspiciousPatterns.get(key) || 0;
      this.suspiciousPatterns.set(key, count + 1);
    }
  }

  private analyzeSuspiciousPatterns(): void {
    const threshold = 10;
    const suspiciousIPs = [];

    for (const [key, count] of this.suspiciousPatterns.entries()) {
      if (count > threshold) {
        const [ip, action] = key.split('_');
        suspiciousIPs.push({ ip, action, count });
      }
    }

    if (suspiciousIPs.length > 0) {
      this.logEvent(
        'pattern_analysis',
        'security_monitoring',
        'blocked',
        'high',
        { suspiciousPatterns: suspiciousIPs }
      );
    }
  }

  private cleanupOldEvents(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    const initialCount = this.events.length;
    
    this.events = this.events.filter(event => event.timestamp > cutoff);
    
    const cleanedCount = initialCount - this.events.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old audit events`);
    }

    // Also cleanup suspicious patterns
    this.suspiciousPatterns.clear();
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();
export default auditLogger;