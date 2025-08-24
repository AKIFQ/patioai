import { loadStripe } from '@stripe/stripe-js';

// Client-side Stripe instance (for frontend)
export const getStripe = () => {
  return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
};

// Stripe configuration constants
export const STRIPE_CONFIG = {
  currency: 'usd',
  billing_cycle: 'month',
  trial_period_days: 0,
  allow_promotion_codes: true,
  automatic_tax: {
    enabled: false, // Enable this when you're ready for tax collection
  },
  payment_method_types: ['card'],
  mode: 'subscription' as const,
};

// Validate required environment variables
if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required');
}

export type SubscriptionTier = 'free' | 'basic' | 'premium';