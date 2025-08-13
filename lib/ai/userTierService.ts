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
   * Get user's subscription tier and usage
   */
  async getUserTier(userId: string): Promise<UserSubscription> {
    try {
      // TODO: Replace with actual subscription table query
      // For now, return free tier as default
      const { data: user } = await supabase
        .from('users')
        .select('subscription_tier, monthly_usage, monthly_cost')
        .eq('id', userId)
        .single();

      const tier = user?.subscription_tier || 'free';
      const monthlyUsage = user?.monthly_usage || 0;
      const costSpent = user?.monthly_cost || 0;

      // Define limits based on tier
      const limits = this.getTierLimits(tier);

      return {
        tier,
        monthlyUsage,
        monthlyLimit: limits.monthlyLimit,
        costSpent,
        warningThreshold: limits.warningThreshold,
        hardLimit: limits.hardLimit
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
   * Update user's monthly usage
   */
  async updateUsage(userId: string, tokensUsed: number, cost: number): Promise<void> {
    try {
      // TODO: Implement actual usage tracking
      await supabase
        .from('users')
        .update({
          monthly_usage: supabase.raw('monthly_usage + ?', [tokensUsed]),
          monthly_cost: supabase.raw('monthly_cost + ?', [cost])
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error updating usage:', error);
    }
  }

  /**
   * Check if user can make request
   */
  async canMakeRequest(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const userTier = await this.getUserTier(userId);

    // Check monthly limit
    if (userTier.monthlyUsage >= userTier.monthlyLimit) {
      return {
        allowed: false,
        reason: `Monthly limit of ${userTier.monthlyLimit} requests reached. Upgrade to continue.`
      };
    }

    // Check cost limit for paid tiers
    if (userTier.tier !== 'free' && userTier.costSpent >= userTier.hardLimit) {
      return {
        allowed: false,
        reason: 'Monthly cost limit reached. Usage will reset next month.'
      };
    }

    return { allowed: true };
  }

  /**
   * Get tier limits and thresholds
   */
  private getTierLimits(tier: string) {
    switch (tier) {
      case 'basic':
        return {
          monthlyLimit: 200,
          warningThreshold: 12,
          hardLimit: 15
        };
      case 'premium':
        return {
          monthlyLimit: 500,
          warningThreshold: 30,
          hardLimit: 40
        };
      default: // free
        return {
          monthlyLimit: 50,
          warningThreshold: 0,
          hardLimit: 0
        };
    }
  }

  /**
   * Get upgrade message for free users
   */
  getUpgradeMessage(requestedModel: string): string {
    return `The ${requestedModel} model requires a Pro subscription. Upgrade to access premium models with advanced reasoning capabilities.`;
  }
}

// Singleton instance
export const userTierService = new UserTierService();