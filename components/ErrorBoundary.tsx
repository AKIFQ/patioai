'use client';

import React, { Component, ReactNode } from 'react';
import { toast } from 'sonner';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: any, errorId: string) => void;
  showToast?: boolean;
  critical?: boolean; // If true, shows critical error UI
}

export class ChatErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.error('🚨 Error Boundary caught error:', errorId, error);
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const { onError, showToast = true } = this.props;
    const { errorId } = this.state;

    // Log detailed error information
    console.error('🚨 Error Boundary Details:', {
      errorId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });

    // Update state with error info
    this.setState({ errorInfo });

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo, errorId);
    }

    // Show user-friendly toast notification
    if (showToast) {
      toast.error('Something went wrong. Please refresh the page if the issue persists.', {
        duration: 5000,
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload()
        }
      });
    }

    // Report error to monitoring service (if available)
    this.reportError(error, errorInfo, errorId);
  }

  private reportError(error: Error, errorInfo: any, errorId: string) {
    // This could be enhanced to send to a monitoring service like Sentry
    try {
      // For now, just log to console in a structured way
      const errorReport = {
        errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      console.log('🚨 Error Report:', JSON.stringify(errorReport, null, 2));
      
      // In a production environment, you might send this to an error reporting service:
      // await fetch('/api/errors', { method: 'POST', body: JSON.stringify(errorReport) });
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }

  private handleRetry = () => {
    console.log('🔄 Retrying after error boundary catch');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorId } = this.state;
    const { fallback, critical = false } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Critical errors show full-screen error
      if (critical) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="max-w-md w-full p-6 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h1 className="text-xl font-semibold text-foreground mb-2">
                  Something went wrong
                </h1>
                <p className="text-muted-foreground mb-4">
                  We encountered an unexpected error. Please try refreshing the page.
                </p>
                <p className="text-xs text-muted-foreground mb-6 font-mono">
                  Error ID: {errorId}
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={this.handleRetry}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleRefresh}
                  className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Non-critical errors show inline error
      return (
        <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/10 dark:border-red-800">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Component Error
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {error?.message || 'An unexpected error occurred'}
              </p>
              <div className="mt-3">
                <button
                  onClick={this.handleRetry}
                  className="text-sm bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-800 dark:text-red-200 px-3 py-1 rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Partial<ErrorBoundaryProps>
) {
  return function WrappedComponent(props: P) {
    return (
      <ChatErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ChatErrorBoundary>
    );
  };
}