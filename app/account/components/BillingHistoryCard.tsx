'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Receipt, Download, ExternalLink, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import type { UserSubscriptionInfo } from '@/lib/server/subscriptionService';
import { redirectToCustomerPortal } from '@/lib/stripe/client';

interface BillingHistoryCardProps {
  subscriptionInfo: UserSubscriptionInfo;
}

export default function BillingHistoryCard({ subscriptionInfo }: BillingHistoryCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleViewInvoices = async () => {
    try {
      setIsLoading(true);
      await redirectToCustomerPortal(subscriptionInfo.id);
    } catch (error) {
      console.error('Billing portal error:', error);
      alert('Failed to open billing portal. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasActiveSubscription = subscriptionInfo.subscription_tier !== 'free' && 
                                subscriptionInfo.stripe_customer_id;

  // Mock billing data based on subscription info
  const mockBillingHistory = hasActiveSubscription ? [
    {
      id: 'inv_1',
      date: subscriptionInfo.period_start || new Date().toISOString(),
      amount: subscriptionInfo.subscription_tier === 'basic' ? 10 : 50,
      status: 'paid',
      description: `${subscriptionInfo.subscription_tier.charAt(0).toUpperCase() + subscriptionInfo.subscription_tier.slice(1)} Plan - Monthly`,
      downloadUrl: '#'
    }
  ] : [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Billing History Overview */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Billing History</h3>
              <p className="text-sm text-muted-foreground/80">
                View and download your invoices
              </p>
            </div>
          </div>

          {hasActiveSubscription && (
            <Button 
              onClick={handleViewInvoices}
              variant="outline" 
              size="sm"
              className="gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  View All Invoices
                </>
              )}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {hasActiveSubscription ? (
            <>
              {/* Recent Invoices */}
              <div className="space-y-3">
                {mockBillingHistory.map((invoice, index) => (
                  <div key={invoice.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[var(--elevation-2)] rounded-lg border dark:border-[var(--border)]">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(invoice.status)}
                      <div>
                        <p className="font-medium text-sm">{invoice.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(invoice.date).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium">${invoice.amount}</p>
                        <Badge variant="outline" className={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Download className="h-3 w-3" />
                        <span className="sr-only">Download</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Billing Summary */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Current Billing Period</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Period Start</p>
                    <p className="font-medium">
                      {subscriptionInfo.period_start 
                        ? new Date(subscriptionInfo.period_start).toLocaleDateString()
                        : 'N/A'
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Period End</p>
                    <p className="font-medium">
                      {subscriptionInfo.period_end 
                        ? new Date(subscriptionInfo.period_end).toLocaleDateString()
                        : 'N/A'
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Monthly Charge</p>
                    <p className="font-medium">
                      ${subscriptionInfo.subscription_tier === 'basic' ? '10.00' : '50.00'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Next Payment</p>
                    <p className="font-medium">
                      {subscriptionInfo.days_until_renewal !== null 
                        ? `${subscriptionInfo.days_until_renewal} days`
                        : 'N/A'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* No Billing History for Free Users */}
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                  <Receipt className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">No Billing History</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    You're currently on the free plan. Upgrade to a paid plan to view billing history 
                    and manage invoices.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Billing Information */}
      <Card className="p-6 bg-[var(--elevation-1)] border-[var(--border)]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--elevation-2)] flex items-center justify-center flex-shrink-0">
            <Receipt className="h-4 w-4 text-foreground/70" />
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Billing Information</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• All invoices are automatically generated and emailed to you</li>
              <li>• Downloads are available in PDF format through Stripe portal</li>
              <li>• Billing cycles run monthly from your subscription date</li>
              <li>• Payment failures will result in automatic retry attempts</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Tax Information */}
      {hasActiveSubscription && (
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4">Tax Information</h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax Rate</span>
              <span>Calculated at checkout based on location</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ID</span>
              <span className="text-muted-foreground">Update via billing portal</span>
            </div>

            <Separator className="my-3" />

            <p className="text-xs text-muted-foreground">
              Tax rates are automatically calculated based on your billing address. 
              To update tax information or add a tax ID, use the billing portal above.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}