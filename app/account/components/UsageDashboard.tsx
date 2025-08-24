'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, TrendingUp, MessageSquare, Bot, Upload, DollarSign } from 'lucide-react';
import type { UserSubscriptionInfo } from '@/lib/server/subscriptionService';
import { calculateUsagePercentage, getUsageStatusColor } from '@/lib/utils/subscriptionUtils';

interface UsageDashboardProps {
  subscriptionInfo: UserSubscriptionInfo;
}

export default function UsageDashboard({ subscriptionInfo }: UsageDashboardProps) {
  const { usage } = subscriptionInfo;
  
  const usagePercentage = calculateUsagePercentage(usage.monthly_usage, usage.monthly_limit);
  const costPercentage = usage.hard_limit > 0 
    ? calculateUsagePercentage(usage.cost_spent, usage.hard_limit) 
    : 0;

  const getUsageStatus = (percentage: number) => {
    if (percentage >= 90) return { label: 'Critical', color: 'text-red-500', bgColor: 'bg-red-50 border-red-200' };
    if (percentage >= 75) return { label: 'Warning', color: 'text-amber-500', bgColor: 'bg-amber-50 border-amber-200' };
    if (percentage >= 50) return { label: 'Moderate', color: 'text-blue-500', bgColor: 'bg-blue-50 border-blue-200' };
    return { label: 'Good', color: 'text-green-500', bgColor: 'bg-green-50 border-green-200' };
  };

  const usageStatus = getUsageStatus(usagePercentage);
  const costStatus = getUsageStatus(costPercentage);

  return (
    <div className="space-y-6">
      {/* Usage Overview */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Usage Overview</h3>
              <p className="text-sm text-muted-foreground/80">
                Current day usage statistics
              </p>
            </div>
          </div>
          
          <Badge variant="outline" className={usageStatus.bgColor}>
            <div className={`w-2 h-2 rounded-full ${usageStatus.color.replace('text-', 'bg-')} mr-2`} />
            {usageStatus.label}
          </Badge>
        </div>

        <div className="space-y-4">
          {/* AI Requests Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">AI Requests</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {usage.monthly_usage.toLocaleString()} / {usage.monthly_limit.toLocaleString()}
              </span>
            </div>
            
            <Progress 
              value={usagePercentage} 
              className="h-2"
            />
            
            <div className="flex justify-between text-xs text-muted-foreground/90">
              <span>{usagePercentage}% used</span>
              <span>{(usage.monthly_limit - usage.monthly_usage).toLocaleString()} remaining</span>
            </div>
          </div>

          {/* Cost Usage (for paid plans) */}
          {usage.hard_limit > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Daily Cost</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  ${usage.cost_spent.toFixed(2)} / ${usage.hard_limit.toFixed(2)}
                </span>
              </div>
              
              <Progress 
                value={costPercentage} 
                className="h-2"
              />
              
              <div className="flex justify-between text-xs text-muted-foreground/90">
                <span>{costPercentage}% of budget used</span>
                <span>${(usage.hard_limit - usage.cost_spent).toFixed(2)} remaining</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Usage Alerts */}
      {(usagePercentage >= 75 || costPercentage >= 75) && (
        <Card className="p-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-medium text-amber-900">Usage Alert</h4>
              <div className="space-y-1 text-sm text-amber-800">
                {usagePercentage >= 75 && (
                  <p>
                    You've used {usagePercentage}% of your daily AI requests. 
                    {usagePercentage >= 90 && ' Consider upgrading to avoid service interruption.'}
                  </p>
                )}
                {costPercentage >= 75 && (
                  <p>
                    You've spent {costPercentage}% of your daily budget. 
                    {costPercentage >= 90 && ' You may be charged overage fees.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tier Comparison */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <h3 className="text-lg font-medium mb-4">Plan Comparison</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {/* Free Tier */}
            <div className={`p-4 rounded-lg border ${
              subscriptionInfo.subscription_tier === 'free' 
                ? 'bg-blue-50 dark:bg-[var(--elevation-2)] border-blue-200 dark:border-[var(--border)]' 
                : 'bg-gray-50 dark:bg-[var(--elevation-2)] border-gray-200 dark:border-[var(--border)]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium">Free</h4>
                {subscriptionInfo.subscription_tier === 'free' && (
                  <Badge variant="outline" className="text-xs">Current</Badge>
                )}
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• 25 AI requests/day</li>
                <li>• Basic AI models</li>
                <li>• Smart routing</li>
                <li>• 3 concurrent rooms</li>
              </ul>
            </div>

            {/* Basic Tier */}
            <div className={`p-4 rounded-lg border ${
              subscriptionInfo.subscription_tier === 'basic' 
                ? 'bg-amber-50 dark:bg-[var(--elevation-2)] border-amber-200 dark:border-[var(--border)]' 
                : 'bg-gray-50 dark:bg-[var(--elevation-2)] border-gray-200 dark:border-[var(--border)]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium">Basic</h4>
                <span className="text-xs text-muted-foreground">$10/mo</span>
                {subscriptionInfo.subscription_tier === 'basic' && (
                  <Badge variant="outline" className="text-xs">Current</Badge>
                )}
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• 80 AI requests/day</li>
                <li>• Enhanced model access</li>
                <li>• 5 concurrent rooms</li>
                <li>• Priority support</li>
              </ul>
            </div>

            {/* Premium Tier */}
            <div className={`p-4 rounded-lg border ${
              subscriptionInfo.subscription_tier === 'premium' 
                ? 'bg-amber-50 dark:bg-[var(--elevation-2)] border-amber-200 dark:border-[var(--border)]' 
                : 'bg-gray-50 dark:bg-[var(--elevation-2)] border-gray-200 dark:border-[var(--border)]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium">Premium</h4>
                <span className="text-xs text-muted-foreground">$50/mo</span>
                {subscriptionInfo.subscription_tier === 'premium' && (
                  <Badge variant="outline" className="text-xs">Current</Badge>
                )}
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• 200 AI requests/day</li>
                <li>• Premium AI models</li>
                <li>• 15 concurrent rooms</li>
                <li>• Enterprise features</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}