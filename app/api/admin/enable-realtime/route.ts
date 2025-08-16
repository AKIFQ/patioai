import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest) {
  try {
    // No-op: Realtime is deprecated in favor of Socket.IO
    return NextResponse.json({ success: true, message: 'Supabase Realtime is disabled. Socket.IO is used exclusively.' });

  } catch (error) {
    console.error('Error enabling realtime:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}