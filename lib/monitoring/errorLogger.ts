// PRODUCTION ERROR MONITORING

export interface ErrorContext {
  userId?: string;
  roomId?: string;
  shareCode?: string;
  endpoint?: string;
  userAgent?: string;
  timestamp?: string;
}

export class ProductionErrorLogger {
  static logError(error: unknown, context: ErrorContext = {}) {
    const errorData = {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error),
      context: {
        ...context,
        timestamp: new Date().toISOString()
      }
    };

    // Log to console for now (replace with proper monitoring service)
    console.error('PRODUCTION ERROR:', JSON.stringify(errorData, null, 2));
    
    // TODO: Send to monitoring service (Sentry, DataDog, etc.)
    // await sendToMonitoringService(errorData);
  }

  static logPerformanceIssue(operation: string, duration: number, context: ErrorContext = {}) {
    if (duration > 1000) { // Log slow operations (>1s)
      console.warn('SLOW OPERATION:', {
        operation,
        duration: `${duration}ms`,
        context: {
          ...context,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static logSecurityEvent(event: string, context: ErrorContext = {}) {
    console.error('SECURITY EVENT:', {
      event,
      context: {
        ...context,
        timestamp: new Date().toISOString()
      }
    });
    
    // TODO: Send to security monitoring
  }
}