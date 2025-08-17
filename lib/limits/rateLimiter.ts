import { createClient } from '@supabase/supabase-js';
import { getTierLimits, type UserTier, type ResourceKey, getPeriodStart } from './tierLimits';
interface Limits { hourly?: number; daily?: number; monthly?: number }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface RateCheckResult {
  allowed: boolean;
  reason?: string;
  remaining?: { hourly?: number; daily?: number; monthly?: number };
}

/**
 * Unified tier-based limiter using PostgreSQL counters.
 * Anonymous users should pass a fingerprint (hashed) as userId.
 */
export class TierRateLimiter {
  async check(
    userId: string,
    tier: UserTier,
    resource: ResourceKey
  ): Promise<RateCheckResult> {
    const limits = getTierLimits(tier).resources[resource as ResourceKey];
    if (!limits) return { allowed: true };

    // If no limits are defined for a period, we treat it as unlimited
    const periods: { key: keyof typeof limits; period: 'hour' | 'day' | 'month' }[] = [];
    if (typeof limits.hourly === 'number') periods.push({ key: 'hourly', period: 'hour' });
    if (typeof limits.daily === 'number') periods.push({ key: 'daily', period: 'day' });
    if (typeof limits.monthly === 'number') periods.push({ key: 'monthly', period: 'month' });

    // Fetch counters from a materialized view or table; create if missing
    // Table schema: user_usage_counters(user_id uuid/text, resource text, period_start timestamptz, period text, count int)
    const remaining: RateCheckResult['remaining'] = {};

    for (const p of periods) {
      const periodStart = getPeriodStart(p.period);
      const { data, error } = await supabase
        .from('user_usage_counters')
        .select('count')
        .eq('user_id', userId)
        .eq('resource', resource)
        .eq('period', p.period)
        .eq('period_start', periodStart)
        .maybeSingle();

      const current = error || !data ? 0 : (data.count as number) || 0;
      const limit = limits[p.key as keyof Limits]!;
      remaining[p.key as keyof Limits] = Math.max(0, limit - current);
      if (current >= limit) {
        return { allowed: false, reason: `Limit reached for ${resource} (${p.key})`, remaining };
      }
    }

    return { allowed: true, remaining };
  }

  async increment(
    userId: string,
    tier: UserTier,
    resource: ResourceKey,
    amount = 1
  ): Promise<void> {
    const limits = getTierLimits(tier).resources[resource as ResourceKey];
    if (!limits) return;

    const periods: ('hour' | 'day' | 'month')[] = [];
    if (typeof limits.hourly === 'number') periods.push('hour');
    if (typeof limits.daily === 'number') periods.push('day');
    if (typeof limits.monthly === 'number') periods.push('month');

    for (const period of periods) {
      const periodStart = getPeriodStart(period);
      // Upsert counter
      await supabase.rpc('upsert_usage_counter', {
        p_user_id: userId,
        p_resource: resource,
        p_period: period,
        p_period_start: periodStart,
        p_amount: amount
      });
    }
  }
}

export const tierRateLimiter = new TierRateLimiter();


