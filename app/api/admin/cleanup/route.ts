import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserInfo } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cleanup expired rooms and get statistics
export async function POST(request: NextRequest) {
  try {
    // Basic auth check - you might want to add admin role checking
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Optional: Add admin role check here
    // const { data: userTier } = await supabase
    //   .from('user_tiers')
    //   .select('tier')
    //   .eq('user_id', userInfo.id)
    //   .single();
    // 
    // if (userTier?.tier !== 'admin') {
    //   return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    // }

    // Run cleanup function
    const { data: cleanupResult, error: cleanupError } = await (supabase as any)
      .rpc('cleanup_expired_rooms');

    if (cleanupError) {
      console.error('Error running cleanup:', cleanupError);
      return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }

    // Get updated statistics
    const { data: stats, error: statsError } = await (supabase as any)
      .rpc('get_room_stats');

    if (statsError) {
      console.error('Error getting stats:', statsError);
      return NextResponse.json({ error: 'Failed to get statistics' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      cleanup: cleanupResult,
      stats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in cleanup endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get room statistics without cleanup
export async function GET(request: NextRequest) {
  try {
    // Basic auth check
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get statistics
    const { data: stats, error: statsError } = await (supabase as any)
      .rpc('get_room_stats');

    if (statsError) {
      console.error('Error getting stats:', statsError);
      return NextResponse.json({ error: 'Failed to get statistics' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in stats endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}