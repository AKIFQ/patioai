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
    // Validate request content type
    const contentType = req.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { tier, userId } = requestBody;

    // Input validation with specific error messages
    if (!tier) {
      return NextResponse.json(
        { error: 'Subscription tier is required' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate tier value
    const validTiers = ['basic', 'premium'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      );
    }

    if (tier === 'free') {
      return NextResponse.json(
        { error: 'Cannot create checkout session for free tier' },
        { status: 400 }
      );
    }

    // Get user information with better error handling
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Database error fetching user:', userError);
      return NextResponse.json(
        { error: 'Database error occurred while fetching user information' },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'User email is required for checkout' },
        { status: 400 }
      );
    }

    // Validate environment configuration
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      console.error('NEXT_PUBLIC_APP_URL environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    // Create checkout session with enhanced error handling
    const session = await createCheckoutSession({
      userId,
      userEmail: user.email,
      tier: tier as SubscriptionTier,
      successUrl: `${baseUrl}/account?success=true`,
      cancelUrl: `${baseUrl}/account?cancelled=true`,
    });

    // Log successful creation
    console.log(`Checkout session created for user ${userId} (${tier}): ${session.id}`);

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      tier,
      expiresAt: session.expires_at,
    });

  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    
    // Return user-friendly error message based on error type
    let errorMessage = 'An unexpected error occurred';
    let statusCode = 500;

    if (error.message?.includes('Configuration error') || 
        error.message?.includes('No price ID configured')) {
      errorMessage = 'Service configuration error. Please contact support.';
      statusCode = 503;
    } else if (error.message?.includes('Customer creation failed')) {
      errorMessage = 'Unable to set up customer account. Please try again.';
      statusCode = 500;
    } else if (error.message?.includes('Payment method was declined')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message?.includes('Rate limit')) {
      errorMessage = 'Too many requests. Please wait a moment and try again.';
      statusCode = 429;
    } else if (error.message?.includes('Network error')) {
      errorMessage = 'Connection error. Please check your internet and try again.';
      statusCode = 503;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID().slice(0, 8) // For debugging
      },
      { status: statusCode }
    );
  }
}