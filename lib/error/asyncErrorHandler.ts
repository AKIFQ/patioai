// Async error handling with user feedback
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

export interface ErrorContext {
  operation: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface UserFeedback {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    handler: () => void;
  };
  duration?: number; // Auto-dismiss after milliseconds
}

export interface ErrorHandlingResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  userFeedback?: UserFeedback;
  shouldRetry?: boolean;
}

export class AsyncErrorHandler {
  private static instance: AsyncErrorHandler;
  private performanceMonitor = PerformanceMonitor.getInstance();
  private errorListeners: Array<(feedback: UserFeedback) => void> = [];

  static getInstance(): AsyncErrorHandler {
    if (!AsyncErrorHandler.instance) {
      AsyncErrorHandler.instance = new AsyncErrorHandler();
    }
    return AsyncErrorHandler.instance;
  }

  // Register error feedback listener (for UI components)
  onErrorFeedback(listener: (feedback: UserFeedback) => void): () => void {
    this.errorListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  // Handle async operation with comprehensive error handling
  async handleAsync<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<ErrorHandlingResult<T>> {
    const startTime = Date.now();
    
    try {
      const data = await operation();
      
      this.performanceMonitor.recordMetric(
        `asyncError.${context.operation}.success`,
        startTime,
        true,
        undefined,
        context.metadata
      );

      return {
        success: true,
        data
      };

    } catch (error) {
      const errorObj = error as Error;
      
      this.performanceMonitor.recordMetric(
        `asyncError.${context.operation}.error`,
        startTime,
        false,
        errorObj.message,
        {
          ...context.metadata,
          errorName: errorObj.name,
          errorStack: errorObj.stack
        }
      );

      const result = this.processError(errorObj, context);
      
      // Emit user feedback if provided
      if (result.userFeedback) {
        this.emitUserFeedback(result.userFeedback);
      }

      return result;
    }
  }

  // Process error and determine appropriate response
  private processError(error: Error, context: ErrorContext): ErrorHandlingResult<never> {
    const errorType = this.categorizeError(error);
    const userFeedback = this.generateUserFeedback(error, errorType, context);
    const shouldRetry = this.shouldRetryError(error, errorType);

    // Log error for debugging
    console.error(`Async error in ${context.operation}:`, error);

    return {
      success: false,
      error,
      userFeedback,
      shouldRetry
    };
  }

  // Categorize error type
  private categorizeError(error: Error): string {
    // Network errors
    if (error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('connection')) {
      return 'network';
    }

    // Authentication errors
    if (error.message.includes('unauthorized') || 
        error.message.includes('authentication') ||
        error.message.includes('token')) {
      return 'auth';
    }

    // Validation errors
    if (error.message.includes('validation') || 
        error.message.includes('invalid') ||
        error.name === 'ValidationError') {
      return 'validation';
    }

    // Rate limiting
    if (error.message.includes('rate limit') || 
        error.message.includes('too many requests')) {
      return 'rateLimit';
    }

    // Server errors
    if (error.message.includes('server') || 
        error.message.includes('internal')) {
      return 'server';
    }

    // Timeout errors
    if (error.message.includes('timeout') || 
        error.name === 'TimeoutError') {
      return 'timeout';
    }

    return 'unknown';
  }

  // Generate user-friendly feedback
  private generateUserFeedback(error: Error, errorType: string, context: ErrorContext): UserFeedback {
    switch (errorType) {
      case 'network':
        return {
          type: 'error',
          title: 'Connection Problem',
          message: 'Unable to connect to the server. Please check your internet connection and try again.',
          action: {
            label: 'Retry',
            handler: () => {
              // This would trigger a retry in the calling component
              console.log('User requested retry for network error');
            }
          },
          duration: 5000
        };

      case 'auth':
        return {
          type: 'error',
          title: 'Authentication Required',
          message: 'Your session has expired. Please sign in again to continue.',
          action: {
            label: 'Sign In',
            handler: () => {
              // This would redirect to sign in
              window.location.href = '/auth/signin';
            }
          }
        };

      case 'validation':
        return {
          type: 'warning',
          title: 'Invalid Input',
          message: 'Please check your input and try again.',
          duration: 4000
        };

      case 'rateLimit':
        return {
          type: 'warning',
          title: 'Too Many Requests',
          message: 'You\'re sending requests too quickly. Please wait a moment and try again.',
          duration: 6000
        };

      case 'server':
        return {
          type: 'error',
          title: 'Server Error',
          message: 'Something went wrong on our end. We\'re working to fix it.',
          action: {
            label: 'Try Again',
            handler: () => {
              console.log('User requested retry for server error');
            }
          },
          duration: 5000
        };

      case 'timeout':
        return {
          type: 'warning',
          title: 'Request Timeout',
          message: 'The request is taking longer than expected. Please try again.',
          action: {
            label: 'Retry',
            handler: () => {
              console.log('User requested retry for timeout');
            }
          },
          duration: 5000
        };

      default:
        return {
          type: 'error',
          title: 'Unexpected Error',
          message: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
          action: {
            label: 'Try Again',
            handler: () => {
              console.log('User requested retry for unknown error');
            }
          },
          duration: 5000
        };
    }
  }

  // Determine if error should trigger retry
  private shouldRetryError(error: Error, errorType: string): boolean {
    switch (errorType) {
      case 'network':
      case 'timeout':
      case 'server':
        return true;
      case 'rateLimit':
        return true; // But with longer delay
      case 'auth':
      case 'validation':
        return false;
      default:
        return false;
    }
  }

  // Emit user feedback to registered listeners
  private emitUserFeedback(feedback: UserFeedback): void {
    for (const listener of this.errorListeners) {
      try {
        listener(feedback);
      } catch (error) {
        console.error('Error in feedback listener:', error);
      }
    }
  }

  // Get error statistics
  getErrorStats(): Record<string, any> {
    const summary = this.performanceMonitor.getPerformanceSummary();
    return {
      totalErrors: summary.overall.totalOperations,
      errorRate: 100 - parseFloat(summary.overall.successRate),
      recentErrors: summary.recentMetrics.filter(m => !m.success)
    };
  }
}

// Convenience functions for common async operations
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  metadata?: Record<string, any>
): Promise<ErrorHandlingResult<T>> {
  const handler = AsyncErrorHandler.getInstance();
  return handler.handleAsync(operation, {
    operation: operationName,
    metadata
  });
}

