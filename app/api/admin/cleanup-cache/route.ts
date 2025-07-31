import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Clear cache and clean up orphaned data
export async function POST(request: NextRequest) {
  try {
    // Clean up orphaned room data in database
    const { data: cleanupResult, error: cleanupError } = await (supabase as any)
      .rpc('cleanup_orphaned_room_data');

    if (cleanupError) {
      console.error('Error running cleanup:', cleanupError);
    }

    // Revalidate all chat-related paths to clear Next.js cache
    revalidatePath('/chat');
    revalidatePath('/chat/room');
    revalidatePath('/room');

    return NextResponse.json({
      success: true,
      message: 'Cache cleared and orphaned data cleaned up',
      cleanup: cleanupResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in cleanup-cache endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get cleanup status
export async function GET(request: NextRequest) {
  try {
    // Check for orphaned data
    const { data: orphanedCheck } = await (supabase as any)
      .from('room_participants')
      .select('room_id')
      .not('room_id', 'in', `(SELECT id FROM rooms)`);

    return NextResponse.json({
      success: true,
      orphaned_participants: orphanedCheck?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking cleanup status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}