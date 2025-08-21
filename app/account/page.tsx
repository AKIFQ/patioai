import React from 'react';
import { redirect } from 'next/navigation';
import { getUserSubscriptionInfo } from '@/lib/server/subscriptionService';
import AccountSettingsContent from './components/AccountSettingsContent';

export default async function AccountPage() {
  // Get user subscription information
  const subscriptionInfo = await getUserSubscriptionInfo();
  
  // Redirect to login if not authenticated
  if (!subscriptionInfo) {
    redirect('/signin?redirect=/account');
  }

  return (
    <div className="min-h-screen bg-background">
      <AccountSettingsContent subscriptionInfo={subscriptionInfo} />
    </div>
  );
}