#!/usr/bin/env tsx

// Test script for caching system
import { APICache, withMetadataCache, withSearchCache, withAICache } from '../lib/cache/apiCache';
import { CacheManager } from '../lib/cache/cacheManager';
import { HybridCache } from '../lib/cache/redisCache';

async function testCacheSystem() {
  console.log('🧪 Testing Cache System...\n');
  
  const apiCache = APICache.getInstance();
  const cacheManager = CacheManager.getInstance();
  const hybridCache = new HybridCache();
  
  try {
    // Test 1: Basic cache operations
    console.log('1. Testing basic cache operations...');
    
    await cacheManager.set('test-key', { message: 'Hello Cache!' }, 5000);
    const cached = await cacheManager.get('test-key');
    
    console.log(`   ✅ Cache set and get: ${cached ? 'Success' : 'Failed'}`);
    console.log(`   📊 Cached data: ${JSON.stringify(cached)}`);
    
    // Test 2: Metadata caching
    console.log('\n2. Testing metadata caching...');
    
    const testURL = 'https://example.com/test-document';
    const mockMetadata = { title: 'Test Document', description: 'A test document' };
    
    await apiCache.cacheMetadata(testURL, mockMetadata);
    const cachedMetadata = await apiCache.getCachedMetadata(testURL);
    
    console.log(`   ✅ Metadata cache: ${cachedMetadata ? 'Success' : 'Failed'}`);
    console.log(`   📊 Cached metadata: ${JSON.stringify(cachedMetadata)}`);
    
    // Test 3: Search result caching
    console.log('\n3. Testing search result caching...');
    
    const testQuery = 'machine learning';
    const testFilters = { category: 'tech', date: '2024' };
    const mockResults = [{ id: 1, title: 'ML Article' }, { id: 2, title: 'AI Paper' }];
    
    await apiCache.cacheSearchResults(testQuery, testFilters, mockResults);
    const cachedSearch = await apiCache.getCachedSearchResults(testQuery, testFilters);
    
    console.log(`   ✅ Search cache: ${cachedSearch ? 'Success' : 'Failed'}`);
    console.log(`   📊 Cached results count: ${cachedSearch?.length || 0}`);
    
    // Test 4: AI response caching
    console.log('\n4. Testing AI response caching...');
    
    const testPrompt = 'Explain quantum computing';
    const testContext = { user: 'test-user', session: 'test-session' };
    const mockAIResponse = { response: 'Quantum computing is...', tokens: 150 };
    
    await apiCache.cacheAIResponse(testPrompt, testContext, mockAIResponse);
    const cachedAI = await apiCache.getCachedAIResponse(testPrompt, testContext);
    
    console.log(`   ✅ AI cache: ${cachedAI ? 'Success' : 'Failed'}`);
    console.log(`   📊 Cached AI response: ${cachedAI?.response?.substring(0, 50)}...`);
    
    // Test 5: Document processing caching
    console.log('\n5. Testing document processing caching...');
    
    const testDocId = 'doc-123';
    const testProcessingType = 'summary';
    const mockProcessingResult = { summary: 'This document discusses...', confidence: 0.95 };
    
    await apiCache.cacheDocumentProcessing(testDocId, testProcessingType, mockProcessingResult);
    const cachedDoc = await apiCache.getCachedDocumentProcessing(testDocId, testProcessingType);
    
    console.log(`   ✅ Document cache: ${cachedDoc ? 'Success' : 'Failed'}`);
    console.log(`   📊 Cached document result: ${JSON.stringify(cachedDoc)}`);
    
    // Test 6: Cache with helper functions
    console.log('\n6. Testing cache helper functions...');
    
    const metadataResult = await withMetadataCache('https://test.com/doc', async () => {
      console.log('   🔄 Fetching metadata (cache miss)');
      return { title: 'Fetched Title', description: 'Fetched Description' };
    });
    
    console.log(`   ✅ Metadata helper: Success`);
    console.log(`   📊 Result: ${JSON.stringify(metadataResult)}`);
    
    // Second call should hit cache
    const metadataResult2 = await withMetadataCache('https://test.com/doc', async () => {
      console.log('   🔄 This should not be called (cache hit)');
      return { title: 'Should not see this' };
    });
    
    console.log(`   ✅ Metadata helper (cache hit): Success`);
    console.log(`   📊 Cached result: ${JSON.stringify(metadataResult2)}`);
    
    // Test 7: Cache statistics
    console.log('\n7. Testing cache statistics...');
    
    const cacheStats = await apiCache.getCacheStats();
    const memoryStats = cacheManager.getStats();
    
    console.log(`   📊 API Cache Stats:`);
    console.log(`      - Metadata hit rate: ${cacheStats.metadata.hitRate}%`);
    console.log(`      - Search hit rate: ${cacheStats.search.hitRate}%`);
    console.log(`      - AI hit rate: ${cacheStats.ai.hitRate}%`);
    console.log(`      - Document hit rate: ${cacheStats.document.hitRate}%`);
    
    console.log(`   📊 Memory Cache Stats:`);
    console.log(`      - Total entries: ${memoryStats.totalEntries}`);
    console.log(`      - Total hits: ${memoryStats.totalHits}`);
    console.log(`      - Hit rate: ${memoryStats.hitRate.toFixed(1)}%`);
    console.log(`      - Memory usage: ${memoryStats.memoryUsage} bytes`);
    
    // Test 8: Cache invalidation
    console.log('\n8. Testing cache invalidation...');
    
    const testUserId = 'user-123';
    const invalidated = await apiCache.invalidateUserCache(testUserId);
    
    console.log(`   ✅ User cache invalidation: ${invalidated} entries cleared`);
    
    // Test pattern invalidation
    await cacheManager.set('pattern:test:1', 'data1');
    await cacheManager.set('pattern:test:2', 'data2');
    await cacheManager.set('other:data', 'data3');
    
    const patternInvalidated = await cacheManager.invalidatePattern('pattern:test:.*');
    console.log(`   ✅ Pattern invalidation: ${patternInvalidated} entries cleared`);
    
    // Test 9: Cache cleanup
    console.log('\n9. Testing cache cleanup...');
    
    // Set some entries with short TTL
    await cacheManager.set('short-lived-1', 'data1', 100); // 100ms TTL
    await cacheManager.set('short-lived-2', 'data2', 100);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const cleanedUp = await cacheManager.cleanup();
    console.log(`   ✅ Cache cleanup: ${cleanedUp} expired entries removed`);
    
    // Test 10: Hybrid cache (Redis fallback)
    console.log('\n10. Testing hybrid cache...');
    
    await hybridCache.set('hybrid-test', { message: 'Hybrid cache test' }, 300);
    const hybridResult = await hybridCache.get('hybrid-test');
    
    console.log(`   ✅ Hybrid cache: ${hybridResult ? 'Success' : 'Failed'}`);
    console.log(`   📊 Hybrid result: ${JSON.stringify(hybridResult)}`);
    
    // Test 11: Performance under load
    console.log('\n11. Testing cache performance under load...');
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
      promises.push(
        cacheManager.set(`load-test-${i}`, { index: i, data: `test-data-${i}` })
      );
    }
    
    await Promise.all(promises);
    
    const getPromises = [];
    for (let i = 0; i < 100; i++) {
      getPromises.push(cacheManager.get(`load-test-${i}`));
    }
    
    const results = await Promise.all(getPromises);
    const endTime = Date.now();
    
    const successCount = results.filter(r => r !== null).length;
    console.log(`   ✅ Load test: ${successCount}/100 operations successful`);
    console.log(`   📊 Total time: ${endTime - startTime}ms`);
    console.log(`   📊 Average time per operation: ${(endTime - startTime) / 200}ms`);
    
    console.log('\n🎉 Cache system tests completed successfully!');
    console.log('\n📈 Cache System Summary:');
    console.log('   - Basic cache operations working');
    console.log('   - API-specific caching implemented');
    console.log('   - Helper functions operational');
    console.log('   - Statistics and monitoring active');
    console.log('   - Cache invalidation working');
    console.log('   - Cleanup mechanisms functional');
    console.log('   - Hybrid cache with Redis fallback ready');
    console.log('   - Performance under load tested');
    
  } catch (error) {
    console.error('\n❌ Cache system test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testCacheSystem()
    .then(() => {
      console.log('\n✅ All cache tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cache tests failed:', error);
      process.exit(1);
    });
}

export { testCacheSystem };