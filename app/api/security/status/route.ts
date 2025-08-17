import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { authValidator } from '@/lib/security/authValidator';
import { csrfProtection } from '@/lib/security/csrfProtection';
import { auditLogger } from '@/lib/security/auditLogger';
import { securityMiddleware } from '@/lib/security/middleware';

export async function GET(request: NextRequest) {
  try {
    // Validate admin access
    const authResult = await authValidator.validateSession(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Gather security system status
    const securityStatus = {
      timestamp: new Date().toISOString(),
      authentication: {
        sessionStats: authValidator.getSessionStats(),
        suspiciousSessions: authValidator.getSuspiciousSessions()
      },
      csrf: {
        tokenStats: csrfProtection.getTokenStats()
      },
      audit: {
        stats: auditLogger.getStats(),
        recentAlerts: auditLogger.getSecurityAlerts().slice(0, 5)
      },
      middleware: {
        stats: securityMiddleware.getSecurityStats(),
        config: securityMiddleware.getConfig()
      },
      systemHealth: {
        uptime: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      }
    };

    // Calculate overall security score
    const securityScore = calculateSecurityScore(securityStatus);

    // Log security status access
    auditLogger.logDataAccess(
      'read',
      'security_status',
      'success',
      { securityScore },
      {
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        clientIP: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || ''
      }
    );

    return NextResponse.json({
      ...securityStatus,
      securityScore,
      recommendations: generateSecurityRecommendations(securityStatus)
    });

  } catch (error: any) {
    console.error('Security status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch security status' },
      { status: 500 }
    );
  }
}

function calculateSecurityScore(status: any): {
  score: number;
  level: 'excellent' | 'good' | 'fair' | 'poor';
  factors: { factor: string; score: number; weight: number }[];
} {
  const factors = [
    {
      factor: 'Authentication Security',
      score: status.authentication.suspiciousSessions.length === 0 ? 100 : 
             status.authentication.suspiciousSessions.length < 5 ? 80 : 50,
      weight: 0.3
    },
    {
      factor: 'Audit Coverage',
      score: status.audit.stats.totalEvents > 0 ? 100 : 0,
      weight: 0.2
    },
    {
      factor: 'Error Rate',
      score: status.audit.stats.recentFailures < 10 ? 100 :
             status.audit.stats.recentFailures < 50 ? 70 : 30,
      weight: 0.2
    },
    {
      factor: 'Security Alerts',
      score: status.audit.recentAlerts.length === 0 ? 100 :
             status.audit.recentAlerts.filter((a: any) => a.severity === 'critical').length === 0 ? 80 : 40,
      weight: 0.3
    }
  ];

  const weightedScore = factors.reduce((sum, factor) => 
    sum + (factor.score * factor.weight), 0
  );

  const level = weightedScore >= 90 ? 'excellent' :
                weightedScore >= 75 ? 'good' :
                weightedScore >= 60 ? 'fair' : 'poor';

  return {
    score: Math.round(weightedScore),
    level,
    factors
  };
}

function generateSecurityRecommendations(status: any): string[] {
  const recommendations = [];

  // Check for suspicious sessions
  if (status.authentication.suspiciousSessions.length > 0) {
    recommendations.push(
      `Review ${status.authentication.suspiciousSessions.length} suspicious sessions`
    );
  }

  // Check for security alerts
  const criticalAlerts = status.audit.recentAlerts.filter((a: any) => a.severity === 'critical');
  if (criticalAlerts.length > 0) {
    recommendations.push(
      `Address ${criticalAlerts.length} critical security alerts immediately`
    );
  }

  // Check error rate
  if (status.audit.stats.recentFailures > 50) {
    recommendations.push(
      'High failure rate detected - investigate potential security issues'
    );
  }

  // Check middleware configuration
  if (!status.middleware.config.enableAuth) {
    recommendations.push('Enable authentication validation for better security');
  }

  if (!status.middleware.config.enableCSRF) {
    recommendations.push('Enable CSRF protection for state-changing operations');
  }

  // Memory usage check
  const memUsageMB = status.systemHealth.memoryUsage.heapUsed / 1024 / 1024;
  if (memUsageMB > 1000) {
    recommendations.push('High memory usage detected - monitor for potential issues');
  }

  // Default recommendations if none found
  if (recommendations.length === 0) {
    recommendations.push('Security posture is good - continue monitoring');
  }

  return recommendations;
}