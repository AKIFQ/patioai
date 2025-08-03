import { NextRequest, NextResponse } from 'next/server';
import { authValidator } from './authValidator';
import { inputValidator } from './inputValidator';
import { csrfProtection, SecurityHeaders } from './csrfProtection';
import { auditLogger } from './auditLogger';

// Security middleware configuration
interface SecurityConfig {
  enableAuth: boolean;
  enableCSRF: boolean;
  enableInputValidation: boolean;
  enableAuditLogging: boolean;
  enableSecurityHeaders: boolean;
  skipPaths?: string[];
}

export class SecurityMiddleware {
  private static instance: SecurityMiddleware;
  private config: SecurityConfig;

  private constructor() {
    this.config = {
      enableAuth: process.env.ENABLE_AUTH_VALIDATION !== 'false',
      enableCSRF: process.env.ENABLE_CSRF_PROTECTION !== 'false',
      enableInputValidation: process.env.ENABLE_INPUT_VALIDATION !== 'false',
      enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
      enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false',
      skipPaths: [
        '/api/health',
        '/api/monitoring',
        '/_next',
        '/favicon.ico',
        '/robots.txt'
      ]
    };
  }

  static getInstance(): SecurityMiddleware {
    if (!SecurityMiddleware.instance) {
      SecurityMiddleware.instance = new SecurityMiddleware();
    }
    return SecurityMiddleware.instance;
  }

  // Main security middleware function
  async processRequest(request: NextRequest): Promise<NextResponse | null> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const clientIP = this.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';

    // Skip security checks for certain paths
    if (this.shouldSkipPath(path)) {
      return null; // Continue to next middleware
    }

