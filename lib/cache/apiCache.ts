// API-specific caching implementations
import { CacheManager, ExternalAPICache, withCache } from './cacheManager';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

// Cache configuration for different API types
const API_CACHE_CONFIG = {
  metadata: {
    ttl: 30 * 60 * 1000, // 30 minutes
    maxEntries: 500,
    warmOnStart: true
  },
  search: {
    ttl: 10 * 60 * 1000, // 10 minutes
    maxEntries: 200,
    warmOnStart: false
  },
  ai: {
    ttl: 60 * 60 * 1000, // 1 hour
    maxEntries: 100,
    warmOnStart: false
  },
  document: {
    ttl: 2 * 60 * 60 * 1000, // 2 hours
    maxEntries: 1000,
    warmOnStart: true
  }
};

export class APICache {
  private static instance: APICache;
  private cacheManager: CacheManager;
  private externalAPICache: ExternalAPICache;
  private performanceMonitor = PerformanceMonitor.getInstance();

  constructor() {
    this.cacheManager = CacheManager.getInstance();
    this.externalAPICache = new ExternalAPICache();
  }

  static getInstance(): APICache {
    if (!APICache.instance) {
      APICache.instance = new APICache();
    }
    return APICache.instance;
  }

  // Cache metadata extraction results
  async cacheMetadata(url: string, metadata: any): Promise<void> {
    const key = `metadata:${this.hashURL(url)}`;
    const ttlSeconds = Math.floor(API_CACHE_CONFIG.metadata.ttl / 1000);
    
    await this.cacheManager.set(key, {
      url,
      metadata,
      extractedAt: new Date().toISOString()
    }, API_CACHE_CONFIG.metadata.ttl);
  }

  // Get cached metadata
  async getCachedMetadata(url: string): Promise<any | null> {
    const key = `metadata:${this.hashURL(url)}`;
    const cached = await this.cacheManager.get(key);
    
    if (cached) {
      this.performanceMonitor.recordMetric('cache.metadata.hit', Date.now(), true, undefined, { url });
      return cached.metadata;
    }
    
    this.performanceMonitor.recordMetric('cache.metadata.miss', Date.now(), true, undefined, { url });
    return null;
  }

  // Cache search results
  async cacheSearchResults(query: string, filters: any, results: any): Promise<void> {
    const key = `search:${this.hashQuery(query, filters)}`;
    
    await this.cacheManager.set(key, {
      query,
      filters,
      results,
      searchedAt: new Date().toISOString()
    }, API_CACHE_CONFIG.search.ttl);
  }

  // Get cached search results
  async getCachedSearchResults(query: string, filters: any): Promise<any | null> {
    const key = `search:${this.hashQuery(query, filters)}`;
    const cached = await this.cacheManager.get(key);
    
    if (cached) {
      this.performanceMonitor.recordMetric('cache.search.hit', Date.now(), true, undefined, { query });
      return cached.results;
    }
    
    this.performanceMonitor.recordMetric('cache.search.miss', Date.now(), true, undefined, { query });
    return null;
  }

  // Cache AI responses
  async cacheAIResponse(prompt: string, context: any, response: any): Promise<void> {
    const key = `ai:${this.hashPrompt(prompt, context)}`;
    
    await this.cacheManager.set(key, {
      prompt,
      context,
      response,
      generatedAt: new Date().toISOString()
    }, API_CACHE_CONFIG.ai.ttl);
  }

  // Get cached AI response
  async getCachedAIResponse(prompt: string, context: any): Promise<any | null> {
    const key = `ai:${this.hashPrompt(prompt, context)}`;
    const cached = await this.cacheManager.get(key);
    
    if (cached) {
      this.performanceMonitor.recordMetric('cache.ai.hit', Date.now(), true, undefined, { prompt: prompt.substring(0, 50) });
      return cached.response;
    }
    
    this.performanceMonitor.recordMetric('cache.ai.miss', Date.now(), true, undefined, { prompt: prompt.substring(0, 50) });
    return null;
  }

  // Cache document processing results
  async cacheDocumentProcessing(documentId: string, processingType: string, result: any): Promise<void> {
    const key = `document:${documentId}:${processingType}`;
    
    await this.cacheManager.set(key, {
      documentId,
      processingType,
      result,
      processedAt: new Date().toISOString()
    }, API_CACHE_CONFIG.document.ttl);
  }

  // Get cached document processing results
  async getCachedDocumentProcessing(documentId: string, processingType: string): Promise<any | null> {
    const key = `document:${documentId}:${processingType}`;
    const cached = await this.cacheManager.get(key);
    
    if (cached) {
      this.performanceMonitor.recordMetric('cache.document.hit', Date.now(), true, undefined, { documentId, processingType });
      return cached.result;
    }
    
    this.performanceMonitor.recordMetric('cache.document.miss', Date.now(), true, undefined, { documentId, processingType });
    return null;
  }

  // Invalidate user-specific cache
  async invalidateUserCache(userId: string): Promise<number> {
    const patterns = [
      `search:.*:user:${userId}`,
      `ai:.*:user:${userId}`,
      `document:.*:user:${userId}`
    ];

    let totalInvalidated = 0;
    for (const pattern of patterns) {
      const invalidated = await this.cacheManager.invalidatePattern(pattern);
      totalInvalidated += invalidated;
    }

    this.performanceMonitor.recordMetric('cache.invalidate.user', Date.now(), true, undefined, { 
      userId, 
      invalidated: totalInvalidated 
    });

    return totalInvalidated;
  }

