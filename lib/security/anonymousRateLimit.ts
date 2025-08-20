// Anonymous user rate limiting using the existing tier system
import { tierRateLimiter } from '@/lib/limits/rateLimiter';
import { createHash } from 'crypto';

// Helper to get client IP from request
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return '127.0.0.1'; // fallback
}

// Create a consistent user ID for anonymous users based on IP
export function getAnonymousUserId(ip: string): string {
  // Hash the IP to create a consistent but anonymized identifier
  return `anon_${createHash('sha256').update(ip).digest('hex').substring(0, 16)}`;
}

// Rate limiting functions for anonymous users
export async function checkAnonymousRoomJoin(req: Request) {
  const ip = getClientIP(req);
  const userId = getAnonymousUserId(ip);
  
  return await tierRateLimiter.check(userId, 'anonymous', 'room_switch_attempts');
}

export async function checkAnonymousAIRequest(req: Request) {
  const ip = getClientIP(req);
  const userId = getAnonymousUserId(ip);
  
  return await tierRateLimiter.check(userId, 'anonymous', 'ai_requests');
}

export async function incrementAnonymousRoomJoin(req: Request) {
  const ip = getClientIP(req);
  const userId = getAnonymousUserId(ip);
  
  await tierRateLimiter.increment(userId, 'anonymous', 'room_switch_attempts');
}

export async function incrementAnonymousAIRequest(req: Request) {
  const ip = getClientIP(req);
  const userId = getAnonymousUserId(ip);
  
  await tierRateLimiter.increment(userId, 'anonymous', 'ai_requests');
}