import { getStripe } from './client-config';
import type { SubscriptionTier } from './client-config';

/**
 * Client-side utility functions for Stripe integration
 */

export interface CheckoutOptions {
  tier: SubscriptionTier;
  userId: string;
}

/**
 * Redirect to Stripe Checkout for subscription
 */
export async function redirectToCheckout({ tier, userId }: CheckoutOptions): Promise<void> {
  if (tier === 'free') {
    throw new Error('Cannot checkout for free tier');
  }

  try {
    // Create checkout session
    const response = await fetch('/api/subscriptions/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tier, userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const { sessionId } = await response.json();

    // Redirect to Stripe Checkout
    const stripe = await getStripe();
    if (!stripe) {
      throw new Error('Failed to load Stripe');
    }

    const result = await stripe.redirectToCheckout({ sessionId });

    if (result.error) {
      throw new Error(result.error.message);
    }
  } catch (error) {
    console.error('Checkout error:', error);
    throw error;
  }
}

/**
 * Redirect to Stripe Customer Portal for billing management
 */
export async function redirectToCustomerPortal(userId: string): Promise<void> {
  try {
    const response = await fetch('/api/subscriptions/portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create portal session');
    }

    const { url } = await response.json();

    // Redirect to Stripe Customer Portal
    window.location.href = url;
  } catch (error) {
    console.error('Customer portal error:', error);
    throw error;
  }
}

/**
 * Format price for display
 */
export function formatPrice(priceInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(priceInCents / 100);
}

/**
 * Get tier pricing information
 */
export const TIER_PRICING = {
  free: {
    price: 0,
    displayPrice: 'Free',
    features: [
      'Auto model selection',
      'Smart routing between models',
      'Basic AI models',
      '400 AI requests/month',
      '3 concurrent rooms',
      '5MB file uploads',
    ],
  },
  basic: {
    price: 1000, // $10.00 in cents
    displayPrice: '$10/month',
    features: [
      'Everything in Free',
      'Model selection',
      'Higher limits (1,500 requests/mo)',
      '5 concurrent rooms',
      '15MB file uploads',
      'Priority support',
    ],
  },
  premium: {
    price: 5000, // $50.00 in cents
    displayPrice: '$50/month',
    features: [
      'Everything in Basic',
      'Premium AI models',
      'Advanced reasoning models',
      '4,000 requests/month',
      '15 concurrent rooms',
      '50MB file uploads',
      'Enterprise collaboration',
      'Advanced analytics',
    ],
  },
} as const;

/**
 * Check if user can upgrade to a specific tier
 */
export function canUpgradeTo(currentTier: SubscriptionTier, targetTier: SubscriptionTier): boolean {
  const tierOrder: SubscriptionTier[] = ['free', 'basic', 'premium'];
  const currentIndex = tierOrder.indexOf(currentTier);
  const targetIndex = tierOrder.indexOf(targetTier);
  
  return targetIndex > currentIndex;
}

/**
 * Get the next available tier for upgrade
 */
export function getNextTier(currentTier: SubscriptionTier): SubscriptionTier | null {
  switch (currentTier) {
    case 'free':
      return 'basic';
    case 'basic':
      return 'premium';
    case 'premium':
      return null; // Already at highest tier
    default:
      return 'basic';
  }
}