'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings, CreditCard, BarChart3, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserSubscriptionInfo } from '@/lib/server/subscriptionService';
import { SmartAvatar } from '@/components/ui/Avatar';
import SubscriptionTierCard from './SubscriptionTierCard';
import UsageDashboard from './UsageDashboard';
import PaymentMethodsCard from './PaymentMethodsCard';
import BillingHistoryCard from './BillingHistoryCard';

interface AccountSettingsContentProps {
  subscriptionInfo: UserSubscriptionInfo;
}

export default function AccountSettingsContent({ subscriptionInfo }: AccountSettingsContentProps) {
  const [activeTab, setActiveTab] = useState('subscription');

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-border/40">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/chat">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back to Chat</span>
          </Link>
        </Button>
        
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Settings className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-medium">Account Settings</h1>
            <p className="text-sm text-muted-foreground/80">Manage your subscription and billing</p>
          </div>
        </div>
      </div>

      {/* User Profile Summary */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <SmartAvatar 
            user={{
              id: subscriptionInfo.id,
              full_name: subscriptionInfo.full_name,
              email: subscriptionInfo.email
            }} 
            size={60}
            style="thumbs"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium truncate">
              {subscriptionInfo.full_name || 'User'}
            </h2>
            <p className="text-sm text-muted-foreground/80 truncate">
              {subscriptionInfo.email}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className="px-2 py-1 bg-amber-100 text-amber-800 rounded-md text-xs font-medium">
                {subscriptionInfo.subscription_tier.charAt(0).toUpperCase() + 
                 subscriptionInfo.subscription_tier.slice(1)} Plan
              </div>
              {subscriptionInfo.subscription_status !== 'active' && (
                <div className="px-2 py-1 bg-red-100 text-red-800 rounded-md text-xs font-medium">
                  {subscriptionInfo.subscription_status}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="subscription" className="gap-2 text-xs">
            <User size={14} />
            <span className="hidden sm:inline">Plan</span>
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2 text-xs">
            <BarChart3 size={14} />
            <span className="hidden sm:inline">Usage</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2 text-xs">
            <CreditCard size={14} />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
          <TabsTrigger value="payment" className="gap-2 text-xs">
            <Settings size={14} />
            <span className="hidden sm:inline">Methods</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscription" className="space-y-4">
          <SubscriptionTierCard subscriptionInfo={subscriptionInfo} />
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <UsageDashboard subscriptionInfo={subscriptionInfo} />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <BillingHistoryCard subscriptionInfo={subscriptionInfo} />
        </TabsContent>

        <TabsContent value="payment" className="space-y-4">
          <PaymentMethodsCard subscriptionInfo={subscriptionInfo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}