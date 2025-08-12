import { NextRequest, NextResponse } from 'next/server';
import { ErrorTracker } from '../monitoring/errorTracker';
import crypto from 'crypto';

// CSRF token store (in production, use Redis)
const csrfTokenStore = new Map<string, { token: string; expires: number; sessionId: string }>();

export class CSRFProtection {
  private static instance: CSRFProtection;
  private errorTracker: ErrorTracker;
  private tokenExpiry = 60 * 60 * 1000; // 1 hour

  private constructor() {
    this.errorTracker = ErrorTracker.getInstance();
    
    // Clean up expired tokens every 30 minutes
    setInterval(() => this.cleanupExpiredTokens(), 30 * 60 * 1000);
  }

  static getInstance(): CSRFProtection {
    if (!CSRFProtection.instance) {
      CSRFProtection.instance = new CSRFProtection();
    }
    return CSRFProtection.instance;
  }

  // Generate CSRF token
  generateToken(sessionId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + this.tokenExpiry;
    
    csrfTokenStore.set(token, { token, expires, sessionId });
    
    return token;
  }

  // Validate CSRF token
  validateToken(token: string, sessionId: string): boolean {
    const storedToken = csrfTokenStore.get(token);
    
    if (!storedToken) {
      this.logSecurityEvent('csrf_token_not_found', { token: token.substring(0, 8), sessionId });
      return false;
    }

    if (Date.now() > storedToken.expires) {
      csrfTokenStore.delete(token);
      this.logSecurityEvent('csrf_token_expired', { token: token.substring(0, 8), sessionId });
      return false;
    }

    if (storedToken.sessionId !== sessionId) {
      this.logSecurityEvent('csrf_token_session_mismatch', { 
        token: token.substring(0, 8), 
        expectedSession: storedToken.sessionId,
        providedSession: sessionId 
      });
      return false;
    }

    return true;
  }

  // Middleware for CSRF protection
  async protectRequest(request: NextRequest): Promise<{ valid: boolean; error?: string }> {
    const method = request.method;
    
    // Only protect state-changing methods
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return { valid: true };
    }

    // Extract session ID
    const sessionId = request.cookies.get('sessionId')?.value || 
                     request.headers.get('x-session-id');
    
    if (!sessionId) {
      this.logSecurityEvent('csrf_no_session', { method, url: request.url });
      return { valid: false, error: 'No session ID provided' };
    }

    // Extract CSRF token from header or body
    let csrfToken = request.headers.get('x-csrf-token');
    
    if (!csrfToken) {
      // Try to get from form data or JSON body
      try {
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          const body = await request.json();
          csrfToken = body._csrf;
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const formData = await request.formData();
          csrfToken = formData.get('_csrf') as string;
        }
      } catch (error) {
        // Body already consumed or invalid
      }
    }

    if (!csrfToken) {
      this.logSecurityEvent('csrf_token_missing', { method, url: request.url, sessionId });
      return { valid: false, error: 'CSRF token missing' };
    }

    const isValid = this.validateToken(csrfToken, sessionId);
    
    if (!isValid) {
      this.logSecurityEvent('csrf_validation_failed', { 
        method, 
        url: request.url, 
        sessionId,
        token: csrfToken.substring(0, 8)
      });
      return { valid: false, error: 'Invalid CSRF token' };
    }

    return { valid: true };
  }

  // Clean up expired tokens
  private cleanupExpiredTokens() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [token, data] of csrfTokenStore.entries()) {
      if (now > data.expires) {
        csrfTokenStore.delete(token);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired CSRF tokens`);
    }
  }

  // Security event logging
  private logSecurityEvent(event: string, context: any) {
    this.errorTracker.trackError('warning', 'security', `CSRF security event: ${event}`, {
      event,
      ...context,
      timestamp: new Date().toISOString()
    });

    console.log(`🛡️ CSRF Security Event [${event}]:`, context);
  }

  // Get token statistics
  getTokenStats() {
    return {
      activeTokens: csrfTokenStore.size,
      timestamp: new Date().toISOString()
    };
  }
}

// Security headers utility
export class SecurityHeaders {
  static addSecurityHeaders(response: NextResponse): NextResponse {
    // Content Security Policy
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    );

    // X-Frame-Options
    response.headers.set('X-Frame-Options', 'DENY');

    // X-Content-Type-Options
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // X-XSS-Protection
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Strict Transport Security (HTTPS only)
    if (process.env.NODE_ENV === 'production') {
      response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    // Permissions Policy
    response.headers.set(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'accelerometer=()',
        'gyroscope=()'
      ].join(', ')
    );

    // Remove server information
    response.headers.delete('Server');
    response.headers.delete('X-Powered-By');

    return response;
  }

  // Add CORS headers with security considerations
  static addCORSHeaders(response: NextResponse, origin?: string): NextResponse {
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_CLIENT_URL,
      process.env.NEXT_PUBLIC_APP_URL
    ].filter(Boolean) as string[];

    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    } else {
      response.headers.set('Access-Control-Allow-Origin', 'null');
    }

    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-CSRF-Token, X-Session-ID'
    );
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

    return response;
  }
}

// Export instances
export const csrfProtection = CSRFProtection.getInstance();
export default csrfProtection;