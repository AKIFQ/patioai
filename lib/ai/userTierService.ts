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

      // 2) Read current limits and spend using SQL function
      const { data: limits, error: limitsError } = await supabase
        .rpc('check_user_limits', { user_id_param: userId });

      if (limitsError) {
        console.warn('check_user_limits error:', limitsError);
      }

      const usage = Array.isArray(limits) && limits.length > 0 ? limits[0] : null;

      const monthlyUsage = usage?.usage_count ?? 0;
      const monthlyLimit = usage?.usage_limit ?? (tier === 'free' ? 50 : tier === 'basic' ? 200 : 500);
      const costSpent = Number(usage?.cost_spent ?? 0);
      const costLimit = Number(usage?.cost_limit ?? (tier === 'basic' ? 15 : tier === 'premium' ? 40 : 0));

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
      await supabase.rpc('increment_usage', {
        p_user_id: userId,
        p_tokens: Math.max(0, Math.floor(tokensUsed || 0)),
        p_cost: Number(cost || 0),
        p_model: modelUsed,
        p_type: requestType
      });
    } catch (error) {
      console.error('Error updating usage via increment_usage:', error);
    }
  }

  /**
   * Check if user can make request using helper function
   */
  async canMakeRequest(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const { data, error } = await supabase.rpc('check_user_limits', { user_id_param: userId });
      if (error) {
        console.warn('check_user_limits error:', error);
        return { allowed: true }; // be permissive on error
      }
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!row) return { allowed: true };
      return { allowed: !!row.can_make_request, reason: row.reason ?? undefined };
    } catch (e) {
      console.warn('canMakeRequest fallback:', e);
      return { allowed: true };
    }
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