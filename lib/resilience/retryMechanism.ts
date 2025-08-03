// Retry mechanism with exponential backoff
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;        // Base delay in milliseconds
  maxDelay: number;         // Maximum delay in milliseconds
  backoffFactor: number;    // Multiplier for exponential backoff
  jitter: boolean;          // Add random jitter to prevent thundering herd
  retryCondition?: (error: any) => boolean; // Custom condition for retrying
}

export interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  lastRetryTime: number;
}

export class RetryMechanism {
  private performanceMonitor = PerformanceMonitor.getInstance();
  private stats: RetryStats = {
    totalAttempts: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageAttempts: 0,
    lastRetryTime: 0
  };

  constructor(private name: string, private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let lastError: Error;
    let attempt = 0;

    for (attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        this.stats.totalAttempts++;
        
        const result = await operation();
        
        // Record success metrics
        this.recordMetric('retry.success', startTime, true, undefined, {
          attempt,
          totalAttempts: attempt
        });

        if (attempt > 1) {
          this.stats.successfulRetries++;
          console.log(`Retry ${this.name}: Succeeded on attempt ${attempt}`);
        }

        this.updateAverageAttempts(attempt);
        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Check if we should retry this error
        if (this.config.retryCondition && !this.config.retryCondition(error)) {
          this.recordMetric('retry.nonRetryableError', startTime, false, lastError.message, {
            attempt,
            error: lastError.name
          });
          throw lastError;
        }

        // Don't wait after the last attempt
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          
          this.recordMetric('retry.attempt', startTime, false, lastError.message, {
            attempt,
            delay,
            error: lastError.name
          });

          console.log(`Retry ${this.name}: Attempt ${attempt} failed, retrying in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    this.stats.failedRetries++;
    this.stats.lastRetryTime = Date.now();
    this.updateAverageAttempts(attempt - 1);

    this.recordMetric('retry.exhausted', startTime, false, lastError!.message, {
      totalAttempts: attempt - 1,
      error: lastError!.name
    });

    console.error(`Retry ${this.name}: All ${this.config.maxAttempts} attempts failed`);
    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    // Calculate exponential backoff delay
    let delay = this.config.baseDelay * Math.pow(this.config.backoffFactor, attempt - 1);
    
    // Cap at maximum delay
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter if enabled
    if (this.config.jitter) {
      // Add random jitter of ±25%
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateAverageAttempts(attempts: number): void {
    const totalOperations = this.stats.successfulRetries + this.stats.failedRetries + 1;
    this.stats.averageAttempts = 
      (this.stats.averageAttempts * (totalOperations - 1) + attempts) / totalOperations;
  }

  private recordMetric(operation: string, startTime: number, success: boolean, error?: string, metadata?: any): void {
    this.performanceMonitor.recordMetric(
      `retry.${this.name}.${operation}`,
      startTime,
      success,
      error,
      metadata
    );
  }

  getStats(): RetryStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      lastRetryTime: 0
    };
  }
}

// Retry manager for different operation types
export class RetryManager {
  private static instance: RetryManager;
  private retryMechanisms = new Map<string, RetryMechanism>();

  static getInstance(): RetryManager {
    if (!RetryManager.instance) {
      RetryManager.instance = new RetryManager();
    }
    return RetryManager.instance;
  }

  getRetryMechanism(name: string, config?: Partial<RetryConfig>): RetryMechanism {
    if (!this.retryMechanisms.has(name)) {
      const defaultConfig: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
        jitter: true,
        retryCondition: (error) => this.isRetryableError(error)
      };

      const finalConfig = { ...defaultConfig, ...config };
      this.retryMechanisms.set(name, new RetryMechanism(name, finalConfig));
    }

    return this.retryMechanisms.get(name)!;
  }

  private isRetryableError(error: any): boolean {
    // Don't retry client errors (4xx) except for specific cases
    if (error.status >= 400 && error.status < 500) {
      // Retry rate limiting and timeout errors
      return error.status === 429 || error.status === 408;
    }

    // Retry server errors (5xx)
    if (error.status >= 500) {
      return true;
    }

    // Retry network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT') {
      return true;
    }

    // Retry timeout errors
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      return true;
    }

    // Don't retry by default
    return false;
  }

  getAllStats(): Record<string, RetryStats> {
    const stats: Record<string, RetryStats> = {};
    
    for (const [name, mechanism] of this.retryMechanisms.entries()) {
      stats[name] = mechanism.getStats();
    }

    return stats;
  }

  resetAll(): void {
    for (const mechanism of this.retryMechanisms.values()) {
      mechanism.reset();
    }
  }
}

// Convenience function for one-off retries
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const retryMechanism = new RetryMechanism('oneoff', {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    jitter: true,
    ...config
  });

  return retryMechanism.execute(operation);
}

// Predefined retry configurations for common operations
export const retryConfigs = {
  // Database operations
  database: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffFactor: 2,
    jitter: true,
    retryCondition: (error: any) => {
      // Retry connection errors and timeouts
      return error.code === 'ECONNRESET' || 
             error.code === 'ETIMEDOUT' ||
             error.message?.includes('connection') ||
             error.message?.includes('timeout');
    }
  },

  // API calls
  api: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 2,
    jitter: true,
    retryCondition: (error: any) => {
      // Retry 5xx errors and rate limiting
      return (error.status >= 500) || error.status === 429;
    }
  },

  // AI service calls
  ai: {
    maxAttempts: 2,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffFactor: 2,
    jitter: true,
    retryCondition: (error: any) => {
      // Retry server errors and rate limiting, but not quota exceeded
      return (error.status >= 500) || 
             (error.status === 429 && !error.message?.includes('quota'));
    }
  },

  // File operations
  file: {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 1.5,
    jitter: false,
    retryCondition: (error: any) => {
      // Retry temporary file system errors
      return error.code === 'EBUSY' || 
             error.code === 'EMFILE' ||
             error.code === 'ENFILE';
    }
  }
};