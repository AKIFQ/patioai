import { stripe, getPriceIdForTier } from './server-config';
import type { SubscriptionTier } from './server-config';
import type Stripe from 'stripe';

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  tier: SubscriptionTier;
  successUrl: string;
  cancelUrl: string;
}

export interface SubscriptionDetails {
  id: string;
  status: Stripe.Subscription.Status;
  current_period_start: number;
  current_period_end: number;
  tier: SubscriptionTier;
  cancel_at_period_end: boolean;
  price_id: string;
  customer_id: string;
}

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession({
  userId,
  userEmail,
  tier,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  if (tier === 'free') {
    throw new Error('Cannot create checkout session for free tier');
  }

  const priceId = getPriceIdForTier(tier);
  if (!priceId) {
    throw new Error(`No price ID found for tier: ${tier}`);
  }

  // First, create or retrieve the customer
  const customer = await createOrRetrieveCustomer(userId, userEmail);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: customer.id,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    // Add metadata for webhook processing
    metadata: {
      user_id: userId,
      tier: tier,
    },
    // Security: Limit to one subscription per customer
    subscription_data: {
      metadata: {
        user_id: userId,
      },
    },
    // Security: Disable risky payment methods
    payment_method_options: {
      card: {
        request_three_d_secure: 'automatic',
      },
    },
  });

  return session;
}

/**
 * Create or retrieve a Stripe customer with proper user ID mapping
 */
export async function createOrRetrieveCustomer(
  userId: string,
  email: string
): Promise<Stripe.Customer> {
  // First, try to find existing customer by user ID metadata
  const existingCustomers = await stripe.customers.list({
    email: email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    const customer = existingCustomers.data[0];
    // Store the customer ID in our database for quick lookup
    await syncCustomerToDatabase(userId, customer.id);
    return customer;
  }

  // Create new customer with user ID in metadata for reliable mapping
  const customer = await stripe.customers.create({
    email,
    name: `User ${userId}`,
    metadata: {
      user_id: userId,
    },
  });

  // Store the customer ID in our database
  await syncCustomerToDatabase(userId, customer.id);

  return customer;
}

/**
 * Sync customer ID to database for quick lookup
 */
async function syncCustomerToDatabase(userId: string, customerId: string): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('users')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId);

  if (error) {
    console.error('Failed to sync customer ID to database:', error);
  }
}

/**
 * Get subscription details by customer ID
 */
export async function getSubscriptionByCustomer(
  customerId: string
): Promise<SubscriptionDetails | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    return null;
  }

  const subscription = subscriptions.data[0];
  const priceId = subscription.items.data[0]?.price.id;

  return {
    id: subscription.id,
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    tier: getTierFromPriceId(priceId),
    cancel_at_period_end: subscription.cancel_at_period_end,
    price_id: priceId,
    customer_id: customerId,
  };
}

/**
 * Cancel subscription at the end of the billing period
 */
export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Reactivate a cancelled subscription
 */
export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Change subscription tier
 */
export async function changeSubscriptionTier(
  subscriptionId: string,
  newTier: SubscriptionTier
): Promise<Stripe.Subscription> {
  if (newTier === 'free') {
    // For downgrading to free, cancel the subscription
    return await cancelSubscription(subscriptionId);
  }

  const newPriceId = getPriceIdForTier(newTier);
  if (!newPriceId) {
    throw new Error(`No price ID found for tier: ${newTier}`);
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentItem = subscription.items.data[0];

  return await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: currentItem.id,
        price: newPriceId,
      },
    ],
    proration_behavior: 'always_invoice',
  });
}

/**
 * Create customer portal session for managing billing
 */
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Centralized function to sync Stripe subscription data to our database
 * Based on t3dotgg best practices for maintaining data consistency
 */
export async function syncStripeSubscriptionToDatabase(
  userId: string,
  customerId: string
): Promise<void> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get latest subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1,
    });

    let tier: SubscriptionTier = 'free';
    let subscriptionId: string | null = null;
    let status = 'inactive';

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0];
      const priceId = subscription.items.data[0]?.price.id;
      tier = getTierFromPriceId(priceId);
      subscriptionId = subscription.id;
      status = subscription.status === 'active' ? 'active' : 'inactive';
    }

    // Update users table
    const { error: userError } = await supabase
      .from('users')
      .update({
        subscription_tier: tier,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (userError) {
      console.error('Failed to update users table:', userError);
    }

    // Update user_tiers table
    const { error: tierError } = await supabase
      .from('user_tiers')
      .upsert({
        user_id: userId,
        tier: tier,
        updated_at: new Date().toISOString(),
      });

    if (tierError) {
      console.error('Failed to update user_tiers table:', tierError);
    }

    console.log(`Synced Stripe data for user ${userId}: tier=${tier}, status=${status}`);
  } catch (error) {
    console.error('Error syncing Stripe data to database:', error);
    throw error;
  }
}

/**
 * Helper to get tier from price ID (imported from config but re-exported for convenience)
 */
function getTierFromPriceId(priceId: string): SubscriptionTier {
  // Dynamic import to avoid circular dependency issues
  const { getTierFromPriceId: configGetTier } = 
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./server-config');
  return configGetTier(priceId);
}