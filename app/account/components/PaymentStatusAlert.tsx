'use client';

import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, AlertTriangle, X, ExternalLink, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PaymentStatusAlertProps {
  paymentSuccess?: boolean;
  paymentCancelled?: boolean;
  stripeSessionId?: string | null;
  userEmail?: string;
  subscriptionTier?: string;
}

export default function PaymentStatusAlert({
  paymentSuccess = false,
  paymentCancelled = false,
  stripeSessionId = null,
  userEmail = '',
  subscriptionTier = 'free'
}: PaymentStatusAlertProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const router = useRouter();

  // Auto-dismiss success message after 10 seconds
  useEffect(() => {
    if (paymentSuccess) {
      const timer = setTimeout(() => {
        setIsDismissed(true);
        // Clean up URL parameters after showing success
        router.replace('/account', { scroll: false });
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [paymentSuccess, router]);

  const handleDismiss = () => {
    setIsDismissed(true);
    // Clean up URL parameters
    router.replace('/account', { scroll: false });
  };

  const handleVerifyPayment = async () => {
    if (!stripeSessionId) return;
    
    setIsVerifying(true);
    try {
      // Force a hard refresh to get the latest subscription data
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give webhooks time to process
      window.location.reload();
    } catch (error) {
      console.error('Error verifying payment:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  if (isDismissed || (!paymentSuccess && !paymentCancelled)) {
    return null;
  }

  if (paymentSuccess) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:bg-green-900/10">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <div className="flex justify-between items-start w-full">
          <div className="flex-1 min-w-0">
            <AlertTitle className="text-green-800 dark:text-green-400">
              Payment Successful! 🎉
            </AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300">
              <div className="space-y-2">
                <p>
                  Your payment has been processed successfully. You now have access to the{' '}
                  <strong className="capitalize">{subscriptionTier}</strong> plan features.
                </p>
                {stripeSessionId && (
                  <div className="text-sm space-y-2">
                    <p>• A confirmation email has been sent to {userEmail}</p>
                    <p>• Your invoice will be available in the billing history</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Session ID: {stripeSessionId.slice(0, 20)}...
                    </p>
                  </div>
                )}
                {subscriptionTier === 'free' && (
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <p className="font-medium">Tier not updated yet?</p>
                        <p className="text-xs mt-1">
                          If your subscription tier hasn't updated, it may take a moment for our system to process the payment.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 gap-2 text-xs h-7"
                          onClick={handleVerifyPayment}
                          disabled={isVerifying}
                        >
                          {isVerifying ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-3 w-3" />
                              Refresh Status
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="flex-shrink-0 ml-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    );
  }

  if (paymentCancelled) {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
        <XCircle className="h-4 w-4 text-amber-600" />
        <div className="flex justify-between items-start w-full">
          <div className="flex-1 min-w-0">
            <AlertTitle className="text-amber-800 dark:text-amber-400">
              Payment Cancelled
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              <p>
                You cancelled the payment process. No charges have been made to your payment method.
              </p>
              <p className="text-sm mt-2">
                You can try again anytime by selecting a subscription plan below.
              </p>
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="flex-shrink-0 ml-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    );
  }

  return null;
}