// Higher-order function for wrapping async functions
export function withAsyncErrorHandling<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  operationName: string
) {
  return async (...args: TArgs): Promise<ErrorHandlingResult<TReturn>> => {
    return handleAsyncOperation(
      () => fn(...args),
      operationName,
      { args: args.length }
    );
  };
}

// React hook for handling async errors
export function useAsyncErrorHandler() {
  const handler = AsyncErrorHandler.getInstance();
  
  return {
    handleAsync: handler.handleAsync.bind(handler),
    onErrorFeedback: handler.onErrorFeedback.bind(handler),
    getErrorStats: handler.getErrorStats.bind(handler)
  };
}

// Specialized error handlers for different contexts
export const errorHandlers = {
  // Chat operations
  chat: (operation: () => Promise<any>) => 
    handleAsyncOperation(operation, 'chat'),

  // Room operations  
  room: (operation: () => Promise<any>) =>
    handleAsyncOperation(operation, 'room'),

  // Document operations
  document: (operation: () => Promise<any>) =>
    handleAsyncOperation(operation, 'document'),

  // API calls
  api: (operation: () => Promise<any>) =>
    handleAsyncOperation(operation, 'api'),

  // Database operations
  database: (operation: () => Promise<any>) =>
    handleAsyncOperation(operation, 'database')
};