'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAutoScrollOptions {
  /**
   * Threshold in pixels from bottom to consider "at bottom"
   * Default: 100
   */
  threshold?: number;
  /**
   * Delay in ms before resuming auto-scroll after user stops scrolling
   * Default: 1000
   */
  resumeDelay?: number;
  /**
   * Whether auto-scroll is enabled
   * Default: true
   */
  enabled?: boolean;
}

interface UseAutoScrollReturn {
  /**
   * Ref to attach to the scrollable container
   */
  scrollRef: React.RefObject<HTMLDivElement>;
  /**
   * Whether the user is currently at the bottom
   */
  isAtBottom: boolean;
  /**
   * Whether auto-scroll is currently active
   */
  isAutoScrolling: boolean;
  /**
   * Manually scroll to bottom
   */
  scrollToBottom: () => void;
  /**
   * Force enable auto-scroll (useful after user manually scrolls to bottom)
   */
  enableAutoScroll: () => void;
}

export function useAutoScroll({
  threshold = 100,
  resumeDelay = 1000,
  enabled = true
}: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const lastScrollTopRef = useRef(0);
  const programmaticScrollRef = useRef(false);

  // Check if user is at bottom of scroll container
  const checkIfAtBottom = useCallback(() => {
    if (!scrollRef.current) return false;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, [threshold]);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    
    programmaticScrollRef.current = true;
    
    // Scroll to bottom plus a small buffer to ensure complete message visibility
    const extraBuffer = 80; // Increased buffer for more comfortable spacing
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight + extraBuffer,
      behavior: 'smooth'
    });
    
    // Reset programmatic flag after scroll completes
    setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 500);
  }, []);

  // Enable auto-scroll (called when user manually scrolls to bottom)
  const enableAutoScroll = useCallback(() => {
    setIsAutoScrolling(true);
    setUserScrolling(false);
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !enabled) return;

    // Skip if this is a programmatic scroll
    if (programmaticScrollRef.current) return;

    const currentScrollTop = scrollRef.current.scrollTop;
    const atBottom = checkIfAtBottom();
    
    setIsAtBottom(atBottom);

    // Detect if user is actively scrolling
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
    const isScrollingDown = currentScrollTop > lastScrollTopRef.current;
    
    lastScrollTopRef.current = currentScrollTop;

    // If user scrolls up or away from bottom, disable auto-scroll
    if (isScrollingUp || (!atBottom && isScrollingDown)) {
      setUserScrolling(true);
      setIsAutoScrolling(false);
      
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    }

    // If user scrolls to bottom, re-enable auto-scroll
    if (atBottom && userScrolling) {
      enableAutoScroll();
    }

    // Set timeout to resume auto-scroll after user stops scrolling
    if (!atBottom) {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      scrollTimeoutRef.current = setTimeout(() => {
        // Only resume if user is still near the bottom
        if (checkIfAtBottom()) {
          enableAutoScroll();
        }
      }, resumeDelay);
    }
  }, [enabled, checkIfAtBottom, userScrolling, enableAutoScroll, resumeDelay]);

  // Auto-scroll when new content is added (if auto-scroll is enabled)
  const autoScrollToBottom = useCallback(() => {
    if (!enabled || !isAutoScrolling || userScrolling) return;
    
    // Small delay to ensure DOM has updated
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [enabled, isAutoScrolling, userScrolling, scrollToBottom]);

  // Set up scroll listener
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    scrollRef,
    isAtBottom,
    isAutoScrolling,
    scrollToBottom: autoScrollToBottom,
    enableAutoScroll
  };
}