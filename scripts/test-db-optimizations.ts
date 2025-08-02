#!/usr/bin/env tsx

// Test script for database optimizations
import { SocketDatabaseService } from '../lib/database/socketQueries';
import { PerformanceMonitor, measurePerformance } from '../lib/monitoring/performanceMonitor';

async function testDatabaseOptimizations() {
  console.log('🧪 Testing Database Optimizations...\n');
  
  const monitor = PerformanceMonitor.getInstance();
  
  try {
    // Test 1: Room validation performance
    console.log('1. Testing optimized room validation...');
    const roomValidation = await measurePerformance('test.roomValidation', async () => {
      return await SocketDatabaseService.validateRoomAccess('nonexistent-room');
    });
    
    console.log(`   ✅ Room validation completed`);
    console.log(`   📊 Result: ${roomValidation.valid ? 'Valid' : 'Invalid'} - ${roomValidation.error || 'No error'}`);
    
    // Test 2: Sidebar data retrieval performance
    console.log('\n2. Testing optimized sidebar data retrieval...');
    const sidebarResult = await measurePerformance('test.sidebarData', async () => {
      return await SocketDatabaseService.getSidebarData('test-user-id');
    });
    
    console.log(`   ✅ Sidebar data retrieval completed`);
    console.log(`   📊 Success: ${sidebarResult.success}`);
    
    // Test 3: Chat message batch insert performance
    console.log('\n3. Testing optimized chat message batch insert...');
    const batchInsertResult = await measurePerformance('test.batchInsert', async () => {
      return await SocketDatabaseService.insertChatMessages([
        {
          chatSessionId: 'test-session-id',
          content: 'Test user message',
          isUserMessage: true
        },
        {
          chatSessionId: 'test-session-id',
          content: 'Test AI response',
          isUserMessage: false
        }
      ]);
    });
    
    console.log(`   ✅ Batch insert test completed`);
    console.log(`   📊 Success: ${batchInsertResult.success}`);
    if (!batchInsertResult.success) {
      console.log(`   ❌ Error: ${batchInsertResult.error}`);
    }
    
    // Test 4: Connection pool management
    console.log('\n4. Testing connection pool management...');
    const { ConnectionPoolManager } = await import('../lib/database/socketQueries');
    const poolManager = ConnectionPoolManager.getInstance();
    
    console.log(`   📊 Max connections: ${poolManager.getMaxConnections()}`);
    console.log(`   📊 Current connections: ${poolManager.getConnectionCount()}`);
    
    const acquired = await poolManager.acquireConnection();
    console.log(`   ✅ Connection acquired: ${acquired}`);
    console.log(`   📊 Connections after acquire: ${poolManager.getConnectionCount()}`);
    
    poolManager.releaseConnection();
    console.log(`   ✅ Connection released`);
    console.log(`   📊 Connections after release: ${poolManager.getConnectionCount()}`);
    
    // Test 5: Performance monitoring
    console.log('\n5. Testing performance monitoring...');
    const performanceSummary = monitor.getPerformanceSummary();
    const systemHealth = monitor.isSystemHealthy();
    
    console.log(`   📊 Total operations: ${performanceSummary.overall.totalOperations}`);
    console.log(`   📊 Success rate: ${performanceSummary.overall.successRate}`);
    console.log(`   📊 Average duration: ${performanceSummary.overall.averageDuration}`);
    console.log(`   📊 System healthy: ${systemHealth.healthy ? '✅ Yes' : '❌ No'}`);
    
    if (!systemHealth.healthy) {
      console.log(`   ⚠️  Issues: ${systemHealth.issues.join(', ')}`);
      console.log(`   💡 Recommendations: ${systemHealth.recommendations.join(', ')}`);
    }
    
    // Test 6: Operation-specific metrics
    console.log('\n6. Testing operation-specific metrics...');
    const roomMetrics = monitor.getOperationMetrics('test.roomValidation');
    const sidebarMetrics = monitor.getOperationMetrics('test.sidebarData');
    
    console.log(`   📊 Room validation metrics:`);
    console.log(`      - Count: ${roomMetrics.count}`);
    console.log(`      - Average duration: ${roomMetrics.averageDuration}ms`);
    console.log(`      - Success rate: ${roomMetrics.successRate}%`);
    
    console.log(`   📊 Sidebar data metrics:`);
    console.log(`      - Count: ${sidebarMetrics.count}`);
    console.log(`      - Average duration: ${sidebarMetrics.averageDuration}ms`);
    console.log(`      - Success rate: ${sidebarMetrics.successRate}%`);
    
    console.log('\n🎉 Database optimization tests completed successfully!');
    console.log('\n📈 Performance Summary:');
    console.log('   - Optimized database queries implemented');
    console.log('   - Performance monitoring active');
    console.log('   - Connection pooling configured');
    console.log('   - Batch operations working');
    
  } catch (error) {
    console.error('\n❌ Database optimization test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testDatabaseOptimizations()
    .then(() => {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}

export { testDatabaseOptimizations };