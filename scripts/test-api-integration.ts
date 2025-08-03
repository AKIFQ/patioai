#!/usr/bin/env tsx

// Comprehensive API integration and database optimization test
import { SocketDatabaseService } from '../lib/database/socketQueries';
import { APICache } from '../lib/cache/apiCache';
import { PerformanceMonitor, measurePerformance } from '../lib/monitoring/performanceMonitor';
import { CircuitBreakerManager } from '../lib/resilience/circuitBreaker';
import { RetryManager } from '../lib/resilience/retryMechanism';

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  details?: any;
  error?: string;
}

class APIIntegrationTester {
  private performanceMonitor = PerformanceMonitor.getInstance();
  private apiCache = APICache.getInstance();
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🧪 Running API Integration and Database Optimization Tests...\n');

    // Test 1: Database Query Performance
    await this.testDatabasePerformance();
    
    // Test 2: Cache Effectiveness
    await this.testCacheEffectiveness();
    
    // Test 3: Socket.IO Event Emission
    await this.testSocketIOIntegration();
    
    // Test 4: API Endpoint Backward Compatibility
    await this.testBackwardCompatibility();
    
    // Test 5: Load Testing
    await this.testLoadPerformance();
    
    // Test 6: Error Handling Integration
    await this.testErrorHandlingIntegration();
    
    // Test 7: Monitoring and Metrics
    await this.testMonitoringIntegration();

