import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { alertSystem } from '@/lib/monitoring/alertSystem';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const alerts = activeOnly 
      ? alertSystem.getActiveAlerts()
      : alertSystem.getAllAlerts(limit);

    const stats = alertSystem.getAlertStats();

    return NextResponse.json({
      alerts,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Alerts API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertId } = body;

    if (action === 'resolve' && alertId) {
      alertSystem.resolveAlert(alertId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid action or missing alertId' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Alerts API error:', error);
    return NextResponse.json(
      { error: 'Failed to process alert action' },
      { status: 500 }
    );
  }
}