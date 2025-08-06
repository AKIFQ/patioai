import { NextRequest, NextResponse } from 'next/server';
import { SystemCleanup } from '@/lib/cleanup/systemCleanup';

export async function POST(request: NextRequest) {
  try {
    const { aggressive = false } = await request.json().catch(() => ({}));
    const systemCleanup = SystemCleanup.getInstance();
    
    const results = await systemCleanup.triggerCleanup(aggressive);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      type: aggressive ? 'aggressive' : 'routine',
      ...results
    });



  } catch (error) {
    console.error('Memory cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const systemCleanup = SystemCleanup.getInstance();
    const status = systemCleanup.getSystemStatus();
    
    return NextResponse.json({
      ...status,
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Memory stats error:', error);
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}