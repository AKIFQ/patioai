// Cache manager for external APIs and frequently accessed data
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

export class CacheManager {
  private static instance: CacheManager;
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };
  private maxEntries = 1000;
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private performanceMonitor = PerformanceMonitor.getInstance();

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Get cached data
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.stats.misses++;
        this.performanceMonitor.recordMetric('cache.miss', startTime, true, undefined, { key });
        return null;
      }

      // Check if entry has expired
      const now = Date.now();
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.stats.misses++;
        this.performanceMonitor.recordMetric('cache.expired', startTime, true, undefined, { key });
        return null;
      }

      // Update access statistics
      entry.hits++;
      entry.lastAccessed = now;
      this.stats.hits++;
      
      this.performanceMonitor.recordMetric('cache.hit', startTime, true, undefined, { key });
      return entry.data;
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.get', startTime, false, error.message, { key });
      throw error;
    }
  }

  // Set cached data
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      const now = Date.now();
      const entryTTL = ttl || this.defaultTTL;

      // Check if we need to evict entries
      if (this.cache.size >= this.maxEntries) {
        this.evictLeastRecentlyUsed();
      }

      const entry: CacheEntry<T> = {
        data,
        timestamp: now,
        ttl: entryTTL,
        hits: 0,
        lastAccessed: now
      };

      this.cache.set(key, entry);
      this.stats.sets++;
      
      this.performanceMonitor.recordMetric('cache.set', startTime, true, undefined, { key, ttl: entryTTL });
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.set', startTime, false, error.message, { key });
      throw error;
    }
  }

  // Delete cached data
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const deleted = this.cache.delete(key);
      if (deleted) {
        this.stats.deletes++;
      }
      
      this.performanceMonitor.recordMetric('cache.delete', startTime, true, undefined, { key, deleted });
      return deleted;
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.delete', startTime, false, error.message, { key });
      throw error;
    }
  }

  // Clear all cached data
  async clear(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const entriesCleared = this.cache.size;
      this.cache.clear();
      this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
      
      this.performanceMonitor.recordMetric('cache.clear', startTime, true, undefined, { entriesCleared });
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.clear', startTime, false, error.message);
      throw error;
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalHits = this.stats.hits;
    const totalMisses = this.stats.misses;
    const totalRequests = totalHits + totalMisses;
    
    return {
      totalEntries: this.cache.size,
      totalHits,
      totalMisses,
      hitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
      memoryUsage: this.estimateMemoryUsage(),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0
    };
  }

  // Warm cache with frequently accessed data
  async warmCache(warmingData: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const promises = warmingData.map(async ({ key, fetcher, ttl }) => {
        try {
          const data = await fetcher();
          await this.set(key, data, ttl);
          return { key, success: true };
        } catch (error) {
          console.warn(`Failed to warm cache for key ${key}:`, error);
          return { key, success: false, error: error.message };
        }
      });

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;
      
      this.performanceMonitor.recordMetric('cache.warm', startTime, true, undefined, { 
        total: warmingData.length, 
        successful 
      });
      
      console.log(`Cache warming completed: ${successful}/${warmingData.length} entries loaded`);
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.warm', startTime, false, error.message);
      throw error;
    }
  }

  // Invalidate cache entries by pattern
  async invalidatePattern(pattern: string): Promise<number> {
    const startTime = Date.now();
    
    try {
      const regex = new RegExp(pattern);
      const keysToDelete: string[] = [];
      
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.cache.delete(key);
      }

      this.performanceMonitor.recordMetric('cache.invalidatePattern', startTime, true, undefined, { 
        pattern, 
        invalidated: keysToDelete.length 
      });
      
      return keysToDelete.length;
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.invalidatePattern', startTime, false, error.message, { pattern });
      throw error;
    }
  }

  // Clean up expired entries
  async cleanup(): Promise<number> {
    const startTime = Date.now();
    
    try {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.cache.delete(key);
      }

      this.performanceMonitor.recordMetric('cache.cleanup', startTime, true, undefined, { 
        cleaned: keysToDelete.length 
      });
      
      return keysToDelete.length;
    } catch (error) {
      this.performanceMonitor.recordMetric('cache.cleanup', startTime, false, error.message);
      throw error;
    }
  }

  // Get or set pattern (cache-aside pattern)
  async getOrSet<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    await this.set(key, data, ttl);
    return data;
  }

  // Set cache configuration
  setMaxEntries(max: number): void {
    this.maxEntries = max;
  }

  setDefaultTTL(ttl: number): void {
    this.defaultTTL = ttl;
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`Evicted LRU cache entry: ${oldestKey}`);
    }
  }

  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // Rough estimation of memory usage
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(entry.data).length * 2;
      totalSize += 64; // Overhead for entry metadata
    }
    
    return totalSize;
  }
}

// Specialized cache for external API responses
export class ExternalAPICache {
  private cacheManager = CacheManager.getInstance();
  private apiTTLs = new Map<string, number>([
    ['metadata', 30 * 60 * 1000], // 30 minutes
    ['search', 10 * 60 * 1000],   // 10 minutes
    ['ai-response', 60 * 60 * 1000], // 1 hour
    ['document', 2 * 60 * 60 * 1000], // 2 hours
  ]);

  // Cache external API response
  async cacheAPIResponse<T>(
    apiType: string,
    endpoint: string,
    params: any,
    data: T
  ): Promise<void> {
    const key = this.generateAPIKey(apiType, endpoint, params);
    const ttl = this.apiTTLs.get(apiType) || 5 * 60 * 1000;
    
    await this.cacheManager.set(key, data, ttl);
  }

  // Get cached API response
  async getCachedAPIResponse<T>(
    apiType: string,
    endpoint: string,
    params: any
  ): Promise<T | null> {
    const key = this.generateAPIKey(apiType, endpoint, params);
    return await this.cacheManager.get<T>(key);
  }

  // Invalidate API cache by type
  async invalidateAPICache(apiType: string): Promise<number> {
    return await this.cacheManager.invalidatePattern(`^api:${apiType}:`);
  }

  // Warm API cache with common requests
  async warmAPICache(apiType: string, commonRequests: Array<{
    endpoint: string;
    params: any;
    fetcher: () => Promise<any>;
  }>): Promise<void> {
    const warmingData = commonRequests.map(({ endpoint, params, fetcher }) => ({
      key: this.generateAPIKey(apiType, endpoint, params),
      fetcher,
      ttl: this.apiTTLs.get(apiType)
    }));

    await this.cacheManager.warmCache(warmingData);
  }

  private generateAPIKey(apiType: string, endpoint: string, params: any): string {
    const paramsHash = JSON.stringify(params, Object.keys(params).sort());
    return `api:${apiType}:${endpoint}:${Buffer.from(paramsHash).toString('base64')}`;
  }
}

// Helper function for caching with automatic retry
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttl?: number;
    retries?: number;
    retryDelay?: number;
  } = {}
): Promise<T> {
  const cache = CacheManager.getInstance();
  const { ttl, retries = 3, retryDelay = 1000 } = options;

  // Try to get from cache first
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch with retry logic
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const data = await fetcher();
      await cache.set(key, data, ttl);
      return data;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  throw lastError || new Error('Failed to fetch data after retries');
}