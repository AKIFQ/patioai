// Redis cache adapter for production environments
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetries?: number;
  retryDelayOnFailover?: number;
}

interface RedisEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

export class RedisCache {
  private static instance: RedisCache;
  private client: any = null;
  private connected = false;
  private config: RedisConfig;
  private performanceMonitor = PerformanceMonitor.getInstance();
  private fallbackCache = new Map<string, any>();

  constructor(config: RedisConfig) {
    this.config = {
      keyPrefix: 'patio:',
      maxRetries: 3,
      retryDelayOnFailover: 100,
      ...config
    };
  }

  static getInstance(config?: RedisConfig): RedisCache {
    if (!RedisCache.instance) {
      if (!config) {
        throw new Error('Redis configuration required for first initialization');
      }
      RedisCache.instance = new RedisCache(config);
    }
    return RedisCache.instance;
  }

  // Initialize Redis connection
  async connect(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Only import Redis in production or when explicitly needed
      if (process.env.NODE_ENV === 'production' || process.env.REDIS_URL) {
        const Redis = await import('ioredis');
        
        this.client = new Redis.default({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db || 0,
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetries,
          retryDelayOnFailover: this.config.retryDelayOnFailover,
          lazyConnect: true,
          enableOfflineQueue: false
        });

        this.client.on('connect', () => {
          console.log('Redis connected successfully');
          this.connected = true;
        });

        this.client.on('error', (error: Error) => {
          console.error('Redis connection error:', error);
          this.connected = false;
        });

        this.client.on('close', () => {
          console.log('Redis connection closed');
          this.connected = false;
        });

        await this.client.connect();
      } else {
        console.log('Redis not available, using in-memory fallback cache');
        this.connected = false;
      }

      this.performanceMonitor.recordMetric('redis.connect', startTime, true);
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.connected = false;
      this.performanceMonitor.recordMetric('redis.connect', startTime, false, error.message);
    }
  }

  // Get cached data
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    const fullKey = this.config.keyPrefix + key;
    
    try {
      if (this.connected && this.client) {
        const data = await this.client.get(fullKey);
        
        if (data) {
          const parsed = JSON.parse(data) as RedisEntry<T>;
          
          // Update hit count
          parsed.hits++;
          await this.client.set(fullKey, JSON.stringify(parsed), 'KEEPTTL');
          
          this.performanceMonitor.recordMetric('redis.hit', startTime, true, undefined, { key });
          return parsed.data;
        }
        
        this.performanceMonitor.recordMetric('redis.miss', startTime, true, undefined, { key });
        return null;
      } else {
        // Fallback to in-memory cache
        const entry = this.fallbackCache.get(fullKey);
        if (entry) {
          this.performanceMonitor.recordMetric('fallback.hit', startTime, true, undefined, { key });
          return entry.data;
        }
        
        this.performanceMonitor.recordMetric('fallback.miss', startTime, true, undefined, { key });
        return null;
      }
    } catch (error) {
      console.error('Redis get error:', error);
      this.performanceMonitor.recordMetric('redis.get', startTime, false, error.message, { key });
      
      // Try fallback cache
      const entry = this.fallbackCache.get(fullKey);
      return entry ? entry.data : null;
    }
  }

  // Set cached data
  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    const startTime = Date.now();
    const fullKey = this.config.keyPrefix + key;
    
    try {
      const entry: RedisEntry<T> = {
        data,
        timestamp: Date.now(),
        hits: 0
      };

      const serialized = JSON.stringify(entry);

      if (this.connected && this.client) {
        if (ttlSeconds) {
          await this.client.setex(fullKey, ttlSeconds, serialized);
        } else {
          await this.client.set(fullKey, serialized);
        }
        
        this.performanceMonitor.recordMetric('redis.set', startTime, true, undefined, { key, ttl: ttlSeconds });
      } else {
        // Fallback to in-memory cache
        this.fallbackCache.set(fullKey, entry);
        
        // Set expiration for fallback cache
        if (ttlSeconds) {
          setTimeout(() => {
            this.fallbackCache.delete(fullKey);
          }, ttlSeconds * 1000);
        }
        
        this.performanceMonitor.recordMetric('fallback.set', startTime, true, undefined, { key, ttl: ttlSeconds });
      }
    } catch (error) {
      console.error('Redis set error:', error);
      this.performanceMonitor.recordMetric('redis.set', startTime, false, error.message, { key });
      
      // Try fallback cache
      this.fallbackCache.set(fullKey, { data, timestamp: Date.now(), hits: 0 });
    }
  }

  // Delete cached data
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    const fullKey = this.config.keyPrefix + key;
    
    try {
      let deleted = false;
      
      if (this.connected && this.client) {
        const result = await this.client.del(fullKey);
        deleted = result > 0;
        this.performanceMonitor.recordMetric('redis.delete', startTime, true, undefined, { key, deleted });
      } else {
        deleted = this.fallbackCache.delete(fullKey);
        this.performanceMonitor.recordMetric('fallback.delete', startTime, true, undefined, { key, deleted });
      }
      
      return deleted;
    } catch (error) {
      console.error('Redis delete error:', error);
      this.performanceMonitor.recordMetric('redis.delete', startTime, false, error.message, { key });
      return this.fallbackCache.delete(fullKey);
    }
  }

  // Clear all cached data
  async clear(pattern?: string): Promise<number> {
    const startTime = Date.now();
    
    try {
      let cleared = 0;
      
      if (this.connected && this.client) {
        const searchPattern = pattern ? `${this.config.keyPrefix}${pattern}` : `${this.config.keyPrefix}*`;
        const keys = await this.client.keys(searchPattern);
        
        if (keys.length > 0) {
          cleared = await this.client.del(...keys);
        }
        
        this.performanceMonitor.recordMetric('redis.clear', startTime, true, undefined, { pattern, cleared });
      } else {
        const keysToDelete: string[] = [];
        const searchPattern = pattern ? new RegExp(pattern) : null;
        
        for (const key of this.fallbackCache.keys()) {
          if (!searchPattern || searchPattern.test(key)) {
            keysToDelete.push(key);
          }
        }
        
        for (const key of keysToDelete) {
          this.fallbackCache.delete(key);
        }
        
        cleared = keysToDelete.length;
        this.performanceMonitor.recordMetric('fallback.clear', startTime, true, undefined, { pattern, cleared });
      }
      
      return cleared;
    } catch (error) {
      console.error('Redis clear error:', error);
      this.performanceMonitor.recordMetric('redis.clear', startTime, false, error.message, { pattern });
      return 0;
    }
  }

  // Get cache statistics
  async getStats(): Promise<{
    connected: boolean;
    memoryUsage?: string;
    keyCount?: number;
    hitRate?: number;
    fallbackEntries: number;
  }> {
    try {
      const stats: any = {
        connected: this.connected,
        fallbackEntries: this.fallbackCache.size
      };

      if (this.connected && this.client) {
        const info = await this.client.info('memory');
        const keyCount = await this.client.dbsize();
        
        stats.memoryUsage = this.parseMemoryInfo(info);
        stats.keyCount = keyCount;
      }

      return stats;
    } catch (error) {
      console.error('Redis stats error:', error);
      return {
        connected: false,
        fallbackEntries: this.fallbackCache.size
      };
    }
  }

  // Disconnect from Redis
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }

  // Check if Redis is available
  isConnected(): boolean {
    return this.connected;
  }

  // Get or set with Redis
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    await this.set(key, data, ttlSeconds);
    return data;
  }

  private parseMemoryInfo(info: string): string {
    const lines = info.split('\r\n');
    const memoryLine = lines.find(line => line.startsWith('used_memory_human:'));
    return memoryLine ? memoryLine.split(':')[1] : 'Unknown';
  }
}

