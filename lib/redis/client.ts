// Shared Redis client to prevent connection leaks
import { Redis } from '@upstash/redis';

// Singleton Redis client
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis credentials not configured');
    }
    
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    
    console.log('✅ Shared Redis client created');
  }
  
  return redisClient;
}

// Cleanup function for graceful shutdown
export function closeRedisClient(): void {
  if (redisClient) {
    // Upstash Redis doesn't need explicit closing, but we can null the reference
    redisClient = null;
    console.log('✅ Redis client reference cleared');
  }
}