/**
 * Emergency Circuit Breakers System
 * Global system protection with automatic service degradation
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CircuitBreakerMetric {
  name: string;
  currentValue: number;
  warningThreshold: number;
  criticalThreshold: number;
  lastReset: Date;
  emergencyAction: EmergencyAction;
}

export type EmergencyAction = 
  | 'disable_anonymous_ai'
  | 'enable_message_queue'
  | 'require_captcha'
  | 'disable_uploads'
  | 'force_login_prompt'
  | 'rate_limit_all';

export interface CircuitBreakerConfig {
  metrics: Record<string, {
    warningThreshold: number;
    criticalThreshold: number;
    emergencyAction: EmergencyAction;
    description: string;
  }>;
}

// Circuit breaker configuration matching the documentation
export const CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  metrics: {
    'ai_calls_per_hour': {
      warningThreshold: 3000,
      criticalThreshold: 4000,
      emergencyAction: 'disable_anonymous_ai',
      description: 'Disable AI for anonymous users when overwhelmed'
    },
    'messages_per_hour': {
      warningThreshold: 15000,
      criticalThreshold: 20000,
      emergencyAction: 'enable_message_queue',
      description: 'Enable message queuing during high traffic'
    },
    'new_users_per_hour': {
      warningThreshold: 500,
      criticalThreshold: 750,
      emergencyAction: 'require_captcha',
      description: 'Require captcha for new registrations'
    },
    'file_uploads_per_hour': {
      warningThreshold: 1000,
      criticalThreshold: 1500,
      emergencyAction: 'disable_uploads',
      description: 'Temporarily disable file uploads'
    }
  }
};

/**
 * Circuit breaker state management
 */
export class CircuitBreakerMonitor {
  private static instance: CircuitBreakerMonitor;
  private metrics: Map<string, CircuitBreakerMetric> = new Map();
  private emergencyMode = false;

  static getInstance(): CircuitBreakerMonitor {
    if (!CircuitBreakerMonitor.instance) {
      CircuitBreakerMonitor.instance = new CircuitBreakerMonitor();
    }
    return CircuitBreakerMonitor.instance;
  }

  private constructor() {
    // Initialize metrics from config
    Object.entries(CIRCUIT_BREAKER_CONFIG.metrics).forEach(([name, config]) => {
      this.metrics.set(name, {
        name,
        currentValue: 0,
        warningThreshold: config.warningThreshold,
        criticalThreshold: config.criticalThreshold,
        lastReset: new Date(),
        emergencyAction: config.emergencyAction
      });
    });
  }

  /**
   * Increment a metric counter
   */
  async incrementMetric(metricName: string, amount: number = 1): Promise<void> {
    const metric = this.metrics.get(metricName);
    if (!metric) {
      console.warn(`Unknown circuit breaker metric: ${metricName}`);
      return;
    }

    metric.currentValue += amount;

    // Check if we've crossed thresholds
    if (metric.currentValue >= metric.criticalThreshold) {
      await this.triggerEmergencyAction(metric);
    } else if (metric.currentValue >= metric.warningThreshold) {
      this.logWarning(metric);
    }

    // Persist to database for monitoring
    await this.persistMetric(metric);
  }

  /**
   * Get current metric value
   */
  getMetric(metricName: string): number {
    return this.metrics.get(metricName)?.currentValue || 0;
  }

  /**
   * Get all metrics status
   */
  getAllMetrics(): CircuitBreakerMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Check if a specific emergency action is active
   */
  isEmergencyActionActive(action: EmergencyAction): boolean {
    return Array.from(this.metrics.values()).some(
      metric => metric.currentValue >= metric.criticalThreshold && metric.emergencyAction === action
    );
  }

  /**
   * Check if any emergency action is active
   */
  isInEmergencyMode(): boolean {
    return this.emergencyMode || Array.from(this.metrics.values()).some(
      metric => metric.currentValue >= metric.criticalThreshold
    );
  }

  /**
   * Reset metrics (called hourly)
   */
  async resetHourlyMetrics(): Promise<void> {
    const now = new Date();
    
    for (const metric of this.metrics.values()) {
      // Reset if more than an hour has passed
      if (now.getTime() - metric.lastReset.getTime() >= 3600000) {
        metric.currentValue = 0;
        metric.lastReset = now;
        await this.persistMetric(metric);
      }
    }

    // Reset emergency mode if no critical metrics
    this.emergencyMode = false;
    console.log('Circuit breaker metrics reset for new hour');
  }

