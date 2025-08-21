import Stripe from 'stripe';
import { loadStripe } from '@stripe/stripe-js';

// Server-side Stripe instance
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

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

// Product and Price IDs (you'll need to create these in Stripe Dashboard)
export const STRIPE_PRICE_IDS = {
  basic: process.env.STRIPE_BASIC_PRICE_ID!, // $10/month
  premium: process.env.STRIPE_PREMIUM_PRICE_ID!, // $50/month
} as const;

// Webhook endpoint secret
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// Validate required environment variables
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required');
}

export type StripePriceId = keyof typeof STRIPE_PRICE_IDS;
export type SubscriptionTier = 'free' | 'basic' | 'premium';

// Helper to map subscription tiers to Stripe price IDs
export function getPriceIdForTier(tier: SubscriptionTier): string | null {
  switch (tier) {
    case 'basic':
      return STRIPE_PRICE_IDS.basic;
    case 'premium':
      return STRIPE_PRICE_IDS.premium;
    case 'free':
      return null;
    default:
      return null;
  }
}

// Helper to map Stripe price IDs to subscription tiers
export function getTierFromPriceId(priceId: string): SubscriptionTier {
  switch (priceId) {
    case STRIPE_PRICE_IDS.basic:
      return 'basic';
    case STRIPE_PRICE_IDS.premium:
      return 'premium';
    default:
      return 'free';
  }
}