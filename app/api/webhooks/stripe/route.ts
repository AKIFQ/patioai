import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET, getTierFromPriceId } from '@/lib/stripe/server-config';
import { syncStripeSubscriptionToDatabase } from '@/lib/stripe/subscriptions';
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
  const headersList = await headers();
  const sig = headersList.get('stripe-signature');

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

  // Define allowed event types for security (based on t3dotgg recommendations)
  const allowedEventTypes = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ];

  if (!allowedEventTypes.includes(event.type)) {
    console.log(`Ignoring unhandled event type: ${event.type}`);
    return NextResponse.json({ received: true });
  }

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
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Return 500 to trigger Stripe retry
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  try {
    const { user_id: userId } = session.metadata || {};
    const customerId = session.customer as string;
    
    // Validate customer ID is string (t3dotgg recommendation)
    if (!customerId || typeof customerId !== 'string') {
      console.error('Invalid customer ID in checkout session:', session.id);
      return;
    }

    if (!userId) {
      console.error('Missing user_id in checkout session metadata:', session.id);
      return;
    }

    console.log(`Checkout completed for user ${userId}, customer: ${customerId}`);

    // Use centralized sync function (t3dotgg best practice)
    await syncStripeSubscriptionToDatabase(userId, customerId);
    
    console.log(`Successfully synced checkout data for user ${userId}`);
  } catch (error) {
    console.error('Error handling checkout completion:', error);
    throw error; // Re-throw to trigger Stripe retry
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    
    // Validate customer ID is string (t3dotgg recommendation)
    if (!customerId || typeof customerId !== 'string') {
      console.error('Invalid customer ID in subscription:', subscription.id);
      return;
    }

    console.log(`Subscription created for customer ${customerId}`);

    // Find user by customer ID
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (users && users.length > 0) {
      // Use centralized sync function
      await syncStripeSubscriptionToDatabase(users[0].id, customerId);
      console.log(`Successfully synced subscription creation for user ${users[0].id}`);
    } else {
      console.error(`No user found for customer ID: ${customerId}`);
    }
  } catch (error) {
    console.error('Error handling subscription creation:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    
    // Validate customer ID is string (t3dotgg recommendation)
    if (!customerId || typeof customerId !== 'string') {
      console.error('Invalid customer ID in subscription update:', subscription.id);
      return;
    }

    console.log(`Subscription updated for customer ${customerId}, status: ${subscription.status}`);

    // Find user by customer ID
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (users && users.length > 0) {
      // Use centralized sync function - it handles all status changes
      await syncStripeSubscriptionToDatabase(users[0].id, customerId);
      console.log(`Successfully synced subscription update for user ${users[0].id}`);
    } else {
      console.error(`No user found for customer ID: ${customerId}`);
    }
  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    
    // Validate customer ID is string (t3dotgg recommendation)
    if (!customerId || typeof customerId !== 'string') {
      console.error('Invalid customer ID in subscription deletion:', subscription.id);
      return;
    }

    console.log(`Subscription deleted for customer ${customerId}`);

    // Find user by customer ID
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (users && users.length > 0) {
      // Use centralized sync function - it will set tier to 'free' when no active subscription
      await syncStripeSubscriptionToDatabase(users[0].id, customerId);
      console.log(`Successfully synced subscription deletion for user ${users[0].id}`);
    } else {
      console.error(`No user found for customer ID: ${customerId}`);
    }
  } catch (error) {
    console.error('Error handling subscription deletion:', error);
    throw error;
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    const customerId = invoice.customer as string;
    
    // Validate customer ID is string (t3dotgg recommendation)
    if (!customerId || typeof customerId !== 'string') {
      console.error('Invalid customer ID in payment success:', invoice.id);
      return;
    }

    console.log(`Payment succeeded for customer ${customerId}, amount: ${invoice.amount_paid}`);

    // Find user by customer ID and sync subscription state
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (users && users.length > 0) {
      // Use centralized sync function to ensure subscription state is current
      await syncStripeSubscriptionToDatabase(users[0].id, customerId);
      console.log(`Successfully synced subscription after payment success for user ${users[0].id}`);
    } else {
      console.error(`No user found for customer ID: ${customerId}`);
    }
  } catch (error) {
    console.error('Error handling payment success:', error);
    throw error;
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const customerId = invoice.customer as string;
    
    // Validate customer ID is string (t3dotgg recommendation)
    if (!customerId || typeof customerId !== 'string') {
      console.error('Invalid customer ID in payment failure:', invoice.id);
      return;
    }

    console.log(`Payment failed for customer ${customerId}, amount: ${invoice.amount_due}`);

    // Find user by customer ID and sync subscription state
    // Note: For failed payments, the subscription status in Stripe will reflect the failure
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (users && users.length > 0) {
      // Use centralized sync function to ensure subscription state reflects payment failure
      await syncStripeSubscriptionToDatabase(users[0].id, customerId);
      console.log(`Successfully synced subscription after payment failure for user ${users[0].id}`);
    } else {
      console.error(`No user found for customer ID: ${customerId}`);
    }
  } catch (error) {
    console.error('Error handling payment failure:', error);
    throw error;
  }
}

// All helper functions now use centralized syncStripeSubscriptionToDatabase approach
// This follows t3dotgg best practices for maintaining single source of truth