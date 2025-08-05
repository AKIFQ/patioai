'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';

interface UseVirtualizedAutoScrollOptions {
  /**
   * Number of items from the end to consider "at bottom"
   * Default: 2
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

interface UseVirtualizedAutoScrollReturn {
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
  scrollToBottom: (listRef: React.RefObject<List>) => void;
  /**
   * Force enable auto-scroll
   */
  enableAutoScroll: () => void;
  /**
   * Handle scroll events from the virtualized list
   */
  handleScroll: (props: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => void;
  /**
   * Update dimensions for scroll calculations
   */
  updateDimensions: (itemCount: number, containerHeight: number, itemHeight?: number) => void;
}

export function useVirtualizedAutoScroll({
  threshold = 2,
  resumeDelay = 1000,
  enabled = true
}: UseVirtualizedAutoScrollOptions = {}): UseVirtualizedAutoScrollReturn {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const lastScrollOffsetRef = useRef(0);
  const itemCountRef = useRef(0);
  const containerHeightRef = useRef(0);
  const itemHeightRef = useRef(80);

  // Scroll to bottom for virtualized list
  const scrollToBottom = useCallback((listRef: React.RefObject<List>) => {
    if (!listRef.current || itemCountRef.current === 0) return;
    
    listRef.current.scrollToItem(itemCountRef.current - 1, 'end');
  }, []);

  // Enable auto-scroll
  const enableAutoScroll = useCallback(() => {
    setIsAutoScrolling(true);
    setUserScrolling(false);
  }, []);

  // Check if user is at bottom based on scroll offset
  const checkIfAtBottom = useCallback((scrollOffset: number) => {
    if (itemCountRef.current === 0) return true;
    
    const maxScrollOffset = Math.max(0, (itemCountRef.current * itemHeightRef.current) - containerHeightRef.current);
    const distanceFromBottom = maxScrollOffset - scrollOffset;
    
    // Consider "at bottom" if within threshold items
    return distanceFromBottom <= (threshold * itemHeightRef.current);
  }, [threshold]);

  // Handle scroll events from react-window
  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { 
    scrollOffset: number; 
    scrollUpdateWasRequested: boolean; 
  }) => {
    if (!enabled) return;

    // Skip if this was a programmatic scroll (auto-scroll)
    if (scrollUpdateWasRequested) {
      lastScrollOffsetRef.current = scrollOffset;
      return;
    }

    const atBottom = checkIfAtBottom(scrollOffset);
    setIsAtBottom(atBottom);

    // Detect scroll direction
    const isScrollingUp = scrollOffset < lastScrollOffsetRef.current;
    const isScrollingDown = scrollOffset > lastScrollOffsetRef.current;
    
    lastScrollOffsetRef.current = scrollOffset;

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
        if (checkIfAtBottom(scrollOffset)) {
          enableAutoScroll();
        }
      }, resumeDelay);
    }
  }, [enabled, checkIfAtBottom, userScrolling, enableAutoScroll, resumeDelay]);

  // Update item count and dimensions
  const updateDimensions = useCallback((itemCount: number, containerHeight: number, itemHeight: number = 80) => {
    itemCountRef.current = itemCount;
    containerHeightRef.current = containerHeight;
    itemHeightRef.current = itemHeight;
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    isAtBottom,
    isAutoScrolling,
    scrollToBottom,
    enableAutoScroll,
    handleScroll,
    updateDimensions
  };
}