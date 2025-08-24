import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCheckoutSession } from '@/lib/stripe/subscriptions';
import type { SubscriptionTier } from '@/lib/stripe/server-config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { tier, userId } = await req.json();

    if (!tier || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: tier, userId' },
        { status: 400 }
      );
    }

    if (tier === 'free') {
      return NextResponse.json(
        { error: 'Cannot create checkout for free tier' },
        { status: 400 }
      );
    }

    // Get user information
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const session = await createCheckoutSession({
      userId,
      userEmail: user.email,
      tier: tier as SubscriptionTier,
      successUrl: `${baseUrl}/account?success=true`,
      cancelUrl: `${baseUrl}/account?cancelled=true`,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}