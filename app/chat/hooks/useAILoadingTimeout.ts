'use client';

import { useEffect, useRef } from 'react';

/**
 * Ultra-lightweight hook for AI loading timeout
 * Optimized for production with thousands of users
 */
export const useAILoadingTimeout = (
  messageCount: number,
  isLoading: boolean,
  onComplete: () => void
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    // Only run when loading and message count increases
    if (!isLoading || messageCount <= lastCountRef.current) {
      return;
    }

    lastCountRef.current = messageCount;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(onComplete, 600); // Reduced to 600ms

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [messageCount, isLoading]); // Only these two dependencies
};