  // Warm cache with frequently accessed data
  async warmCache(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Warm metadata cache with popular URLs
      const popularURLs = await this.getPopularURLs();
      const metadataPromises = popularURLs.map(async (url) => {
        try {
          const metadata = await this.fetchMetadata(url);
          await this.cacheMetadata(url, metadata);
          return { url, success: true };
        } catch (error) {
          return { url, success: false, error: error.message };
        }
      });

      // Warm document cache with recent documents
      const recentDocuments = await this.getRecentDocuments();
      const documentPromises = recentDocuments.map(async (doc) => {
        try {
          const result = await this.processDocument(doc.id, 'summary');
          await this.cacheDocumentProcessing(doc.id, 'summary', result);
          return { documentId: doc.id, success: true };
        } catch (error) {
          return { documentId: doc.id, success: false, error: error.message };
        }
      });

      const [metadataResults, documentResults] = await Promise.all([
        Promise.all(metadataPromises),
        Promise.all(documentPromises)
      ]);

      const metadataSuccess = metadataResults.filter(r => r.success).length;
      const documentSuccess = documentResults.filter(r => r.success).length;

      this.performanceMonitor.recordMetric('cache.warm', startTime, true, undefined, {
        metadata: { total: popularURLs.length, success: metadataSuccess },
        documents: { total: recentDocuments.length, success: documentSuccess }
      });

      console.log(`Cache warming completed: ${metadataSuccess}/${popularURLs.length} metadata, ${documentSuccess}/${recentDocuments.length} documents`);
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.warm', startTime, false, error.message);
      console.error('Cache warming failed:', error);
    }
  }

  // Get cache statistics
  async getCacheStats(): Promise<{
    metadata: { hits: number; misses: number; hitRate: number };
    search: { hits: number; misses: number; hitRate: number };
    ai: { hits: number; misses: number; hitRate: number };
    document: { hits: number; misses: number; hitRate: number };
    overall: any;
  }> {
    const monitor = this.performanceMonitor;
    
    const metadataHits = monitor.getOperationMetrics('cache.metadata.hit');
    const metadataMisses = monitor.getOperationMetrics('cache.metadata.miss');
    const searchHits = monitor.getOperationMetrics('cache.search.hit');
    const searchMisses = monitor.getOperationMetrics('cache.search.miss');
    const aiHits = monitor.getOperationMetrics('cache.ai.hit');
    const aiMisses = monitor.getOperationMetrics('cache.ai.miss');
    const documentHits = monitor.getOperationMetrics('cache.document.hit');
    const documentMisses = monitor.getOperationMetrics('cache.document.miss');

    return {
      metadata: {
        hits: metadataHits.count,
        misses: metadataMisses.count,
        hitRate: this.calculateHitRate(metadataHits.count, metadataMisses.count)
      },
      search: {
        hits: searchHits.count,
        misses: searchMisses.count,
        hitRate: this.calculateHitRate(searchHits.count, searchMisses.count)
      },
      ai: {
        hits: aiHits.count,
        misses: aiMisses.count,
        hitRate: this.calculateHitRate(aiHits.count, aiMisses.count)
      },
      document: {
        hits: documentHits.count,
        misses: documentMisses.count,
        hitRate: this.calculateHitRate(documentHits.count, documentMisses.count)
      },
      overall: monitor.getPerformanceSummary()
    };
  }

  // Helper methods
  private hashURL(url: string): string {
    return Buffer.from(url).toString('base64').substring(0, 32);
  }

  private hashQuery(query: string, filters: any): string {
    const combined = JSON.stringify({ query, filters });
    return Buffer.from(combined).toString('base64').substring(0, 32);
  }

  private hashPrompt(prompt: string, context: any): string {
    const combined = JSON.stringify({ prompt: prompt.substring(0, 200), context });
    return Buffer.from(combined).toString('base64').substring(0, 32);
  }

  private calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? Math.round((hits / total) * 100) : 0;
  }

  // Mock methods for warming cache (replace with actual implementations)
  private async getPopularURLs(): Promise<string[]> {
    // This would typically query your database for frequently accessed URLs
    return [
      'https://example.com/popular-doc-1',
      'https://example.com/popular-doc-2'
    ];
  }

  private async getRecentDocuments(): Promise<{ id: string }[]> {
    // This would typically query your database for recent documents
    return [
      { id: 'doc-1' },
      { id: 'doc-2' }
    ];
  }

  private async fetchMetadata(url: string): Promise<any> {
    // Mock metadata fetching - replace with actual implementation
    return {
      title: `Title for ${url}`,
      description: `Description for ${url}`,
      fetchedAt: new Date().toISOString()
    };
  }

  private async processDocument(documentId: string, processingType: string): Promise<any> {
    // Mock document processing - replace with actual implementation
    return {
      documentId,
      processingType,
      result: `Processed result for ${documentId}`,
      processedAt: new Date().toISOString()
    };
  }
}

// Convenience functions for common caching patterns
export const apiCache = APICache.getInstance();

export async function withMetadataCache<T>(
  url: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await apiCache.getCachedMetadata(url);
  if (cached) return cached;

  const result = await fetcher();
  await apiCache.cacheMetadata(url, result);
  return result;
}

export async function withSearchCache<T>(
  query: string,
  filters: any,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await apiCache.getCachedSearchResults(query, filters);
  if (cached) return cached;

  const result = await fetcher();
  await apiCache.cacheSearchResults(query, filters, result);
  return result;
}

export async function withAICache<T>(
  prompt: string,
  context: any,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await apiCache.getCachedAIResponse(prompt, context);
  if (cached) return cached;

  const result = await fetcher();
  await apiCache.cacheAIResponse(prompt, context, result);
  return result;
}

export async function withDocumentCache<T>(
  documentId: string,
  processingType: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await apiCache.getCachedDocumentProcessing(documentId, processingType);
  if (cached) return cached;

  const result = await fetcher();
  await apiCache.cacheDocumentProcessing(documentId, processingType, result);
  return result;
}