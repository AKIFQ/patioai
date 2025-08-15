export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  component?: string;
  function?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: LogContext;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.minLevel = this.isProduction ? LogLevel.INFO : LogLevel.DEBUG;
  }

  private formatMessage(level: LogLevel, message: string, context: LogContext): string {
    const levelName = LogLevel[level];
    const timestamp = new Date().toISOString();
    
    if (this.isProduction) {
      // Structured logging for production
      return JSON.stringify({
        level: levelName,
        message,
        timestamp,
        context,
        environment: 'production'
      });
    } else {
      // Human-readable logging for development
      const emoji = this.getLogEmoji(level);
      const contextStr = Object.keys(context).length > 0 
        ? ` [${Object.entries(context).map(([k, v]) => `${k}:${v}`).join(', ')}]`
        : '';
      return `${emoji} ${levelName} ${timestamp} ${message}${contextStr}`;
    }
  }

  private getLogEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.WARN: return '⚠️';
      case LogLevel.ERROR: return '❌';
      case LogLevel.CRITICAL: return '🚨';
      default: return '📝';
    }
  }

  private log(level: LogLevel, message: string, context: LogContext = {}, error?: Error): void {
    if (level < this.minLevel) return;

    const formattedMessage = this.formatMessage(level, message, context);
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error
    };

    // Console output
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(formattedMessage);
        if (error) {
          console.error('Stack trace:', error.stack);
        }
        break;
    }

    // In production, you might want to send logs to a service
    if (this.isProduction && level >= LogLevel.ERROR) {
      this.sendToLogService(logEntry);
    }
  }

  private async sendToLogService(logEntry: LogEntry): Promise<void> {
    try {
      // This could be enhanced to send to a service like DataDog, Sentry, etc.
      // For now, we'll just store it in localStorage for debugging
      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      logs.push(logEntry);
      
      // Keep only last 100 logs
      if (logs.length > 100) {
        logs.splice(0, logs.length - 100);
      }
      
      localStorage.setItem('error_logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to store log entry:', error);
    }
  }

  debug(message: string, context: LogContext = {}): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context: LogContext = {}, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  critical(message: string, context: LogContext = {}, error?: Error): void {
    this.log(LogLevel.CRITICAL, message, context, error);
  }

  // Socket-specific logging helpers
  socketDebug(event: string, data: any, context: LogContext = {}): void {
    this.debug(`Socket Event: ${event}`, { 
      ...context, 
      event, 
      dataPreview: typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100)
    });
  }

  socketError(event: string, error: Error, context: LogContext = {}): void {
    this.error(`Socket Error: ${event}`, { ...context, event }, error);
  }

  // Chat-specific logging helpers
  chatSubmission(messageId: string, context: LogContext = {}): void {
    this.info('Chat message submitted', { ...context, messageId });
  }

  chatError(messageId: string, error: Error, context: LogContext = {}): void {
    this.error('Chat submission failed', { ...context, messageId }, error);
  }

  // Performance logging
  performanceLog(operation: string, duration: number, context: LogContext = {}): void {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.DEBUG;
    this.log(level, `Performance: ${operation} took ${duration}ms`, { ...context, operation, duration });
  }

  // Connection health logging
  connectionHealth(status: string, metrics: any, context: LogContext = {}): void {
    const level = status === 'healthy' ? LogLevel.DEBUG : 
                  status === 'degraded' ? LogLevel.WARN : LogLevel.ERROR;
    this.log(level, `Connection health: ${status}`, { ...context, status, ...metrics });
  }
}

// Singleton instance
export const logger = new Logger();