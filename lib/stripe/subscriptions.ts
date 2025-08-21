import { stripe, STRIPE_CONFIG, getPriceIdForTier } from './config';
import type { SubscriptionTier } from './config';
import Stripe from 'stripe';

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
    ...STRIPE_CONFIG,
    customer: customer.id,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      tier,
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
  });

  return session;
}

/**
 * Create or retrieve a Stripe customer
 */
export async function createOrRetrieveCustomer(
  userId: string,
  email: string
): Promise<Stripe.Customer> {
  // First, try to find existing customer by metadata
  const existingCustomers = await stripe.customers.list({
    metadata: { userId },
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  });

  return customer;
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
 * Helper to get tier from price ID (imported from config but re-exported for convenience)
 */
function getTierFromPriceId(priceId: string): SubscriptionTier {
  const { getTierFromPriceId: configGetTier } = require('./config');
  return configGetTier(priceId);
}