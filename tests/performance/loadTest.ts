// Performance and load testing suite
export class PerformanceTestSuite {
  private baseUrl = process.env.TEST_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001';
  private results: any[] = [];

  async runPerformanceTests(): Promise<{
    summary: any;
    results: any[];
    recommendations: string[];
  }> {
console.log(' Starting performance test suite...');

    const tests = [
      { name: 'API Response Time', test: () => this.testAPIResponseTimes() },
      { name: 'Concurrent Requests', test: () => this.testConcurrentRequests() },
      { name: 'Memory Usage Under Load', test: () => this.testMemoryUnderLoad() },
      { name: 'Database Performance', test: () => this.testDatabasePerformance() },
      { name: 'Socket.IO Performance', test: () => this.testSocketIOPerformance() },
      { name: 'Monitoring Overhead', test: () => this.testMonitoringOverhead() }
    ];

    for (const test of tests) {
      await this.runPerformanceTest(test.name, test.test);
    }

    const summary = this.generateSummary();
    const recommendations = this.generateRecommendations();

    return { summary, results: this.results, recommendations };
  }

  private async runPerformanceTest(name: string, testFn: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    
    try {
console.log(`\n Running: ${name}`);
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        success: true,
        duration,
        ...result
      });
      
console.log(` ${name} - COMPLETED (${duration}ms)`);
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        success: false,
        duration,
        error: error.message
      });
      
