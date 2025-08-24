'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowUpRight, CheckCircle, Star, Zap, Crown, Loader2 } from 'lucide-react';
import type { UserSubscriptionInfo } from '@/lib/server/subscriptionService';
import { TIER_PRICING, redirectToCheckout, redirectToCustomerPortal } from '@/lib/stripe/client';

interface SubscriptionTierCardProps {
  subscriptionInfo: UserSubscriptionInfo;
}

export default function SubscriptionTierCard({ subscriptionInfo }: SubscriptionTierCardProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  const currentTier = subscriptionInfo.subscription_tier;
  
  const handleUpgrade = async (targetTier: 'basic' | 'premium') => {
    try {
      setIsUpgrading(true);
      await redirectToCheckout({
        tier: targetTier,
        userId: subscriptionInfo.id,
      });
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to start upgrade process. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      setIsManaging(true);
      await redirectToCustomerPortal(subscriptionInfo.id);
    } catch (error) {
      console.error('Billing portal error:', error);
      alert('Failed to open billing portal. Please try again.');
    } finally {
      setIsManaging(false);
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'free':
        return <Star className="h-5 w-5 text-gray-500" />;
      case 'basic':
        return <Zap className="h-5 w-5 text-amber-500" />;
      case 'premium':
        return <Crown className="h-5 w-5 text-amber-600" />;
      default:
        return <Star className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'basic':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'premium':
        return 'bg-amber-200 text-amber-900 border-amber-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {getTierIcon(currentTier)}
            <div>
              <h3 className="text-lg font-medium">Current Plan</h3>
              <p className="text-sm text-muted-foreground/80">
                Your active subscription
              </p>
            </div>
          </div>
          
          <Badge variant="outline" className={getTierColor(currentTier)}>
            {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Price</span>
            <span className="font-medium">
              {TIER_PRICING[currentTier].displayPrice}
            </span>
          </div>

          {subscriptionInfo.period_start && subscriptionInfo.period_end && (
            <>
              <Separator className="my-3" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Period</span>
                  <span>
                    {new Date(subscriptionInfo.period_start).toLocaleDateString()} - {' '}
                    {new Date(subscriptionInfo.period_end).toLocaleDateString()}
                  </span>
                </div>
                
                {subscriptionInfo.days_until_renewal !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next Billing</span>
                    <span>
                      {subscriptionInfo.days_until_renewal > 0 
                        ? `In ${subscriptionInfo.days_until_renewal} days`
                        : 'Today'
                      }
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator className="my-3" />

          {/* Current Plan Features */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Included Features</h4>
            <div className="space-y-1">
              {TIER_PRICING[currentTier].features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-foreground/90">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Manage Billing Button for Paid Plans */}
          {currentTier !== 'free' && subscriptionInfo.stripe_customer_id && (
            <div className="pt-4">
              <Button 
                onClick={handleManageBilling}
                variant="outline" 
                className="w-full gap-2"
                disabled={isManaging}
              >
                {isManaging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="h-4 w-4" />
                    Manage Billing
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Upgrade Options */}
      {currentTier !== 'premium' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Upgrade Your Plan</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            {/* Basic Tier */}
            {currentTier === 'free' && (
              <Card className="p-6 relative overflow-hidden">
                <div className="absolute top-3 right-3">
                  <Zap className="h-5 w-5 text-amber-500" />
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-medium">Basic Plan</h4>
                    <p className="text-2xl font-medium text-amber-600">$10/month</p>
                    <p className="text-sm text-muted-foreground/80">
                      Same models with higher limits
                    </p>
                  </div>

                  <div className="space-y-1">
                    {TIER_PRICING.basic.features.slice(0, 4).map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button 
                    onClick={() => handleUpgrade('basic')}
                    className="w-full"
                    disabled={isUpgrading}
                  >
                    {isUpgrading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      'Upgrade to Basic'
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Premium Tier */}
            <Card className="p-6 relative overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-50 dark:to-orange-50 dark:text-[var(--forest-920)]">
              <div className="absolute top-3 right-3">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-medium">Premium Plan</h4>
                  <p className="text-2xl font-medium text-amber-600 dark:text-amber-400">$50/month</p>
                  <p className="text-sm text-muted-foreground/90">
                    Premium AI models + enterprise features
                  </p>
                </div>

                <div className="space-y-1 text-foreground/90">
                  {TIER_PRICING.premium.features.slice(0, 4).map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Button 
                  onClick={() => handleUpgrade('premium')}
                  className="w-full bg-amber-600 hover:bg-amber-600/90 text-amber-50"
                  disabled={isUpgrading}
                >
                  {isUpgrading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    'Upgrade to Premium'
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Premium User Message */}
      {currentTier === 'premium' && (
        <Card className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <div className="flex items-center gap-3 mb-3">
            <Crown className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-medium text-amber-900">Premium Member</h3>
          </div>
          <p className="text-sm text-amber-800/80">
            You're using our highest tier with access to the most advanced AI models and enterprise features. 
            Thank you for your support!
          </p>
        </Card>
      )}
    </div>
  );
}