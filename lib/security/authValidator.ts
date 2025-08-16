import { NextRequest } from 'next/server';
import { ErrorTracker } from '../monitoring/errorTracker';

// Session validation interface
interface SessionValidationResult {
    valid: boolean;
    userId?: string;
    sessionId?: string;
    error?: string;
    securityFlags?: {
        suspicious: boolean;

        ipChanged: boolean;
        userAgentChanged: boolean;
    };
}


const sessionStore = new Map<string, {
    userId: string;
    lastIP: string;
    lastUserAgent: string;
    createdAt: number;
    lastActivity: number;
}>();

export class AuthValidator {
    private static instance: AuthValidator;
    private errorTracker: ErrorTracker;

    private constructor() {
        this.errorTracker = ErrorTracker.getInstance();

        // Clean up expired sessions every hour
        setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
    }

    static getInstance(): AuthValidator {
        if (!AuthValidator.instance) {
            AuthValidator.instance = new AuthValidator();
        }
        return AuthValidator.instance;
    }

    // Enhanced session validation with security checks
    async validateSession(request: NextRequest): Promise<SessionValidationResult> {
        try {
            const sessionId = this.extractSessionId(request);
            const userId = this.extractUserId(request);
            const clientIP = this.getClientIP(request);
            const userAgent = request.headers.get('user-agent') || '';

            // Basic validation
            if (!sessionId || !userId) {
                this.logSecurityEvent('auth_missing_credentials', { sessionId, userId, clientIP });
                return { valid: false, error: 'Missing session credentials' };
            }



            // Session consistency checks
            const sessionData = sessionStore.get(sessionId);
            const securityFlags = {
                suspicious: false,

                ipChanged: false,
                userAgentChanged: false
            };

            if (sessionData) {
                // Check for IP changes (potential session hijacking)
                if (sessionData.lastIP !== clientIP) {
                    securityFlags.ipChanged = true;
                    securityFlags.suspicious = true;
                    this.logSecurityEvent('auth_ip_changed', {
                        sessionId, userId,
                        oldIP: sessionData.lastIP,
                        newIP: clientIP
                    });
                }

                // Check for user agent changes
                if (sessionData.lastUserAgent !== userAgent) {
                    securityFlags.userAgentChanged = true;
                    securityFlags.suspicious = true;
                    this.logSecurityEvent('auth_user_agent_changed', {
                        sessionId, userId,
                        oldUA: sessionData.lastUserAgent.substring(0, 100),
                        newUA: userAgent.substring(0, 100)
                    });
                }

                // Check session age (max 24 hours)
                const sessionAge = Date.now() - sessionData.createdAt;
                if (sessionAge > 24 * 60 * 60 * 1000) {
                    this.logSecurityEvent('auth_session_expired', { sessionId, userId, sessionAge });
                    sessionStore.delete(sessionId);
                    return { valid: false, error: 'Session expired' };
                }

                // Update session activity
                sessionData.lastActivity = Date.now();
                sessionData.lastIP = clientIP;
                sessionData.lastUserAgent = userAgent;
            } else {
                // Create new session record
                sessionStore.set(sessionId, {
                    userId,
                    lastIP: clientIP,
                    lastUserAgent: userAgent,
                    createdAt: Date.now(),
                    lastActivity: Date.now()
                });
            }

            // Additional security validations
            const additionalChecks = await this.performAdditionalSecurityChecks(request, userId, sessionId);
            if (!additionalChecks.passed) {
                return {
                    valid: false,
                    error: additionalChecks.reason,
                    securityFlags: { ...securityFlags, suspicious: true }
                };
            }

            return {
                valid: true,
                userId,
                sessionId,
                securityFlags
            };

        } catch (error: any) {
            this.errorTracker.trackError('error', 'auth', 'Session validation failed', { error: error.message });
            return { valid: false, error: 'Validation error' };
        }
    }