  /**
   * Trigger emergency action
   */
  private async triggerEmergencyAction(metric: CircuitBreakerMetric): Promise<void> {
    this.emergencyMode = true;
    
    console.error(`🚨 EMERGENCY: ${metric.name} exceeded critical threshold (${metric.currentValue}/${metric.criticalThreshold})`);
    console.error(`Emergency action: ${metric.emergencyAction}`);

    // Log to database for monitoring
    await this.logEmergencyEvent(metric);

    // Trigger specific emergency actions
    switch (metric.emergencyAction) {
      case 'disable_anonymous_ai':
        await this.disableAnonymousAI();
        break;
      case 'enable_message_queue':
        await this.enableMessageQueue();
        break;
      case 'require_captcha':
        await this.requireCaptcha();
        break;
      case 'disable_uploads':
        await this.disableUploads();
        break;
      case 'force_login_prompt':
        await this.forceLoginPrompt();
        break;
      case 'rate_limit_all':
        await this.rateLimitAll();
        break;
    }
  }

  /**
   * Log warning when approaching threshold
   */
  private logWarning(metric: CircuitBreakerMetric): void {
    const percentage = Math.round((metric.currentValue / metric.criticalThreshold) * 100);
    console.warn(`⚠️  Circuit breaker warning: ${metric.name} at ${percentage}% (${metric.currentValue}/${metric.criticalThreshold})`);
  }

  /**
   * Persist metric to database for monitoring
   */
  private async persistMetric(metric: CircuitBreakerMetric): Promise<void> {
    try {
      await supabase
        .from('system_circuit_breakers')
        .upsert({
          metric_name: metric.name,
          current_value: metric.currentValue,
          threshold_warning: metric.warningThreshold,
          threshold_critical: metric.criticalThreshold,
          last_reset: metric.lastReset.toISOString()
        }, { onConflict: 'metric_name' });
    } catch (error) {
      console.error('Failed to persist circuit breaker metric:', error);
    }
  }

  /**
   * Log emergency event
   */
  private async logEmergencyEvent(metric: CircuitBreakerMetric): Promise<void> {
    try {
      await supabase
        .from('system_emergency_events')
        .insert({
          metric_name: metric.name,
          trigger_value: metric.currentValue,
          threshold: metric.criticalThreshold,
          emergency_action: metric.emergencyAction,
          triggered_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to log emergency event:', error);
    }
  }

  // Emergency action implementations
  private async disableAnonymousAI(): Promise<void> {
    console.log('🚨 Emergency: Disabling AI for anonymous users');
    // Implementation would set a flag that anonymous endpoints check
  }

  private async enableMessageQueue(): Promise<void> {
    console.log('🚨 Emergency: Enabling message queue');
    // Implementation would enable queuing for non-critical messages
  }

  private async requireCaptcha(): Promise<void> {
    console.log('🚨 Emergency: Requiring captcha for new users');
    // Implementation would enable captcha requirement
  }

  private async disableUploads(): Promise<void> {
    console.log('🚨 Emergency: Disabling file uploads');
    // Implementation would disable upload endpoints
  }

  private async forceLoginPrompt(): Promise<void> {
    console.log('🚨 Emergency: Forcing login prompts');
    // Implementation would require authentication for more actions
  }

  private async rateLimitAll(): Promise<void> {
    console.log('🚨 Emergency: Enabling aggressive rate limiting');
    // Implementation would reduce rate limits across the board
  }
}

// Singleton instance
export const circuitBreakerMonitor = CircuitBreakerMonitor.getInstance();

/**
 * Middleware function to check circuit breakers
 */
export function checkCircuitBreakers() {
  const monitor = circuitBreakerMonitor;
  
  return {
    // Check if anonymous AI should be blocked
    shouldBlockAnonymousAI(): boolean {
      return monitor.isEmergencyActionActive('disable_anonymous_ai');
    },

    // Check if uploads should be blocked
    shouldBlockUploads(): boolean {
      return monitor.isEmergencyActionActive('disable_uploads');
    },

    // Check if captcha is required
    shouldRequireCaptcha(): boolean {
      return monitor.isEmergencyActionActive('require_captcha');
    },

    // Check if message queuing is enabled
    shouldQueueMessages(): boolean {
      return monitor.isEmergencyActionActive('enable_message_queue');
    },

    // Check if system is in emergency mode
    isEmergencyMode(): boolean {
      return monitor.isInEmergencyMode();
    },

    // Get current system status
    getSystemStatus(): {
      emergencyMode: boolean;
      metrics: CircuitBreakerMetric[];
      activeActions: EmergencyAction[];
    } {
      const metrics = monitor.getAllMetrics();
      const activeActions = metrics
        .filter(m => m.currentValue >= m.criticalThreshold)
        .map(m => m.emergencyAction);

      return {
        emergencyMode: monitor.isInEmergencyMode(),
        metrics,
        activeActions
      };
    }
  };
}

/**
 * Track various system events
 */
export const trackSystemEvent = {
  aiRequest: () => circuitBreakerMonitor.incrementMetric('ai_calls_per_hour'),
  message: () => circuitBreakerMonitor.incrementMetric('messages_per_hour'),
  newUser: () => circuitBreakerMonitor.incrementMetric('new_users_per_hour'),
  fileUpload: () => circuitBreakerMonitor.incrementMetric('file_uploads_per_hour')
};

// Export the monitor for direct access
export { circuitBreakerMonitor as monitor };