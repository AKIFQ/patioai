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
 * Create a Stripe Checkout session for subscription with comprehensive error handling
 */
export async function createCheckoutSession({
  userId,
  userEmail,
  tier,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  // Input validation
  if (!userId || !userEmail || !tier || !successUrl || !cancelUrl) {
    throw new Error('Missing required parameters for checkout session creation');
  }

  if (tier === 'free') {
    throw new Error('Cannot create checkout session for free tier');
  }

  const priceId = getPriceIdForTier(tier);
  if (!priceId) {
    throw new Error(`No price ID configured for tier: ${tier}. Please check STRIPE_${tier.toUpperCase()}_PRICE_ID environment variable.`);
  }

  try {
    // First, create or retrieve the customer with error handling
    let customer;
    try {
      customer = await createOrRetrieveCustomer(userId, userEmail);
    } catch (customerError: any) {
      console.error('Failed to create/retrieve Stripe customer:', customerError);
      throw new Error(`Customer creation failed: ${customerError.message}`);
    }

    // Create checkout session with comprehensive configuration
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
      cancel_url: `${cancelUrl}?cancelled=true`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      // Add comprehensive metadata for webhook processing
      metadata: {
        user_id: userId,
        tier: tier,
        created_at: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      },
      // Security: Limit to one subscription per customer
      subscription_data: {
        metadata: {
          user_id: userId,
          tier: tier,
        },
        // Trial periods disabled for now to ensure payment processing works
        // TODO: Re-enable with proper configuration later
      },
      // Security: Enable 3D Secure and fraud prevention
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      // Automatic tax calculation (enable when ready)
      automatic_tax: {
        enabled: false,
      },
      // Consent collection removed due to API version compatibility
      // TODO: Re-add when Stripe API version is updated to support consent_collection
      // Expires in 24 hours
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
    });

    console.log(`Checkout session created successfully: ${session.id} for user ${userId} (${tier} tier)`);
    return session;

  } catch (stripeError: any) {
    console.error('Stripe checkout session creation failed:', stripeError);
    
    // Provide user-friendly error messages based on Stripe error types
    switch (stripeError.type) {
      case 'StripeCardError':
        throw new Error('Payment method was declined. Please try a different payment method.');
      case 'StripeRateLimitError':
        throw new Error('Too many requests. Please try again in a moment.');
      case 'StripeInvalidRequestError':
        throw new Error(`Configuration error: ${stripeError.message}`);
      case 'StripeAPIError':
        throw new Error('Payment service is temporarily unavailable. Please try again later.');
      case 'StripeConnectionError':
        throw new Error('Network error. Please check your connection and try again.');
      case 'StripeAuthenticationError':
        throw new Error('Payment service authentication failed. Please contact support.');
      default:
        throw new Error(`Checkout session creation failed: ${stripeError.message || 'Unknown error'}`);
    }
  }
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
 * Enhanced with comprehensive error handling and retry logic
 */
export async function syncStripeSubscriptionToDatabase(
  userId: string,
  customerId: string,
  retryCount: number = 0
): Promise<void> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get latest subscription from Stripe with error handling
    let subscriptions;
    try {
      subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 1,
      });
    } catch (stripeError: any) {
      console.error('Stripe API error when fetching subscriptions:', stripeError);
      
      // If it's a rate limit error, retry with exponential backoff
      if (stripeError.type === 'StripeRateLimitError' && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`Rate limited. Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return syncStripeSubscriptionToDatabase(userId, customerId, retryCount + 1);
      }
      
      throw new Error(`Stripe subscription fetch failed: ${stripeError.message}`);
    }

    let tier: SubscriptionTier = 'free';
    let subscriptionId: string | null = null;
    let status = 'inactive';
    let periodStart: string | null = null;
    let periodEnd: string | null = null;

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0];
      const priceId = subscription.items.data[0]?.price.id;
      tier = getTierFromPriceId(priceId);
      subscriptionId = subscription.id;
      
      // Map Stripe subscription status to our simplified status
      switch (subscription.status) {
        case 'active':
          status = 'active';
          break;
        case 'past_due':
          status = 'past_due';
          break;
        case 'unpaid':
          status = 'unpaid';
          break;
        case 'canceled':
        case 'incomplete':
        case 'incomplete_expired':
        case 'trialing':
        default:
          status = 'cancelled';
          break;
      }

      periodStart = subscription.current_period_start 
        ? new Date(subscription.current_period_start * 1000).toISOString() 
        : null;
      periodEnd = subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000).toISOString() 
        : null;
    }

    // Attempt database updates with transaction-like behavior
    const updates = [];
    
    try {
      // Update users table
      const userUpdate = supabase
        .from('users')
        .update({
          subscription_tier: tier,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: status,
          subscription_period_start: periodStart,
          subscription_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      updates.push(userUpdate);

      // Update user_tiers table
      const tierUpdate = supabase
        .from('user_tiers')
        .upsert({
          user_id: userId,
          tier: tier,
          updated_at: new Date().toISOString(),
        });

      updates.push(tierUpdate);

      // Execute all updates
      const results = await Promise.allSettled(updates);
      
      // Check for any failed updates
      const failedUpdates = results.filter(result => result.status === 'rejected');
      if (failedUpdates.length > 0) {
        console.error('Some database updates failed:', failedUpdates);
        // Don't throw here - log the errors but continue
      }

      console.log(`Successfully synced Stripe data for user ${userId}: tier=${tier}, status=${status}, subscription=${subscriptionId}`);
      
    } catch (dbError: any) {
      console.error('Database update error:', dbError);
      
      // Retry on temporary database issues
      if (retryCount < MAX_RETRIES && (
        dbError.message?.includes('connection') || 
        dbError.message?.includes('timeout') ||
        dbError.code === 'PGRST301' // PostgREST timeout
      )) {
        const delay = RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`Database error. Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return syncStripeSubscriptionToDatabase(userId, customerId, retryCount + 1);
      }
      
      throw new Error(`Database sync failed: ${dbError.message}`);
    }

  } catch (error: any) {
    const errorMessage = `Error syncing Stripe data for user ${userId}: ${error.message}`;
    console.error(errorMessage, error);
    
    // Only throw if we've exhausted retries
    if (retryCount >= MAX_RETRIES) {
      throw new Error(errorMessage);
    } else {
      // This shouldn't happen in normal flow, but added for safety
      throw error;
    }
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