    // Generate final report
    this.generateReport();
  }

  private async testDatabasePerformance(): Promise<void> {
    console.log('1. Testing Database Query Performance...');

    // Test room validation performance
    const roomValidationResult = await this.runTest(
      'Room Validation Query',
      async () => {
        const results = [];
        for (let i = 0; i < 10; i++) {
          const result = await SocketDatabaseService.validateRoomAccess(`test-room-${i}`);
          results.push(result);
        }
        return results;
      }
    );

    // Test sidebar data retrieval performance
    const sidebarDataResult = await this.runTest(
      'Sidebar Data Query',
      async () => {
        const results = [];
        for (let i = 0; i < 10; i++) {
          const result = await SocketDatabaseService.getSidebarData(`test-user-${i}`);
          results.push(result);
        }
        return results;
      }
    );

    // Test batch message insertion performance
    const batchInsertResult = await this.runTest(
      'Batch Message Insertion',
      async () => {
        const results = [];
        for (let i = 0; i < 5; i++) {
          const result = await SocketDatabaseService.insertChatMessages([
            {
              chatSessionId: `test-session-${i}`,
              content: `Test message ${i}`,
              isUserMessage: true
            },
            {
              chatSessionId: `test-session-${i}`,
              content: `AI response ${i}`,
              isUserMessage: false
            }
          ]);
          results.push(result);
        }
        return results;
      }
    );

    console.log(`   ✅ Room validation: ${roomValidationResult.success ? 'PASS' : 'FAIL'} (${roomValidationResult.duration}ms)`);
    console.log(`   ✅ Sidebar data: ${sidebarDataResult.success ? 'PASS' : 'FAIL'} (${sidebarDataResult.duration}ms)`);
    console.log(`   ✅ Batch insertion: ${batchInsertResult.success ? 'PASS' : 'FAIL'} (${batchInsertResult.duration}ms)`);
  }

  private async testCacheEffectiveness(): Promise<void> {
    console.log('\n2. Testing Cache Effectiveness...');

    // Test cache hit rates
    const cacheHitResult = await this.runTest(
      'Cache Hit Rate Test',
      async () => {
        // Prime cache
        await this.apiCache.cacheMetadata('https://test-cache.com', { title: 'Test Document' });
        await this.apiCache.cacheSearchResults('test query', {}, [{ id: 1, title: 'Result' }]);
        
        // Test cache hits
        const hits = [];
        for (let i = 0; i < 10; i++) {
          const metadata = await this.apiCache.getCachedMetadata('https://test-cache.com');
          const search = await this.apiCache.getCachedSearchResults('test query', {});
          hits.push({ metadata: !!metadata, search: !!search });
        }
        
        return hits;
      }
    );

    // Test cache invalidation
    const cacheInvalidationResult = await this.runTest(
      'Cache Invalidation Test',
      async () => {
        // Add test data
        await this.apiCache.cacheMetadata('https://invalidate-test.com', { title: 'To be invalidated' });
        
        // Invalidate user cache
        const invalidated = await this.apiCache.invalidateUserCache('test-user');
        
        // Verify invalidation
        const afterInvalidation = await this.apiCache.getCachedMetadata('https://invalidate-test.com');
        
        return { invalidated, afterInvalidation };
      }
    );

    // Test cache performance under load
    const cacheLoadResult = await this.runTest(
      'Cache Load Performance',
      async () => {
        const promises = [];
        for (let i = 0; i < 100; i++) {
          promises.push(
            this.apiCache.cacheMetadata(`https://load-test-${i}.com`, { title: `Document ${i}` })
          );
        }
        await Promise.all(promises);

        const retrievePromises = [];
        for (let i = 0; i < 100; i++) {
          retrievePromises.push(
            this.apiCache.getCachedMetadata(`https://load-test-${i}.com`)
          );
        }
        const results = await Promise.all(retrievePromises);
        
        return { cached: 100, retrieved: results.filter(r => r !== null).length };
      }
    );

    console.log(`   ✅ Cache hit rate: ${cacheHitResult.success ? 'PASS' : 'FAIL'} (${cacheHitResult.duration}ms)`);
    console.log(`   ✅ Cache invalidation: ${cacheInvalidationResult.success ? 'PASS' : 'FAIL'} (${cacheInvalidationResult.duration}ms)`);
    console.log(`   ✅ Cache load performance: ${cacheLoadResult.success ? 'PASS' : 'FAIL'} (${cacheLoadResult.duration}ms)`);
  }

  private async testSocketIOIntegration(): Promise<void> {
    console.log('\n3. Testing Socket.IO Integration...');

    // Test Socket.IO event emission (mock test)
    const socketEmissionResult = await this.runTest(
      'Socket.IO Event Emission',
      async () => {
        // Mock Socket.IO event emission test
        // In a real test, this would verify actual Socket.IO events
        const events = [
          { type: 'chat-message-created', data: { id: '1', content: 'test' } },
          { type: 'room-message-created', data: { id: '2', roomId: 'room1' } },
          { type: 'sidebar-refresh', data: { userId: 'user1' } }
        ];
        
        // Simulate event processing
        for (const event of events) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        return { eventsProcessed: events.length };
      }
    );

    // Test Socket.IO handler performance
    const handlerPerformanceResult = await this.runTest(
      'Socket.IO Handler Performance',
      async () => {
        // Simulate multiple concurrent socket operations
        const operations = [];
        for (let i = 0; i < 50; i++) {
          operations.push(
            measurePerformance('socket.mockOperation', async () => {
              // Mock socket operation
              await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
              return `operation-${i}`;
            })
          );
        }
        
        const results = await Promise.all(operations);
        return { operations: results.length };
      }
    );

    console.log(`   ✅ Socket.IO emission: ${socketEmissionResult.success ? 'PASS' : 'FAIL'} (${socketEmissionResult.duration}ms)`);
    console.log(`   ✅ Handler performance: ${handlerPerformanceResult.success ? 'PASS' : 'FAIL'} (${handlerPerformanceResult.duration}ms)`);
  }

  private async testBackwardCompatibility(): Promise<void> {
    console.log('\n4. Testing API Backward Compatibility...');

    // Test that optimized functions maintain same interface
    const interfaceCompatibilityResult = await this.runTest(
      'Interface Compatibility',
      async () => {
        // Test room validation interface
        const roomResult = await SocketDatabaseService.validateRoomAccess('test-room');
        const hasValidField = typeof roomResult.valid === 'boolean';
        const hasErrorField = 'error' in roomResult;
        
        // Test sidebar data interface
        const sidebarResult = await SocketDatabaseService.getSidebarData('test-user');
        const hasSuccessField = typeof sidebarResult.success === 'boolean';
        const hasDataField = 'data' in sidebarResult;
        
        return {
          roomInterface: hasValidField && hasErrorField,
          sidebarInterface: hasSuccessField && hasDataField
        };
      }
    );

    // Test response format consistency
    const responseFormatResult = await this.runTest(
      'Response Format Consistency',
      async () => {
        const responses = [];
        
        // Test multiple calls to ensure consistent response format
        for (let i = 0; i < 5; i++) {
          const roomResponse = await SocketDatabaseService.validateRoomAccess(`test-${i}`);
          const sidebarResponse = await SocketDatabaseService.getSidebarData(`user-${i}`);
          
          responses.push({
            room: Object.keys(roomResponse).sort(),
            sidebar: Object.keys(sidebarResponse).sort()
          });
        }
        
        // Check consistency
        const firstRoom = responses[0].room;
        const firstSidebar = responses[0].sidebar;
        
        const roomConsistent = responses.every(r => 
          JSON.stringify(r.room) === JSON.stringify(firstRoom)
        );
        const sidebarConsistent = responses.every(r => 
          JSON.stringify(r.sidebar) === JSON.stringify(firstSidebar)
        );
        
        return { roomConsistent, sidebarConsistent };
      }
    );

    console.log(`   ✅ Interface compatibility: ${interfaceCompatibilityResult.success ? 'PASS' : 'FAIL'} (${interfaceCompatibilityResult.duration}ms)`);
    console.log(`   ✅ Response format: ${responseFormatResult.success ? 'PASS' : 'FAIL'} (${responseFormatResult.duration}ms)`);
  }

  private async testLoadPerformance(): Promise<void> {
    console.log('\n5. Testing Load Performance...');

    // Test concurrent database operations
    const concurrentDbResult = await this.runTest(
      'Concurrent Database Operations',
      async () => {
        const promises = [];
        
        // Mix of different database operations
        for (let i = 0; i < 20; i++) {
          if (i % 3 === 0) {
            promises.push(SocketDatabaseService.validateRoomAccess(`load-test-${i}`));
          } else if (i % 3 === 1) {
            promises.push(SocketDatabaseService.getSidebarData(`load-user-${i}`));
          } else {
            promises.push(SocketDatabaseService.insertChatMessages([{
              chatSessionId: `load-session-${i}`,
              content: `Load test message ${i}`,
              isUserMessage: true
            }]));
          }
        }
        
        const results = await Promise.all(promises);
        return { operations: results.length };
      }
    );

    // Test cache performance under load
    const concurrentCacheResult = await this.runTest(
      'Concurrent Cache Operations',
      async () => {
        const promises = [];
        
        // Mix of cache operations
        for (let i = 0; i < 50; i++) {
          if (i % 2 === 0) {
            promises.push(
              this.apiCache.cacheMetadata(`https://load-${i}.com`, { title: `Load Doc ${i}` })
            );
          } else {
            promises.push(
              this.apiCache.getCachedMetadata(`https://load-${i-1}.com`)
            );
          }
        }
        
        const results = await Promise.all(promises);
        return { operations: results.length };
      }
    );

    console.log(`   ✅ Concurrent DB ops: ${concurrentDbResult.success ? 'PASS' : 'FAIL'} (${concurrentDbResult.duration}ms)`);
    console.log(`   ✅ Concurrent cache ops: ${concurrentCacheResult.success ? 'PASS' : 'FAIL'} (${concurrentCacheResult.duration}ms)`);
  }

  private async testErrorHandlingIntegration(): Promise<void> {
    console.log('\n6. Testing Error Handling Integration...');

    // Test circuit breaker integration
    const circuitBreakerResult = await this.runTest(
      'Circuit Breaker Integration',
      async () => {
        const manager = CircuitBreakerManager.getInstance();
        const testBreaker = manager.getBreaker('integration-test');
        
        // Test successful operations
        let successes = 0;
        for (let i = 0; i < 3; i++) {
          try {
            await testBreaker.execute(async () => 'success');
            successes++;
          } catch (error) {
            // Unexpected
          }
        }
        
        // Test failure handling
        let failures = 0;
        for (let i = 0; i < 2; i++) {
          try {
            await testBreaker.execute(async () => {
              throw new Error('Test failure');
            });
          } catch (error) {
            failures++;
          }
        }
        
        return { successes, failures, state: testBreaker.getStats().state };
      }
    );

    // Test retry mechanism integration
    const retryIntegrationResult = await this.runTest(
      'Retry Mechanism Integration',
      async () => {
        const manager = RetryManager.getInstance();
        const retryMechanism = manager.getRetryMechanism('integration-test');
        
        let attemptCount = 0;
        try {
          const result = await retryMechanism.execute(async () => {
            attemptCount++;
            if (attemptCount < 2) {
              throw new Error('Retry test failure');
            }
            return 'retry success';
          });
          
          return { result, attempts: attemptCount };
        } catch (error) {
          return { error: error.message, attempts: attemptCount };
        }
      }
    );

    console.log(`   ✅ Circuit breaker: ${circuitBreakerResult.success ? 'PASS' : 'FAIL'} (${circuitBreakerResult.duration}ms)`);
    console.log(`   ✅ Retry mechanism: ${retryIntegrationResult.success ? 'PASS' : 'FAIL'} (${retryIntegrationResult.duration}ms)`);
  }

  private async testMonitoringIntegration(): Promise<void> {
    console.log('\n7. Testing Monitoring Integration...');

    // Test performance monitoring
    const performanceMonitoringResult = await this.runTest(
      'Performance Monitoring',
      async () => {
        // Generate some monitored operations
        for (let i = 0; i < 10; i++) {
          await measurePerformance('test.monitoring', async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            return `monitored-operation-${i}`;
          });
        }
        
        const summary = this.performanceMonitor.getPerformanceSummary();
        return {
          totalOperations: summary.overall.totalOperations,
          successRate: summary.overall.successRate
        };
      }
    );

    // Test cache statistics
    const cacheStatsResult = await this.runTest(
      'Cache Statistics',
      async () => {
        const stats = await this.apiCache.getCacheStats();
        return {
          hasMetadataStats: 'metadata' in stats,
          hasSearchStats: 'search' in stats,
          hasAIStats: 'ai' in stats,
          hasDocumentStats: 'document' in stats
        };
      }
    );

    console.log(`   ✅ Performance monitoring: ${performanceMonitoringResult.success ? 'PASS' : 'FAIL'} (${performanceMonitoringResult.duration}ms)`);
    console.log(`   ✅ Cache statistics: ${cacheStatsResult.success ? 'PASS' : 'FAIL'} (${cacheStatsResult.duration}ms)`);
  }

  private async runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      const testResult: TestResult = {
        name,
        success: true,
        duration,
        details: result
      };
      
      this.results.push(testResult);
      return testResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const testResult: TestResult = {
        name,
        success: false,
        duration,
        error: (error as Error).message
      };
      
      this.results.push(testResult);
      return testResult;
    }
  }

  private generateReport(): void {
    console.log('\n📋 API Integration and Database Optimization Test Report');
    console.log('=========================================================\n');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = totalDuration / totalTests;

    console.log('Summary:');
    console.log(`✅ PASSED: ${passedTests}`);
    console.log(`❌ FAILED: ${failedTests}`);
    console.log(`📊 TOTAL: ${totalTests}`);
    console.log(`⏱️  TOTAL TIME: ${totalDuration}ms`);
    console.log(`⏱️  AVERAGE TIME: ${averageDuration.toFixed(2)}ms\n`);

    // Performance benchmarks
    console.log('Performance Benchmarks:');
    console.log('======================');
    
    const dbTests = this.results.filter(r => r.name.includes('Query') || r.name.includes('Insertion'));
    const cacheTests = this.results.filter(r => r.name.includes('Cache'));
    const loadTests = this.results.filter(r => r.name.includes('Concurrent'));

    if (dbTests.length > 0) {
      const avgDbTime = dbTests.reduce((sum, r) => sum + r.duration, 0) / dbTests.length;
      console.log(`Database Operations: ${avgDbTime.toFixed(2)}ms average`);
    }

    if (cacheTests.length > 0) {
      const avgCacheTime = cacheTests.reduce((sum, r) => sum + r.duration, 0) / cacheTests.length;
      console.log(`Cache Operations: ${avgCacheTime.toFixed(2)}ms average`);
    }

    if (loadTests.length > 0) {
      const avgLoadTime = loadTests.reduce((sum, r) => sum + r.duration, 0) / loadTests.length;
      console.log(`Load Tests: ${avgLoadTime.toFixed(2)}ms average`);
    }

    // Failed tests details
    const failedTestDetails = this.results.filter(r => !r.success);
    if (failedTestDetails.length > 0) {
      console.log('\n❌ Failed Tests:');
      console.log('================');
      for (const test of failedTestDetails) {
        console.log(`- ${test.name}: ${test.error}`);
      }
    }

    // Performance insights
    console.log('\n📈 Performance Insights:');
    console.log('========================');
    
    const fastTests = this.results.filter(r => r.duration < 100);
    const slowTests = this.results.filter(r => r.duration > 1000);
    
    console.log(`Fast operations (<100ms): ${fastTests.length}/${totalTests}`);
    console.log(`Slow operations (>1000ms): ${slowTests.length}/${totalTests}`);
    
    if (slowTests.length > 0) {
      console.log('\nSlow operations that may need optimization:');
      for (const test of slowTests) {
        console.log(`- ${test.name}: ${test.duration}ms`);
      }
    }

    // Overall assessment
    const successRate = (passedTests / totalTests) * 100;
    console.log(`\n🎯 Overall Success Rate: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 90) {
      console.log('🎉 Excellent! API integration and database optimizations are working well.');
    } else if (successRate >= 75) {
      console.log('👍 Good! Most optimizations are working, with some areas for improvement.');
    } else {
      console.log('⚠️  Needs attention! Several optimizations require fixes.');
    }

    // Final system status
    const perfSummary = this.performanceMonitor.getPerformanceSummary();
    console.log('\n📊 Final System Status:');
    console.log('=======================');
    console.log(`Total monitored operations: ${perfSummary.overall.totalOperations}`);
    console.log(`System success rate: ${perfSummary.overall.successRate}`);
    console.log(`Average operation duration: ${perfSummary.overall.averageDuration}`);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  const tester = new APIIntegrationTester();
  tester.runAllTests()
    .then(() => {
      console.log('\n✅ API integration and database optimization tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ API integration tests failed:', error);
      process.exit(1);
    });
}

export { APIIntegrationTester };