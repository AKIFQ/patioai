import { NextRequest, NextResponse } from 'next/server';
import { csrfProtection } from '@/lib/security/csrfProtection';
import { authValidator } from '@/lib/security/authValidator';
import { auditLogger } from '@/lib/security/auditLogger';

export async function GET(request: NextRequest) {
  try {
    // Validate session
    const authResult = await authValidator.validateSession(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate CSRF token
    const token = csrfProtection.generateToken(authResult.sessionId!);

    // Log token generation
    auditLogger.logEvent(
      'csrf_token_generated',
      'security_token',
      'success',
      'low',
      {},
      {
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        clientIP: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || ''
      }
    );

    return NextResponse.json({
      csrfToken: token,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('CSRF token generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, sessionId } = body;

    if (!token || !sessionId) {
      return NextResponse.json(
        { error: 'Token and session ID required' },
        { status: 400 }
      );
    }

    // Validate CSRF token
    const isValid = csrfProtection.validateToken(token, sessionId);

    // Log validation attempt
    auditLogger.logEvent(
      'csrf_token_validated',
      'security_token',
      isValid ? 'success' : 'failure',
      isValid ? 'low' : 'medium',
      { tokenValid: isValid },
      {
        sessionId,
        clientIP: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || ''
      }
    );

    return NextResponse.json({
      valid: isValid,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('CSRF token validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate CSRF token' },
      { status: 500 }
    );
  }
}