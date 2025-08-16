import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/server/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { roomId, sessionId, displayName } = await req.json();

    if (!roomId || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update the room participant to link anonymous session with authenticated user
    const { data, error } = await supabase
      .from('room_participants')
      .update({
        user_id: session.id,
        display_name: displayName || session.user_metadata?.full_name || session.email?.split('@')[0] || 'User'
      })
      .eq('room_id', roomId)
      .eq('session_id', sessionId)
      .select();

    if (error) {
      console.error('Error updating room participant:', error);
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      participant: data?.[0],
      message: 'Participant updated successfully' 
    });

  } catch (error) {
    console.error('Error in update-participant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}