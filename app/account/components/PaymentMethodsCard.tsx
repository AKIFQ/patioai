'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Plus, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import type { UserSubscriptionInfo } from '@/lib/server/subscriptionService';
import { redirectToCustomerPortal } from '@/lib/stripe/client';

interface PaymentMethodsCardProps {
  subscriptionInfo: UserSubscriptionInfo;
}

export default function PaymentMethodsCard({ subscriptionInfo }: PaymentMethodsCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleManagePaymentMethods = async () => {
    try {
      setIsLoading(true);
      await redirectToCustomerPortal(subscriptionInfo.id);
    } catch (error) {
      console.error('Payment methods error:', error);
      alert('Failed to open payment methods. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasActiveSubscription = subscriptionInfo.subscription_tier !== 'free' && 
                                subscriptionInfo.stripe_customer_id;

  const needsPaymentUpdate = subscriptionInfo.subscription_status === 'past_due' || 
                            subscriptionInfo.subscription_status === 'unpaid';

  return (
    <div className="space-y-6">
      {/* Payment Methods Overview */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Payment Methods</h3>
              <p className="text-sm text-muted-foreground/80">
                Manage your billing information
              </p>
            </div>
          </div>

          {needsPaymentUpdate && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              Action Required
            </Badge>
          )}
        </div>

        {/* Payment Status Alert */}
        {needsPaymentUpdate && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-[var(--elevation-2)] border border-red-200 dark:border-[var(--border)] rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-medium text-red-900">Payment Issue</h4>
                <p className="text-sm text-red-800">
                  {subscriptionInfo.subscription_status === 'past_due' && 
                    'Your last payment failed. Please update your payment method to avoid service interruption.'}
                  {subscriptionInfo.subscription_status === 'unpaid' && 
                    'Your subscription is unpaid. Please update your payment method to restore service.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {hasActiveSubscription ? (
            <>
              {/* Active Subscription */}
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-[var(--elevation-2)] border border-green-200 dark:border-[var(--border)] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">••••</span>
                  </div>
                  <div>
                    <p className="font-medium text-green-900">Active Payment Method</p>
                    <p className="text-sm text-green-700">
                      {subscriptionInfo.subscription_tier.charAt(0).toUpperCase() + 
                       subscriptionInfo.subscription_tier.slice(1)} Plan - $
                      {subscriptionInfo.subscription_tier === 'basic' ? '10' : '50'}/month
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  Active
                </Badge>
              </div>

              {/* Manage Button */}
              <Button 
                onClick={handleManagePaymentMethods}
                variant="outline" 
                className="w-full gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Opening Stripe Portal...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    Manage Payment Methods
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Stripe's secure portal to manage your payment methods,
                view invoices, and update billing information.
              </p>
            </>
          ) : (
            <>
              {/* No Active Subscription */}
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                  <CreditCard className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">No Payment Methods</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    You're currently on the free plan. Upgrade to a paid plan to add payment methods
                    and unlock premium features.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Payment Security */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--elevation-2)] flex items-center justify-center flex-shrink-0">
            <CreditCard className="h-4 w-4 text-foreground/70" />
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Secure Payment Processing</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• All payments are processed securely through Stripe</li>
              <li>• Your payment information is encrypted and never stored on our servers</li>
              <li>• You can update or cancel your subscription at any time</li>
              <li>• All charges will appear as "PatioAI" on your statement</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Billing Information */}
      {hasActiveSubscription && (
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4">Billing Information</h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer ID</span>
              <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                {subscriptionInfo.stripe_customer_id?.substring(0, 16)}...
              </span>
            </div>
            
            {subscriptionInfo.stripe_subscription_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subscription ID</span>
                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                  {subscriptionInfo.stripe_subscription_id.substring(0, 16)}...
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={
                subscriptionInfo.subscription_status === 'active' 
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }>
                {subscriptionInfo.subscription_status}
              </Badge>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}