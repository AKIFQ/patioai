// Circuit breaker pattern for external API calls
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, calls fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  recoveryTimeout: number;       // Time to wait before trying again (ms)
  monitoringWindow: number;      // Time window for failure counting (ms)
  halfOpenMaxCalls: number;      // Max calls to allow in half-open state
  successThreshold: number;      // Successes needed to close circuit
}

interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private halfOpenCalls = 0;
  private performanceMonitor = PerformanceMonitor.getInstance();

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.totalCalls++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
        this.successCount = 0;
        console.log(`Circuit breaker ${this.name}: Moving to HALF_OPEN state`);
      } else {
        // Fail fast
        const error = new Error(`Circuit breaker ${this.name} is OPEN`);
        this.recordMetric('circuit.open', startTime, false, error.message);
        throw error;
      }
    }

    // Limit calls in half-open state
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        const error = new Error(`Circuit breaker ${this.name} half-open limit exceeded`);
        this.recordMetric('circuit.halfOpenLimit', startTime, false, error.message);
        throw error;
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess(startTime);
      return result;
    } catch (error) {
      this.onFailure(startTime, error as Error);
      throw error;
    }
  }

  private onSuccess(startTime: number): void {
    this.totalSuccesses++;
    this.successCount++;
    this.lastSuccessTime = Date.now();
    
    this.recordMetric('circuit.success', startTime, true);

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        console.log(`Circuit breaker ${this.name}: Moving to CLOSED state`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(startTime: number, error: Error): void {
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    this.recordMetric('circuit.failure', startTime, false, error.message);

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      console.log(`Circuit breaker ${this.name}: Moving to OPEN state (half-open failure)`);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        console.log(`Circuit breaker ${this.name}: Moving to OPEN state (threshold reached)`);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    const now = Date.now();
    return (now - this.lastFailureTime) >= this.config.recoveryTimeout;
  }

  private recordMetric(operation: string, startTime: number, success: boolean, error?: string): void {
    this.performanceMonitor.recordMetric(
      `circuitBreaker.${this.name}.${operation}`,
      startTime,
      success,
      error,
      {
        state: this.state,
        failureCount: this.failureCount,
        successCount: this.successCount
      }
    );
  }

  // Get current statistics
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }

  // Reset circuit breaker
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    console.log(`Circuit breaker ${this.name}: Reset to CLOSED state`);
  }

  // Force open circuit (for testing or maintenance)
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
    console.log(`Circuit breaker ${this.name}: Forced to OPEN state`);
  }
}

// Circuit breaker manager for multiple services
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private breakers = new Map<string, CircuitBreaker>();

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  // Get or create circuit breaker for a service
  getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        recoveryTimeout: 60000, // 1 minute
        monitoringWindow: 300000, // 5 minutes
        halfOpenMaxCalls: 3,
        successThreshold: 2
      };

      const finalConfig = { ...defaultConfig, ...config };
      this.breakers.set(name, new CircuitBreaker(name, finalConfig));
    }

    return this.breakers.get(name)!;
  }

  // Get all circuit breaker statistics
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  // Reset all circuit breakers
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Predefined circuit breakers for common services
export const circuitBreakers = {
  // OpenAI API
  openai: () => CircuitBreakerManager.getInstance().getBreaker('openai', {
    failureThreshold: 3,
    recoveryTimeout: 30000, // 30 seconds
    halfOpenMaxCalls: 2,
    successThreshold: 2
  }),

  // Anthropic API
  anthropic: () => CircuitBreakerManager.getInstance().getBreaker('anthropic', {
    failureThreshold: 3,
    recoveryTimeout: 30000,
    halfOpenMaxCalls: 2,
    successThreshold: 2
  }),

  // Supabase API
  supabase: () => CircuitBreakerManager.getInstance().getBreaker('supabase', {
    failureThreshold: 5,
    recoveryTimeout: 10000, // 10 seconds
    halfOpenMaxCalls: 3,
    successThreshold: 3
  }),

  // External metadata services
  metadata: () => CircuitBreakerManager.getInstance().getBreaker('metadata', {
    failureThreshold: 3,
    recoveryTimeout: 60000, // 1 minute
    halfOpenMaxCalls: 2,
    successThreshold: 2
  }),

  // Search services
  search: () => CircuitBreakerManager.getInstance().getBreaker('search', {
    failureThreshold: 4,
    recoveryTimeout: 45000, // 45 seconds
    halfOpenMaxCalls: 2,
    successThreshold: 2
  })
};