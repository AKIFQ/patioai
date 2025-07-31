import { type NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ user: null });
    }

    // Get user info from users table
    const { data: userInfo, error } = await supabase
      .from('users')
      .select('full_name, email, id')
      .eq('id', session.id)
      .single();

    if (error) {
      console.error('Error fetching user info:', error);
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: session.id,
        email: session.email,
        user_metadata: {
          full_name: userInfo?.full_name
        }
      }
    });

  } catch (error) {
    console.error('Error in auth user endpoint:', error);
    return NextResponse.json({ user: null });
  }
}