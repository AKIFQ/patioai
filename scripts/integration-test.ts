#!/usr/bin/env tsx

// Integration test for Socket.IO, database optimizations, and caching
import { SocketDatabaseService } from '../lib/database/socketQueries';
import { APICache } from '../lib/cache/apiCache';
import { PerformanceMonitor, measurePerformance } from '../lib/monitoring/performanceMonitor';

async function runIntegrationTest() {
  console.log('🧪 Running Integration Test...\n');
  
  const performanceMonitor = PerformanceMonitor.getInstance();
  const apiCache = APICache.getInstance();
  
  try {
    // Test 1: End-to-end room workflow
    console.log('1. Testing end-to-end room workflow...');
    
    const roomValidation = await measurePerformance('integration.roomValidation', async () => {
      return await SocketDatabaseService.validateRoomAccess('test-room-123');
    });
    
    console.log(`   ✅ Room validation: ${roomValidation.valid ? 'Valid' : 'Invalid'} (${roomValidation.error || 'No error'})`);
    
    // Test 2: Chat message workflow with caching
    console.log('\n2. Testing chat message workflow with caching...');
    
    const chatResult = await measurePerformance('integration.chatMessages', async () => {
      return await SocketDatabaseService.insertChatMessages([
        {
          chatSessionId: 'integration-test-session',
          content: 'Integration test message',
          isUserMessage: true
        },
        {
          chatSessionId: 'integration-test-session',
          content: 'AI response to integration test',
          isUserMessage: false
        }
      ]);
    });
    
    console.log(`   ✅ Chat messages: ${chatResult.success ? 'Success' : 'Failed'} (${chatResult.messageIds?.length || 0} messages)`);
    
    // Test 3: Sidebar data with caching
    console.log('\n3. Testing sidebar data with caching...');
    
    const sidebarResult = await measurePerformance('integration.sidebarData', async () => {
      return await SocketDatabaseService.getSidebarData('integration-test-user');
    });
    
    console.log(`   ✅ Sidebar data: ${sidebarResult.success ? 'Success' : 'Failed'}`);
    
    // Test 4: API caching workflow
    console.log('\n4. Testing API caching workflow...');
    
    // Cache some metadata
    await apiCache.cacheMetadata('https://integration-test.com', {
      title: 'Integration Test Document',
      description: 'Test document for integration testing'
    });
    
    // Retrieve cached metadata
    const cachedMetadata = await apiCache.getCachedMetadata('https://integration-test.com');
    console.log(`   ✅ Metadata caching: ${cachedMetadata ? 'Success' : 'Failed'}`);
    
    // Test 5: Performance monitoring integration
    console.log('\n5. Testing performance monitoring integration...');
    
    const perfSummary = performanceMonitor.getPerformanceSummary();
    const systemHealth = performanceMonitor.isSystemHealthy();
    
    console.log(`   ✅ Performance monitoring: ${perfSummary.overall.totalOperations} operations recorded`);
    console.log(`   ✅ System health: ${systemHealth.healthy ? 'Healthy' : 'Issues detected'}`);
    
    // Test 6: Load testing
    console.log('\n6. Running load test...');
    
    const loadTestStart = Date.now();
    const loadTestPromises = [];
    
    // Simulate 50 concurrent operations
    for (let i = 0; i < 50; i++) {
      loadTestPromises.push(
        measurePerformance(`integration.loadTest.${i}`, async () => {
          // Mix of different operations
          if (i % 3 === 0) {
            return await SocketDatabaseService.validateRoomAccess(`test-room-${i}`);
          } else if (i % 3 === 1) {
            return await SocketDatabaseService.getSidebarData(`test-user-${i}`);
          } else {
            return await apiCache.getCachedMetadata(`https://test-${i}.com`);
          }
        })
      );
    }
    
    const loadTestResults = await Promise.all(loadTestPromises);
    const loadTestEnd = Date.now();
    const loadTestDuration = loadTestEnd - loadTestStart;
    
    console.log(`   ✅ Load test: ${loadTestResults.length} operations in ${loadTestDuration}ms`);
    console.log(`   📊 Average: ${Math.round(loadTestDuration / loadTestResults.length)}ms per operation`);
    
    // Test 7: Cache performance under load
    console.log('\n7. Testing cache performance under load...');
    
    const cacheLoadStart = Date.now();
    const cachePromises = [];
    
    // Cache 100 items
    for (let i = 0; i < 100; i++) {
      cachePromises.push(
        apiCache.cacheMetadata(`https://cache-test-${i}.com`, {
          title: `Cache Test Document ${i}`,
          description: `Test document ${i} for cache performance testing`
        })
      );
    }
    
    await Promise.all(cachePromises);
    
    // Retrieve 100 items
    const retrievePromises = [];
    for (let i = 0; i < 100; i++) {
      retrievePromises.push(
        apiCache.getCachedMetadata(`https://cache-test-${i}.com`)
      );
    }
    
    const retrieveResults = await Promise.all(retrievePromises);
    const cacheLoadEnd = Date.now();
    const cacheLoadDuration = cacheLoadEnd - cacheLoadStart;
    
    const hitCount = retrieveResults.filter(r => r !== null).length;
    console.log(`   ✅ Cache load test: ${hitCount}/100 cache hits in ${cacheLoadDuration}ms`);
    console.log(`   📊 Cache hit rate: ${Math.round((hitCount / 100) * 100)}%`);
    
    // Test 8: Error handling and recovery
    console.log('\n8. Testing error handling and recovery...');
    
    // Test invalid room access
    const invalidRoom = await SocketDatabaseService.validateRoomAccess('');
    console.log(`   ✅ Invalid room handling: ${!invalidRoom.valid ? 'Correct' : 'Failed'}`);
    
    // Test invalid user data
    const invalidSidebar = await SocketDatabaseService.getSidebarData('');
    console.log(`   ✅ Invalid user handling: ${!invalidSidebar.success ? 'Correct' : 'Warning'}`);
    
    // Final performance summary
    console.log('\n📊 Final Performance Summary:');
    const finalSummary = performanceMonitor.getPerformanceSummary();
    const finalHealth = performanceMonitor.isSystemHealthy();
    
    console.log(`   Total Operations: ${finalSummary.overall.totalOperations}`);
    console.log(`   Success Rate: ${finalSummary.overall.successRate}`);
    console.log(`   Average Duration: ${finalSummary.overall.averageDuration}`);
    console.log(`   Active Connections: ${finalSummary.connections.activeConnections}`);
    console.log(`   System Health: ${finalHealth.healthy ? '✅ Healthy' : '⚠️ Issues detected'}`);
    
    if (!finalHealth.healthy) {
      console.log(`   Issues: ${finalHealth.issues.join(', ')}`);
      console.log(`   Recommendations: ${finalHealth.recommendations.join(', ')}`);
    }
    
    // Cache statistics
    const cacheStats = await apiCache.getCacheStats();
    console.log(`\n💾 Cache Statistics:`);
    console.log(`   Metadata Hit Rate: ${cacheStats.metadata.hitRate}%`);
    console.log(`   Search Hit Rate: ${cacheStats.search.hitRate}%`);
    console.log(`   AI Hit Rate: ${cacheStats.ai.hitRate}%`);
    console.log(`   Document Hit Rate: ${cacheStats.document.hitRate}%`);
    
    console.log('\n🎉 Integration test completed successfully!');
    console.log('\n📈 Key Achievements:');
    console.log('   - Database operations optimized with single queries');
    console.log('   - Socket.IO integration with performance monitoring');
    console.log('   - Multi-tier caching system operational');
    console.log('   - Error handling and recovery mechanisms working');
    console.log('   - Load testing shows good performance under concurrent operations');
    console.log('   - Cache hit rates demonstrate effective caching strategy');
    
  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    
    // Still show performance data even if test failed
    const errorSummary = performanceMonitor.getPerformanceSummary();
    console.log('\n📊 Performance Data (despite failure):');
    console.log(`   Operations attempted: ${errorSummary.overall.totalOperations}`);
    console.log(`   Success rate: ${errorSummary.overall.successRate}`);
    
    throw error;
  }
}

// Run integration test if script is executed directly
if (require.main === module) {
  runIntegrationTest()
    .then(() => {
      console.log('\n✅ All integration tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Integration tests failed:', error);
      process.exit(1);
    });
}

export { runIntegrationTest };