import { NextRequest, NextResponse } from 'next/server';
import { CircuitBreakerManager } from '@/lib/resilience/circuitBreaker';
import { RetryManager } from '@/lib/resilience/retryMechanism';
import { AsyncErrorHandler } from '@/lib/error/asyncErrorHandler';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const format = searchParams.get('format') || 'json';

    const circuitBreakerManager = CircuitBreakerManager.getInstance();
    const retryManager = RetryManager.getInstance();
    const errorHandler = AsyncErrorHandler.getInstance();

    let response: any = {};

    switch (type) {
      case 'circuit-breakers':
        response = circuitBreakerManager.getAllStats();
        break;
      
      case 'retry':
        response = retryManager.getAllStats();
        break;
      
      case 'errors':
        response = errorHandler.getErrorStats();
        break;
      
      case 'all':
      default:
        response = {
          circuitBreakers: circuitBreakerManager.getAllStats(),
          retry: retryManager.getAllStats(),
          errors: errorHandler.getErrorStats(),
          timestamp: new Date().toISOString()
        };
        break;
    }

    if (format === 'text') {
      return new NextResponse(
        formatResilienceStatsAsText(response, type),
        { 
          headers: { 'Content-Type': 'text/plain' },
          status: 200 
        }
      );
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error getting resilience stats:', error);
    return NextResponse.json(
      { error: 'Failed to get resilience statistics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, target } = await request.json();
    
    const circuitBreakerManager = CircuitBreakerManager.getInstance();
    const retryManager = RetryManager.getInstance();

    let result: any = {};

    switch (action) {
      case 'reset-circuit-breakers':
        if (target) {
          const breaker = circuitBreakerManager.getBreaker(target);
          breaker.reset();
          result = { message: `Circuit breaker ${target} reset`, target };
        } else {
          circuitBreakerManager.resetAll();
          result = { message: 'All circuit breakers reset' };
        }
        break;

      case 'force-open-circuit-breaker':
        if (!target) {
          return NextResponse.json(
            { error: 'Target circuit breaker name required' },
            { status: 400 }
          );
        }
        const breaker = circuitBreakerManager.getBreaker(target);
        breaker.forceOpen();
        result = { message: `Circuit breaker ${target} forced open`, target };
        break;

      case 'reset-retry-stats':
        if (target) {
          const retryMechanism = retryManager.getRetryMechanism(target);
          retryMechanism.reset();
          result = { message: `Retry stats for ${target} reset`, target };
        } else {
          retryManager.resetAll();
          result = { message: 'All retry stats reset' };
        }
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: reset-circuit-breakers, force-open-circuit-breaker, reset-retry-stats' },
          { status: 400 }
        );
    }

    result.timestamp = new Date().toISOString();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error performing resilience action:', error);
    return NextResponse.json(
      { error: 'Failed to perform resilience action' },
      { status: 500 }
    );
  }
}

function formatResilienceStatsAsText(stats: any, type: string): string {
  if (type === 'circuit-breakers') {
    let output = 'Circuit Breaker Statistics\n';
    output += '==========================\n\n';
    
    for (const [name, breaker] of Object.entries(stats as any)) {
      output += `${name}:\n`;
      output += `  State: ${breaker.state}\n`;
      output += `  Total Calls: ${breaker.totalCalls}\n`;
      output += `  Total Failures: ${breaker.totalFailures}\n`;
      output += `  Total Successes: ${breaker.totalSuccesses}\n`;
      output += `  Current Failure Count: ${breaker.failureCount}\n`;
      output += `  Last Failure: ${breaker.lastFailureTime ? new Date(breaker.lastFailureTime).toISOString() : 'None'}\n`;
      output += `  Last Success: ${breaker.lastSuccessTime ? new Date(breaker.lastSuccessTime).toISOString() : 'None'}\n\n`;
    }
    
    return output;
  }

  if (type === 'retry') {
    let output = 'Retry Mechanism Statistics\n';
    output += '==========================\n\n';
    
    for (const [name, retry] of Object.entries(stats as any)) {
      output += `${name}:\n`;
      output += `  Total Attempts: ${retry.totalAttempts}\n`;
      output += `  Successful Retries: ${retry.successfulRetries}\n`;
      output += `  Failed Retries: ${retry.failedRetries}\n`;
      output += `  Average Attempts: ${retry.averageAttempts.toFixed(2)}\n`;
      output += `  Last Retry: ${retry.lastRetryTime ? new Date(retry.lastRetryTime).toISOString() : 'None'}\n\n`;
    }
    
    return output;
  }

  if (type === 'errors') {
    let output = 'Error Handling Statistics\n';
    output += '========================\n\n';
    output += `Total Errors: ${stats.totalErrors}\n`;
    output += `Error Rate: ${stats.errorRate.toFixed(2)}%\n`;
    output += `Recent Errors: ${stats.recentErrors.length}\n\n`;
    
    if (stats.recentErrors.length > 0) {
      output += 'Recent Error Details:\n';
      output += '--------------------\n';
      for (const error of stats.recentErrors.slice(0, 5)) {
        output += `- ${error.operation}: ${error.error} (${new Date(error.timestamp).toISOString()})\n`;
      }
    }
    
    return output;
  }

  // Full stats format
  let output = 'Resilience System Statistics\n';
  output += '============================\n\n';
  
  output += 'Circuit Breakers:\n';
  output += '-----------------\n';
  for (const [name, breaker] of Object.entries(stats.circuitBreakers as any)) {
    output += `${name}: ${breaker.state} (${breaker.totalCalls} calls, ${breaker.totalFailures} failures)\n`;
  }
  
  output += '\nRetry Mechanisms:\n';
  output += '-----------------\n';
  for (const [name, retry] of Object.entries(stats.retry as any)) {
    output += `${name}: ${retry.totalAttempts} attempts, ${retry.successfulRetries} successful retries\n`;
  }
  
  output += '\nError Handling:\n';
  output += '---------------\n';
  output += `Total Errors: ${stats.errors.totalErrors}\n`;
  output += `Error Rate: ${stats.errors.errorRate.toFixed(2)}%\n`;
  
  output += `\nGenerated: ${stats.timestamp}\n`;
  
  return output;
}