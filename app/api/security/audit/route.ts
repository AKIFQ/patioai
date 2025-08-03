import { NextRequest, NextResponse } from 'next/server';
import { auditLogger } from '@/lib/security/auditLogger';
import { authValidator } from '@/lib/security/authValidator';

export async function GET(request: NextRequest) {
  try {
    // Validate admin access
    const authResult = await authValidator.validateSession(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const outcome = searchParams.get('outcome');
    const severity = searchParams.get('severity');
    const limit = parseInt(searchParams.get('limit') || '100');
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

    // Get filtered audit events
    const events = auditLogger.getEvents({
      userId: userId || undefined,
      action: action || undefined,
      resource: resource || undefined,
      outcome: outcome as any,
      severity: severity as any,
      startDate,
      endDate,
      limit
    });

    // Get audit statistics
    const stats = auditLogger.getStats();

    // Get security alerts
    const alerts = auditLogger.getSecurityAlerts();

    // Log the audit access
    auditLogger.logDataAccess(
      'read',
      'audit_log',
      'success',
      {
        eventsReturned: events.length,
        filters: { userId, action, resource, outcome, severity, limit }
      },
      {
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        clientIP: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || ''
      }
    );

    return NextResponse.json({
      events,
      stats,
      alerts,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate admin access
    const authResult = await authValidator.validateSession(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { format = 'json' } = body;

    // Export audit log
    const exportData = auditLogger.exportAuditLog(format);

    // Log the export action
    auditLogger.logAdminAction(
      'export_audit_log',
      'audit_log',
      'success',
      { format, exportSize: exportData.length },
      {
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        clientIP: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || ''
      }
    );

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `audit_log_${new Date().toISOString().split('T')[0]}.${format}`;

    return new NextResponse(exportData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error: any) {
    console.error('Audit export error:', error);
    return NextResponse.json(
      { error: 'Failed to export audit data' },
      { status: 500 }
    );
  }
}