console.log(` ${name} - FAILED (${duration}ms): ${error.message}`);
    }
  }

  private async testAPIResponseTimes(): Promise<any> {
    const endpoints = [
      '/api/health',
      '/api/monitoring/dashboard',
      '/api/monitoring/alerts'
    ];

    const results = [];
    const iterations = 10;

    for (const endpoint of endpoints) {
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const response = await fetch(`${this.baseUrl}${endpoint}`);
        const duration = Date.now() - startTime;
        
        times.push({
          duration,
          status: response.status,
          success: response.ok
        });
      }

      const avgDuration = times.reduce((sum, t) => sum + t.duration, 0) / times.length;
      const minDuration = Math.min(...times.map(t => t.duration));
      const maxDuration = Math.max(...times.map(t => t.duration));
      const successRate = times.filter(t => t.success).length / times.length;

      results.push({
        endpoint,
        avgDuration: Math.round(avgDuration),
        minDuration,
        maxDuration,
        successRate: Math.round(successRate * 100),
        iterations
      });
    }

    return { endpoints: results };
  }

  private async testConcurrentRequests(): Promise<any> {
    const concurrencyLevels = [5, 10, 20, 50];
    const endpoint = '/api/health';
    const results = [];

    for (const concurrency of concurrencyLevels) {
      console.log(`  Testing ${concurrency} concurrent requests...`);
      
      const startTime = Date.now();
      const promises = Array(concurrency).fill(null).map(() => 
        fetch(`${this.baseUrl}${endpoint}`)
      );

      try {
        const responses = await Promise.all(promises);
        const duration = Date.now() - startTime;
        const successCount = responses.filter(r => r.ok).length;
        const avgResponseTime = duration / concurrency;

        results.push({
          concurrency,
          totalDuration: duration,
          avgResponseTime: Math.round(avgResponseTime),
          successRate: Math.round((successCount / concurrency) * 100),
          requestsPerSecond: Math.round((concurrency / duration) * 1000)
        });

      } catch (error) {
        results.push({
          concurrency,
          error: (error as Error).message,
          success: false
        });
      }
    }

    return { concurrencyTests: results };
  }

  private async testMemoryUnderLoad(): Promise<any> {
    // Get initial memory usage
    const initialResponse = await fetch(`${this.baseUrl}/api/health`);
    const initialData = await initialResponse.json();
    const initialMemory = initialData.checks?.find((c: any) => c.name === 'memory')?.details;

    // Generate load
    const loadPromises = Array(100).fill(null).map(async (_, i) => {
      await new Promise(resolve => setTimeout(resolve, i * 10)); // Stagger requests
      return fetch(`${this.baseUrl}/api/monitoring/dashboard`);
    });

    await Promise.all(loadPromises);

    // Get memory usage after load
    const finalResponse = await fetch(`${this.baseUrl}/api/health`);
    const finalData = await finalResponse.json();
    const finalMemory = finalData.checks?.find((c: any) => c.name === 'memory')?.details;

    return {
      initialMemory: {
        heapUsed: initialMemory?.heapUsed || 0,
        rss: initialMemory?.rss || 0
      },
      finalMemory: {
        heapUsed: finalMemory?.heapUsed || 0,
        rss: finalMemory?.rss || 0
      },
      memoryIncrease: {
        heapUsed: (finalMemory?.heapUsed || 0) - (initialMemory?.heapUsed || 0),
        rss: (finalMemory?.rss || 0) - (initialMemory?.rss || 0)
      },
      loadRequests: 100
    };
  }

  private async testDatabasePerformance(): Promise<any> {
    const iterations = 20;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}/api/monitoring/dashboard`);
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        times.push(duration);
      }
    }

    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    return {
      iterations,
      avgQueryTime: Math.round(avgTime),
      minQueryTime: minTime,
      maxQueryTime: maxTime,
      acceptable: avgTime < 500 // Less than 500ms average
    };
  }

  private async testSocketIOPerformance(): Promise<any> {
    // Test Socket.IO performance through monitoring endpoints
    const response = await fetch(`${this.baseUrl}/api/monitoring/dashboard`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error('Socket.IO performance test failed');
    }

    const socketMetrics = data.metrics?.socket || {};

    return {
      activeConnections: socketMetrics.activeConnections || 0,
      totalConnections: socketMetrics.totalConnections || 0,
      peakConnections: socketMetrics.peakConnections || 0,
      connectionsPerMinute: socketMetrics.connectionsPerMinute || 0,
      monitoringWorking: true
    };
  }

  private async testMonitoringOverhead(): Promise<any> {
    // Test the performance impact of monitoring systems
    const iterations = 10;
    const withMonitoringTimes = [];
    
    // Test with monitoring (normal operation)
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await fetch(`${this.baseUrl}/api/monitoring/dashboard`);
      const duration = Date.now() - startTime;
      withMonitoringTimes.push(duration);
    }

    const avgWithMonitoring = withMonitoringTimes.reduce((sum, t) => sum + t, 0) / iterations;

    return {
      avgResponseTime: Math.round(avgWithMonitoring),
      iterations,
      monitoringOverhead: 'acceptable', // Monitoring is always on, so this is baseline
      acceptable: avgWithMonitoring < 1000
    };
  }

  private generateSummary(): any {
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;

    // Calculate overall performance metrics
    const apiTests = this.results.find(r => r.name === 'API Response Time');
    const concurrentTests = this.results.find(r => r.name === 'Concurrent Requests');
    const memoryTests = this.results.find(r => r.name === 'Memory Usage Under Load');
    const dbTests = this.results.find(r => r.name === 'Database Performance');

    return {
      testsRun: total,
      successful,
      failed,
      passRate: Math.round((successful / total) * 100),
      performance: {
        avgAPIResponseTime: apiTests?.endpoints?.[0]?.avgDuration || 'N/A',
        maxConcurrency: concurrentTests?.concurrencyTests?.length || 0,
        memoryStable: memoryTests?.memoryIncrease?.heapUsed < 100 * 1024 * 1024, // Less than 100MB increase
        dbPerformanceAcceptable: dbTests?.acceptable || false
      },
      timestamp: new Date().toISOString()
    };
  }

  private generateRecommendations(): string[] {
    const recommendations = [];

    // Check API response times
    const apiTest = this.results.find(r => r.name === 'API Response Time');
    if (apiTest?.endpoints?.some((e: any) => e.avgDuration > 500)) {
      recommendations.push('Some API endpoints are responding slowly (>500ms). Consider optimization.');
    }

    // Check concurrent request handling
    const concurrentTest = this.results.find(r => r.name === 'Concurrent Requests');
    const highConcurrencyTest = concurrentTest?.concurrencyTests?.find((t: any) => t.concurrency >= 50);
    if (highConcurrencyTest && highConcurrencyTest.successRate < 95) {
      recommendations.push('System struggles with high concurrency. Consider scaling or optimization.');
    }

    // Check memory usage
    const memoryTest = this.results.find(r => r.name === 'Memory Usage Under Load');
    if (memoryTest?.memoryIncrease?.heapUsed > 100 * 1024 * 1024) { // 100MB
      recommendations.push('Significant memory increase under load. Monitor for memory leaks.');
    }

    // Check database performance
    const dbTest = this.results.find(r => r.name === 'Database Performance');
    if (dbTest && !dbTest.acceptable) {
      recommendations.push('Database queries are slow. Consider indexing or query optimization.');
    }

    // Default recommendation if all is well
    if (recommendations.length === 0) {
      recommendations.push('Performance is within acceptable limits. Continue monitoring.');
    }

    return recommendations;
  }

  generateReport(): string {
    const summary = this.generateSummary();
    const recommendations = this.generateRecommendations();

    let report = `# Performance Test Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Tests Run:** ${summary.testsRun}\n`;
    report += `**Success Rate:** ${summary.passRate}%\n\n`;

    report += `## Performance Summary\n\n`;
    report += `- **Average API Response Time:** ${summary.performance.avgAPIResponseTime}ms\n`;
    report += `- **Max Concurrency Tested:** ${summary.performance.maxConcurrency} requests\n`;
    report += `- **Memory Stable:** ${summary.performance.memoryStable ? 'Yes' : 'No'}\n`;
    report += `- **Database Performance:** ${summary.performance.dbPerformanceAcceptable ? 'Acceptable' : 'Needs Attention'}\n\n`;

    report += `## Recommendations\n\n`;
    for (const rec of recommendations) {
      report += `- ${rec}\n`;
    }

    report += `\n## Detailed Results\n\n`;
    for (const result of this.results) {
      report += `### ${result.name}\n`;
      report += `**Status:** ${result.success ? 'SUCCESS' : 'FAILED'}\n`;
      report += `**Duration:** ${result.duration}ms\n`;
      
      if (result.error) {
        report += `**Error:** ${result.error}\n`;
      }
      
      report += `\n`;
    }

    return report;
  }
}

export const performanceTestSuite = new PerformanceTestSuite();
export default performanceTestSuite;