    // Extract session ID from various sources
    private extractSessionId(request: NextRequest): string | null {
        // Try cookie first
        const cookieSessionId = request.cookies.get('sessionId')?.value;
        if (cookieSessionId) return cookieSessionId;

        // Try Authorization header
        const authHeader = request.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Try query parameter (less secure, log as suspicious)
        const urlSessionId = new URL(request.url).searchParams.get('sessionId');
        if (urlSessionId) {
            this.logSecurityEvent('auth_session_in_url', { sessionId: urlSessionId });
            return urlSessionId;
        }

        return null;
    }

    // Extract user ID from request
    private extractUserId(request: NextRequest): string | null {
        // Try to extract from JWT token, cookie, or header
        const userIdCookie = request.cookies.get('userId')?.value;
        if (userIdCookie) return userIdCookie;

        const userIdHeader = request.headers.get('x-user-id');
        if (userIdHeader) return userIdHeader;

        return null;
    }

    // Get client IP address
    private getClientIP(request: NextRequest): string {
        const forwarded = request.headers.get('x-forwarded-for');
        const realIP = request.headers.get('x-real-ip');
        const remoteAddr = request.headers.get('x-remote-addr');

        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }

        return realIP || remoteAddr || 'unknown';
    }

    // Additional security checks
    private async performAdditionalSecurityChecks(
        request: NextRequest,
        userId: string,
        sessionId: string
    ): Promise<{ passed: boolean; reason?: string }> {

        // Check for suspicious patterns in request
        const userAgent = request.headers.get('user-agent') || '';

        // Block known bot patterns
        const suspiciousBots = [
            'curl', 'wget', 'python-requests', 'postman', 'insomnia',
            'bot', 'crawler', 'spider', 'scraper'
        ];

        const isSuspiciousBot = suspiciousBots.some(pattern =>
            userAgent.toLowerCase().includes(pattern)
        );

        if (isSuspiciousBot) {
            this.logSecurityEvent('auth_suspicious_user_agent', {
                userId, sessionId, userAgent: userAgent.substring(0, 200)
            });
            return { passed: false, reason: 'Suspicious user agent' };
        }

        // Check for missing required headers
        const requiredHeaders = ['accept', 'accept-language'];
        for (const header of requiredHeaders) {
            if (!request.headers.get(header)) {
                this.logSecurityEvent('auth_missing_headers', {
                    userId, sessionId, missingHeader: header
                });
                // Don't block, but log as suspicious
            }
        }

        return { passed: true };
    }

    // Security event logging
    private logSecurityEvent(event: string, context: any) {
        this.errorTracker.trackError('warning', 'auth', `Security event: ${event}`, {
            event,
            ...context,
            timestamp: new Date().toISOString()
        });

        console.log(`🔒 Security Event [${event}]:`, context);
    }

    // Cleanup expired sessions
    private cleanupExpiredSessions() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [sessionId, session] of sessionStore.entries()) {
            if (now - session.lastActivity > maxAge) {
                sessionStore.delete(sessionId);
                this.logSecurityEvent('session_cleanup', { sessionId, lastActivity: session.lastActivity });
            }
        }
    }

    // Get session statistics
    getSessionStats() {
        return {
            activeSessions: sessionStore.size,
            timestamp: new Date().toISOString()
        };
    }

    // Force session invalidation
    invalidateSession(sessionId: string) {
        const deleted = sessionStore.delete(sessionId);
        if (deleted) {
            this.logSecurityEvent('session_invalidated', { sessionId });
        }
        return deleted;
    }

    // Get suspicious sessions
    getSuspiciousSessions() {
        const suspicious = [];
        const now = Date.now();

        for (const [sessionId, session] of sessionStore.entries()) {
            const sessionAge = now - session.createdAt;
            const inactiveTime = now - session.lastActivity;

            if (sessionAge > 12 * 60 * 60 * 1000 || inactiveTime > 2 * 60 * 60 * 1000) {
                suspicious.push({
                    sessionId,
                    userId: session.userId,
                    sessionAge: Math.round(sessionAge / 1000 / 60), // minutes
                    inactiveTime: Math.round(inactiveTime / 1000 / 60), // minutes
                    lastIP: session.lastIP
                });
            }
        }

        return suspicious;
    }
}

// Export singleton instance
export const authValidator = AuthValidator.getInstance();
export default authValidator;