// Factory function to create Redis cache instance
export function createRedisCache(): RedisCache {
  const config: RedisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'patio:',
  };

  return RedisCache.getInstance(config);
}

// Hybrid cache that uses Redis when available, falls back to in-memory
export class HybridCache {
  private redisCache: RedisCache;
  private memoryCache = new Map<string, any>();

  constructor() {
    this.redisCache = createRedisCache();
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      await this.redisCache.connect();
    } catch (error) {
      console.warn('Redis not available, using memory cache only:', error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (this.redisCache.isConnected()) {
      return await this.redisCache.get<T>(key);
    }
    
    // Fallback to memory cache
    const entry = this.memoryCache.get(key);
    return entry ? entry.data : null;
  }

  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    // Set in Redis if available
    if (this.redisCache.isConnected()) {
      await this.redisCache.set(key, data, ttlSeconds);
    } else {
      // Set in memory cache
      this.memoryCache.set(key, { data, timestamp: Date.now() });
      
      // Set expiration for memory cache
      if (ttlSeconds) {
        setTimeout(() => {
          this.memoryCache.delete(key);
        }, ttlSeconds * 1000);
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    let deleted = false;
    
    if (this.redisCache.isConnected()) {
      deleted = await this.redisCache.delete(key);
    }
    
    // Also delete from memory cache
    const memoryDeleted = this.memoryCache.delete(key);
    
    return deleted || memoryDeleted;
  }

  async clear(pattern?: string): Promise<number> {
    let cleared = 0;
    
    if (this.redisCache.isConnected()) {
      cleared = await this.redisCache.clear(pattern);
    }
    
    // Also clear memory cache
    if (pattern) {
      const regex = new RegExp(pattern);
      const keysToDelete: string[] = [];
      
      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        this.memoryCache.delete(key);
      }
      
      cleared += keysToDelete.length;
    } else {
      cleared += this.memoryCache.size;
      this.memoryCache.clear();
    }
    
    return cleared;
  }
}