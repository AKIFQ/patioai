/**
 * Centralized logging utility with environment-based levels
 * Replaces scattered console.log statements throughout the app
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface LogContext {
  component?: string;
  userId?: string;
  roomId?: string;
  messageId?: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isServer = typeof window === 'undefined';
  
  // Only show essential logs in production
  private productionLevels: LogLevel[] = ['error', 'warn'];
  private developmentLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

  private shouldLog(level: LogLevel): boolean {
    const allowedLevels = this.isDevelopment ? this.developmentLevels : this.productionLevels;
    return allowedLevels.includes(level);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const prefix = this.isServer ? '[SERVER]' : '[CLIENT]';
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `${timestamp} ${prefix} [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog('error')) return;
    
    const formatted = this.formatMessage('error', message, context);
    console.error(formatted, error?.stack || '');
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    
    const formatted = this.formatMessage('warn', message, context);
    console.warn(formatted);
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = this.formatMessage('info', message, context);
    console.info(formatted);
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    
    const formatted = this.formatMessage('debug', message, context);
    console.log(formatted);
  }

  // Essential system events that should always be logged
  system(message: string, context?: LogContext): void {
const formatted = this.formatMessage('info', ` ${message}`, context);
    console.log(formatted);
  }

  // Socket events
  socket(message: string, context?: LogContext): void {
    if (!this.isDevelopment) return;
const formatted = this.formatMessage('debug', ` ${message}`, context);
    console.log(formatted);
  }

  // AI/Model events
  ai(message: string, context?: LogContext): void {
    if (!this.isDevelopment) return;
    const formatted = this.formatMessage('debug', `🤖 ${message}`, context);
    console.log(formatted);
  }

  // Database events
  db(message: string, context?: LogContext): void {
    if (!this.isDevelopment) return;
const formatted = this.formatMessage('debug', ` ${message}`, context);
    console.log(formatted);
  }

  // Performance events
  perf(message: string, context?: LogContext): void {
    if (!this.isDevelopment) return;
const formatted = this.formatMessage('debug', ` ${message}`, context);
    console.log(formatted);
  }

  // Chat submission events
  chatSubmission(messageId: string, context?: LogContext): void {
    if (!this.isDevelopment) return;
    const formatted = this.formatMessage('debug', `💬 Chat submission: ${messageId}`, context);
    console.log(formatted);
  }
}

export const logger = new Logger();

// Legacy console replacement for gradual migration
export const devLog = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...args);
  }
};

export const devWarn = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(message, ...args);
  }
};

export const devError = (message: string, ...args: any[]) => {
  console.error(message, ...args);
};