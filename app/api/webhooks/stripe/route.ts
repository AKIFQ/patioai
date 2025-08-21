import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET, getTierFromPriceId } from '@/lib/stripe/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function buffer(readable: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  let done, value;
  while (!done) {
    ({ value, done } = await reader.read());
    if (value) {
      chunks.push(value);
    }
  }
  const uint8Array = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    uint8Array.set(chunk, offset);
    offset += chunk.length;
  }
  return uint8Array;
}

export async function POST(req: NextRequest) {
  const body = await buffer(req.body!);
  const sig = headers().get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`Processing webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { userId, tier } = session.metadata || {};
  
  if (!userId || !tier) {
    console.error('Missing metadata in checkout session:', session.id);
    return;
  }

  console.log(`Checkout completed for user ${userId}, tier: ${tier}`);

  // Update user's tier in the database
  await updateUserTier(userId, tier as 'basic' | 'premium', session.customer as string);
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const tier = getTierFromPriceId(priceId);

  console.log(`Subscription created for customer ${customerId}, tier: ${tier}`);

  // Find user by customer ID and update their tier
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (users && users.length > 0) {
    await updateUserTier(users[0].id, tier as 'basic' | 'premium', customerId, subscription.id);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const tier = getTierFromPriceId(priceId);

  console.log(`Subscription updated for customer ${customerId}, tier: ${tier}, status: ${subscription.status}`);

  // Find user by customer ID
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (users && users.length > 0) {
    const userId = users[0].id;
    
    // If subscription is cancelled or past due, potentially downgrade
    if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
      // Keep the tier until the period ends, but mark as cancelled
      await updateUserSubscriptionStatus(userId, 'cancelled');
    } else if (subscription.status === 'active') {
      // Update tier and mark as active
      await updateUserTier(userId, tier as 'basic' | 'premium', customerId, subscription.id);
      await updateUserSubscriptionStatus(userId, 'active');
    }
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  console.log(`Subscription deleted for customer ${customerId}`);

  // Find user by customer ID and downgrade to free
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (users && users.length > 0) {
    await updateUserTier(users[0].id, 'free', customerId, null);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  console.log(`Payment succeeded for customer ${customerId}, amount: ${invoice.amount_paid}`);

  // Log successful payment, reset any failed payment flags
  await logPaymentEvent(customerId, 'succeeded', invoice.amount_paid || 0);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  console.log(`Payment failed for customer ${customerId}, amount: ${invoice.amount_due}`);

  // Log failed payment, potentially send notification
  await logPaymentEvent(customerId, 'failed', invoice.amount_due || 0);
}

async function updateUserTier(
  userId: string, 
  tier: 'free' | 'basic' | 'premium', 
  customerId: string,
  subscriptionId?: string | null
) {
  // Update user's tier in the users table
  const updates: any = {
    subscription_tier: tier,
    stripe_customer_id: customerId,
    updated_at: new Date().toISOString(),
  };

  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
  }

  const { error: userError } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (userError) {
    console.error('Error updating user tier:', userError);
    return;
  }

  // Also update or create entry in user_tiers table
  const { error: tierError } = await supabase
    .from('user_tiers')
    .upsert({
      user_id: userId,
      tier: tier,
      updated_at: new Date().toISOString(),
    });

  if (tierError) {
    console.error('Error updating user_tiers:', tierError);
  }

  console.log(`Updated user ${userId} to tier ${tier}`);
}

async function updateUserSubscriptionStatus(userId: string, status: 'active' | 'cancelled') {
  const { error } = await supabase
    .from('users')
    .update({
      subscription_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating subscription status:', error);
  }
}

async function logPaymentEvent(customerId: string, status: 'succeeded' | 'failed', amount: number) {
  // Find user by customer ID
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (users && users.length > 0) {
    const { error } = await supabase
      .from('payment_events')
      .insert({
        user_id: users[0].id,
        stripe_customer_id: customerId,
        event_type: status,
        amount: amount,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error logging payment event:', error);
    }
  }
}