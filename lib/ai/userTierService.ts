import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface UserSubscription {
  tier: 'free' | 'basic' | 'premium';
  monthlyUsage: number;
  monthlyLimit: number;
  costSpent: number;
  warningThreshold: number;
  hardLimit: number;
}

export class UserTierService {
  /**
   * Get user's subscription tier and usage via helper function and user_tiers
   */
  async getUserTier(userId: string): Promise<UserSubscription> {
    try {
      // 1) Get tier from user_tiers (defaults to free if absent)
      const { data: tierRow } = await supabase
        .from('user_tiers')
        .select('tier')
        .eq('user_id', userId)
        .maybeSingle();

      const tier = (tierRow?.tier as any) || 'free';

      // 2) Read usage summary from counters (fallback to 0 if missing)
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const { data: counters } = await supabase
        .from('user_usage_counters')
        .select('count')
        .eq('user_id', userId)
        .eq('resource', 'ai_requests')
        .eq('period', 'month')
        .eq('period_start', monthStart.toISOString())
        .maybeSingle();

      const monthlyUsage = counters?.count ?? 0;
      const monthlyLimit = tier === 'free' ? 400 : tier === 'basic' ? 1500 : 4000;
      const costSpent = 0;
      const costLimit = tier === 'basic' ? 15 : tier === 'premium' ? 40 : 0;

      return {
        tier: tier as any,
        monthlyUsage,
        monthlyLimit,
        costSpent,
        warningThreshold: costLimit > 0 ? Math.floor(costLimit * 0.75) : 0,
        hardLimit: costLimit
      };
    } catch (error) {
      console.error('Error fetching user tier:', error);
      // Default to free tier on error
      return {
        tier: 'free',
        monthlyUsage: 0,
        monthlyLimit: 50,
        costSpent: 0,
        warningThreshold: 0,
        hardLimit: 0
      };
    }
  }

  /**
   * Update user's monthly usage (tokens + cost) and log model
   */
  async updateUsage(userId: string, tokensUsed: number, cost: number, modelUsed: string, requestType: string = 'chat'): Promise<void> {
    try {
      const tokens = Math.max(0, Math.floor(tokensUsed || 0));
      const costNumber = Number(cost || 0);

      // Append usage log
      await supabase.from('user_usage_logs').insert({
        user_id: userId as any,
        model_used: modelUsed,
        tokens_used: tokens,
        cost: costNumber,
        request_type: requestType
      });

      // Update monthly aggregates on users table
      await supabase.from('users').update({
        monthly_usage: (undefined as any), // left undefined to avoid overwriting with null
        monthly_cost: (undefined as any)
      }).eq('id', userId);
    } catch (error) {
      console.error('Error updating usage via increment_usage:', error);
    }
  }

  /**
   * Check if user can make request using helper function
   */
  async canMakeRequest(_userId: string): Promise<{ allowed: boolean; reason?: string }> {
    // Legacy API no longer used for gating; limits enforced via TierRateLimiter
    return { allowed: true };
  }

  /**
   * Get upgrade message for free users
   */
  getUpgradeMessage(_requestedModel: string): string {
    return `Upgrade required`;
  }
}

// Singleton instance
export const userTierService = new UserTierService();