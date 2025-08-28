import React from 'react';
import { redirect } from 'next/navigation';
import { getUserSubscriptionInfo, getFormattedBillingHistory } from '@/lib/server/subscriptionService';
import AccountSettingsContent from './components/AccountSettingsContent';

// Force dynamic rendering since this page uses authentication cookies
export const dynamic = 'force-dynamic';

interface AccountPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  // Get user subscription information
  const subscriptionInfo = await getUserSubscriptionInfo();
  
  // Redirect to login if not authenticated
  if (!subscriptionInfo) {
    redirect('/signin?redirect=/account');
  }

  // Get billing history (run in parallel with subscription info)
  const billingHistory = await getFormattedBillingHistory();

  // Await and extract URL parameters
  const resolvedSearchParams = await searchParams;
  const success = resolvedSearchParams.success === 'true';
  const cancelled = resolvedSearchParams.cancelled === 'true';
  const sessionId = typeof resolvedSearchParams.session_id === 'string' ? resolvedSearchParams.session_id : null;

  return (
    <div className="min-h-screen bg-background">
      <AccountSettingsContent 
        subscriptionInfo={subscriptionInfo} 
        billingHistory={billingHistory}
        paymentSuccess={success}
        paymentCancelled={cancelled}
        stripeSessionId={sessionId}
      />
    </div>
  );
}