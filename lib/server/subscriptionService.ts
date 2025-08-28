import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/server/server';
import { getUserInfo } from '@/lib/server/supabase';
import { userTierService } from '@/lib/ai/userTierService';
import type { SubscriptionTier } from '@/lib/stripe/server-config';

export interface UserSubscriptionInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  subscription_tier: SubscriptionTier;
  subscription_status: 'active' | 'cancelled' | 'past_due' | 'unpaid';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  period_start: string | null;
  period_end: string | null;
  days_until_renewal: number | null;
  usage: {
    monthly_usage: number;
    monthly_limit: number;
    cost_spent: number;
    warning_threshold: number;
    hard_limit: number;
  };
}

/**
 * Get comprehensive user subscription information including usage data
 * Cached per request to avoid multiple database calls
 */
export const getUserSubscriptionInfo = cache(async (): Promise<UserSubscriptionInfo | null> => {
  try {
    // First get basic user info
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return null;
    }

    const supabase = await createServerSupabaseClient();

    // Get detailed subscription info from database
    const { data: subscriptionData, error: subscriptionError } = await supabase
      .rpc('get_user_subscription', { p_user_id: userInfo.id })
      .single();

    if (subscriptionError) {
      console.error('Error fetching subscription data:', subscriptionError);
      // Fall back to basic user info with default values
      const usage = await userTierService.getUserTier(userInfo.id);
      return {
        id: userInfo.id,
        full_name: userInfo.full_name,
        email: userInfo.email,
        subscription_tier: 'free',
        subscription_status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        period_start: null,
        period_end: null,
        days_until_renewal: null,
        usage: {
          monthly_usage: usage.monthlyUsage,
          monthly_limit: usage.monthlyLimit,
          cost_spent: usage.costSpent,
          warning_threshold: usage.warningThreshold,
          hard_limit: usage.hardLimit,
        },
      };
    }

    // Get usage information from userTierService
    const usage = await userTierService.getUserTier(userInfo.id);

    // Normalize tier string
    const resolvedTier = (subscriptionData?.subscription_tier || 'free') as SubscriptionTier;

    // Ensure user_tiers table reflects latest subscription for immediate propagation
    try {
      await supabase
        .from('user_tiers')
        .upsert(
          { user_id: userInfo.id as any, tier: resolvedTier as any },
          { onConflict: 'user_id' }
        );
    } catch (e) {
      console.warn('Failed to sync user_tiers with subscription tier:', e);
    }

    return {
      id: userInfo.id,
      full_name: userInfo.full_name,
      email: userInfo.email,
      subscription_tier: resolvedTier,
      subscription_status: subscriptionData?.subscription_status || 'active',
      stripe_customer_id: subscriptionData?.stripe_customer_id,
      stripe_subscription_id: subscriptionData?.stripe_subscription_id,
      period_start: subscriptionData?.period_start,
      period_end: subscriptionData?.period_end,
      days_until_renewal: subscriptionData?.days_until_renewal,
      usage: {
        monthly_usage: usage.monthlyUsage,
        monthly_limit: usage.monthlyLimit,
        cost_spent: usage.costSpent,
        warning_threshold: usage.warningThreshold,
        hard_limit: usage.hardLimit,
      },
    };
  } catch (error) {
    console.error('Error in getUserSubscriptionInfo:', error);
    return null;
  }
});

export interface PaymentEvent {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  event_type: 'succeeded' | 'failed' | 'refunded';
  amount: number; // Amount in cents
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  metadata: {
    subscription_id?: string;
    period_start?: string;
    period_end?: string;
    currency?: string;
    hosted_invoice_url?: string;
    invoice_pdf?: string;
    failure_reason?: string;
    attempt_count?: number;
    next_payment_attempt?: string;
  };
  created_at: string;
}

/**
 * Get user's payment history with proper formatting
 */
export const getUserPaymentHistory = cache(async (limit: number = 10): Promise<PaymentEvent[]> => {
  try {
    const userInfo = await getUserInfo();
    if (!userInfo) {
      return [];
    }

    const supabase = await createServerSupabaseClient();

    const { data: paymentEvents, error } = await supabase
      .from('payment_events')
      .select('*')
      .eq('user_id', userInfo.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }

    return (paymentEvents || []).map(event => ({
      ...event,
      metadata: event.metadata || {}
    })) as PaymentEvent[];
  } catch (error) {
    console.error('Error in getUserPaymentHistory:', error);
    return [];
  }
});

/**
 * Get formatted billing history for UI display
 */
export const getFormattedBillingHistory = cache(async () => {
  try {
    const paymentHistory = await getUserPaymentHistory();
    const subscriptionInfo = await getUserSubscriptionInfo();
    
    if (!subscriptionInfo) {
      return [];
    }

    return paymentHistory.map(event => ({
      id: event.stripe_invoice_id || event.id,
      date: event.created_at,
      amount: event.amount / 100, // Convert cents to dollars
      status: event.event_type === 'succeeded' ? 'paid' : 
              event.event_type === 'failed' ? 'failed' : 
              event.event_type === 'refunded' ? 'refunded' : 'pending',
      description: `${subscriptionInfo.subscription_tier.charAt(0).toUpperCase() + 
                     subscriptionInfo.subscription_tier.slice(1)} Plan - Monthly`,
      currency: event.metadata?.currency || 'usd',
      downloadUrl: event.metadata?.invoice_pdf || event.metadata?.hosted_invoice_url || null,
      subscriptionId: event.metadata?.subscription_id,
      periodStart: event.metadata?.period_start,
      periodEnd: event.metadata?.period_end,
      failureReason: event.metadata?.failure_reason,
      attemptCount: event.metadata?.attempt_count,
      nextAttempt: event.metadata?.next_payment_attempt,
    }));
  } catch (error) {
    console.error('Error in getFormattedBillingHistory:', error);
    return [];
  }
});

/**
 * Check if user needs to update payment method
 */
export const checkPaymentMethodStatus = cache(async () => {
  try {
    const subscriptionInfo = await getUserSubscriptionInfo();
    if (!subscriptionInfo || !subscriptionInfo.stripe_customer_id) {
      return { needs_update: false, reason: null };
    }

    // Check if subscription is past due or unpaid
    if (subscriptionInfo.subscription_status === 'past_due') {
      return { 
        needs_update: true, 
        reason: 'Payment failed. Please update your payment method.' 
      };
    }

    if (subscriptionInfo.subscription_status === 'unpaid') {
      return { 
        needs_update: true, 
        reason: 'Subscription unpaid. Please update your payment method.' 
      };
    }

    // Check if subscription is expiring soon (within 7 days)
    if (subscriptionInfo.days_until_renewal !== null && subscriptionInfo.days_until_renewal <= 7) {
      return { 
        needs_update: false, 
        reason: `Subscription renews in ${subscriptionInfo.days_until_renewal} days` 
      };
    }

    return { needs_update: false, reason: null };
  } catch (error) {
    console.error('Error checking payment method status:', error);
    return { needs_update: false, reason: null };
  }
});

/**
 * Format subscription period for display
 */
export function formatSubscriptionPeriod(periodStart: string | null, periodEnd: string | null): string {
  if (!periodStart || !periodEnd) {
    return 'No active subscription';
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  
  const startFormatted = start.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: start.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });
  
  const endFormatted = end.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: end.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });

  return `${startFormatted} - ${endFormatted}`;
}

// Re-export utility functions from shared utils
export { calculateUsagePercentage, getUsageStatusColor } from '@/lib/utils/subscriptionUtils';