    try {
      // 1. Authentication validation
      if (this.config.enableAuth && this.requiresAuth(path, method)) {
        const authResult = await authValidator.validateSession(request);
        
        if (!authResult.valid) {
          auditLogger.logAuthentication('failure', {
            reason: authResult.error,
            path,
            method
          }, {
            clientIP,
            userAgent,
            requestId: this.generateRequestId()
          });

          return this.createErrorResponse('Unauthorized', 401);
        }

        // Log successful authentication
        if (this.config.enableAuditLogging) {
          auditLogger.logAuthentication('success', {
            path,
            method,
            securityFlags: authResult.securityFlags
          }, {
            userId: authResult.userId,
            sessionId: authResult.sessionId,
            clientIP,
            userAgent
          });
        }

        // Add user context to request headers for downstream processing
        const response = NextResponse.next();
        response.headers.set('x-user-id', authResult.userId || '');
        response.headers.set('x-session-id', authResult.sessionId || '');
      }

      // 2. CSRF protection
      if (this.config.enableCSRF && this.requiresCSRF(path, method)) {
        const csrfResult = await csrfProtection.protectRequest(request);
        
        if (!csrfResult.valid) {
          auditLogger.logSecurityViolation('csrf_violation', {
            reason: csrfResult.error,
            path,
            method
          }, {
            clientIP,
            userAgent
          });

          return this.createErrorResponse('CSRF token validation failed', 403);
        }
      }

      // 3. Input validation for POST/PUT requests
      if (this.config.enableInputValidation && ['POST', 'PUT', 'PATCH'].includes(method)) {
        const validationResult = await this.validateRequestInput(request, path);
        
        if (!validationResult.valid) {
          auditLogger.logSecurityViolation('input_validation_failed', {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            path,
            method
          }, {
            clientIP,
            userAgent
          });

          return this.createErrorResponse('Invalid input data', 400, {
            errors: validationResult.errors
          });
        }
      }

      // 4. Rate limiting check
      const rateLimitResult = this.checkRateLimit(clientIP, path);
      if (!rateLimitResult.allowed) {
        auditLogger.logSecurityViolation('rate_limit_exceeded', {
          attempts: rateLimitResult.attempts,
          limit: rateLimitResult.limit,
          path,
          method
        }, {
          clientIP,
          userAgent
        });

        return this.createErrorResponse('Rate limit exceeded', 429);
      }

      // Log successful request processing
      if (this.config.enableAuditLogging) {
        const processingTime = Date.now() - startTime;
        auditLogger.logEvent(
          'request_processed',
          'api_endpoint',
          'success',
          'low',
          {
            path,
            method,
            processingTime
          },
          {
            clientIP,
            userAgent
          }
        );
      }

      return null; // Continue to next middleware

    } catch (error: any) {
      // Log security middleware error
      auditLogger.logEvent(
        'security_middleware_error',
        'security_system',
        'failure',
        'high',
        {
          error: error.message,
          path,
          method
        },
        {
          clientIP,
          userAgent
        }
      );

      return this.createErrorResponse('Security validation error', 500);
    }
  }

  // Add security headers to response
  addSecurityHeaders(response: NextResponse): NextResponse {
    if (!this.config.enableSecurityHeaders) {
      return response;
    }

    return SecurityHeaders.addSecurityHeaders(response);
  }

  // Validate request input based on path
  private async validateRequestInput(request: NextRequest, path: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const contentType = request.headers.get('content-type') || '';
      let data: any = {};

      // Parse request body based on content type
      if (contentType.includes('application/json')) {
        data = await request.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        data = Object.fromEntries(formData.entries());
      } else {
        // Skip validation for other content types
        return { valid: true, errors: [], warnings: [] };
      }

      // Get validation schema based on path
      const schema = this.getValidationSchema(path);
      if (!schema) {
        return { valid: true, errors: [], warnings: [] };
      }

      // Validate input
      const result = inputValidator.validate(data, schema);
      return {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings
      };

    } catch (error) {
      return {
        valid: false,
        errors: ['Failed to parse request body'],
        warnings: []
      };
    }
  }

  // Get validation schema for specific paths
  private getValidationSchema(path: string): Record<string, any> | null {
    if (path.includes('/api/chat/message')) {
      return inputValidator.getMessageValidationSchema();
    }
    
    if (path.includes('/api/room')) {
      return inputValidator.getRoomValidationSchema();
    }
    
    if (path.includes('/api/user')) {
      return inputValidator.getUserValidationSchema();
    }

    return null;
  }

  // Rate limiting implementation
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  
  private checkRateLimit(identifier: string, path: string): {
    allowed: boolean;
    attempts: number;
    limit: number;
  } {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    
    // Different limits for different endpoints
    const limit = this.getRateLimitForPath(path);
    
    const key = `${identifier}_${path}`;
    const record = this.rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, attempts: 1, limit };
    }

    record.count++;
    
    return {
      allowed: record.count <= limit,
      attempts: record.count,
      limit
    };
  }

  private getRateLimitForPath(path: string): number {
    if (path.includes('/api/auth')) return 10; // Strict for auth endpoints
    if (path.includes('/api/chat')) return 100; // More lenient for chat
    if (path.includes('/api/room')) return 50; // Moderate for room operations
    return 200; // Default limit
  }

  // Helper methods
  private shouldSkipPath(path: string): boolean {
    return this.config.skipPaths?.some(skipPath => path.startsWith(skipPath)) || false;
  }

  private requiresAuth(path: string, method: string): boolean {
    // Skip auth for public endpoints
    const publicPaths = ['/api/health', '/api/public'];
    if (publicPaths.some(p => path.startsWith(p))) {
      return false;
    }

    // Require auth for all API endpoints except GET requests to certain paths
    if (path.startsWith('/api/')) {
      if (method === 'GET' && path.includes('/api/room/public')) {
        return false;
      }
      return true;
    }

    return false;
  }

  private requiresCSRF(path: string, method: string): boolean {
    // Only require CSRF for state-changing methods on API endpoints
    return path.startsWith('/api/') && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
  }

  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    return realIP || 'unknown';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private createErrorResponse(message: string, status: number, data?: any): NextResponse {
    const response = NextResponse.json({
      error: message,
      timestamp: new Date().toISOString(),
      ...data
    }, { status });

    return this.addSecurityHeaders(response);
  }

  // Configuration methods
  updateConfig(newConfig: Partial<SecurityConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  // Statistics
  getSecurityStats() {
    return {
      rateLimitEntries: this.rateLimitStore.size,
      config: this.config,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const securityMiddleware = SecurityMiddleware.getInstance();
export default securityMiddleware;