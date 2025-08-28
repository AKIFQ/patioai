'use client';

import React, { memo, useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type Message } from '@ai-sdk/react';
import ChatMessage from './ChatMessage';
import { useAutoScroll } from '../hooks/useAutoScroll';
import ScrollToBottomButton from './ScrollToBottomButton';
import LoadMoreMessagesButton from './LoadMoreMessagesButton';

interface VirtualizedMessageListProps {
  messages: Message[];
  height: number;
  itemHeight?: number;
  currentUserDisplayName?: string; // For room chats to identify current user's messages
  showLoading?: boolean; // Show AI loading indicator
  isRoomChat?: boolean; // Whether this is a room chat (affects reasoning display)
  streamingMessageId?: string; // ID of currently streaming message
  streamingReasoning?: string; // Current streaming reasoning text
  isReasoningStreaming?: boolean; // Whether reasoning is currently streaming
  isReasoningComplete?: boolean; // Whether reasoning is complete
  // Pagination props
  hasMoreMessages?: boolean; // Whether there are more messages to load
  isLoadingMore?: boolean; // Whether currently loading more messages
  onLoadMore?: () => void; // Callback to load more messages
  totalDisplayed?: number; // Total number of messages currently displayed
}

interface MessageItemData {
  messages: Message[];
  currentUserDisplayName?: string;
  isRoomChat?: boolean;
  streamingMessageId?: string;
  streamingReasoning?: string;
  isReasoningStreaming?: boolean;
  isReasoningComplete?: boolean;
}

const VirtualizedMessageList = memo(({ 
  messages, 
  height, 
  itemHeight = 120, // Better default for chat messages
  currentUserDisplayName,
  showLoading = false,
  isRoomChat = false,
  streamingMessageId,
  streamingReasoning,
  isReasoningStreaming = false,
  isReasoningComplete = false,
  // Pagination props
  hasMoreMessages = false,
  isLoadingMore = false,
  onLoadMore,
  totalDisplayed = 0
}: VirtualizedMessageListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [actualHeight, setActualHeight] = useState(height || 600);
  
  // Measure actual container height when height is 0 (flexible layout)
  useEffect(() => {
    if (height === 0 && containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          if (newHeight > 0) {
            setActualHeight(newHeight);
          }
        }
      });
      
      resizeObserver.observe(containerRef.current);
      
      // Initial measurement
      const initialHeight = containerRef.current.clientHeight;
      if (initialHeight > 0) {
        setActualHeight(initialHeight);
      }
      
      return () => resizeObserver.disconnect();
    } else if (height > 0) {
      setActualHeight(height);
    }
  }, [height]);
  
  // Use actualHeight for all calculations
  const effectiveHeight = actualHeight;
  
  // For non-virtualized lists (< 50 messages) - raised threshold
  const { scrollRef, isAtBottom, isAutoScrolling, scrollToBottom, enableAutoScroll: enableNonVirtualizedAutoScroll } = useAutoScroll({
    threshold: 15, // Slightly increased for more comfortable spacing
    resumeDelay: 1500,
    enabled: true
  });
  
  // TanStack Virtual implementation for large message lists
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 10, // Increased buffer for smooth scrolling
    // Key feature: dynamic height measurement - fixes gaps!
    measureElement: (element) => element?.getBoundingClientRect().height ?? itemHeight,
  });

  // Auto-scroll state management for virtualized list
  const [virtualizedIsAutoScrolling, setVirtualizedIsAutoScrolling] = useState(true);
  const [virtualizedIsAtBottom, setVirtualizedIsAtBottom] = useState(true);
  
  // Scroll position tracking for "load more" button visibility
  const [isAtTop, setIsAtTop] = useState(true);
  
  // Determine which rendering mode to use
  const isVirtualized = messages.length >= 20;
  
  // Track scroll position for both virtualized and non-virtualized lists
  useEffect(() => {
    const scrollElement = isVirtualized ? parentRef.current : scrollRef.current;
    if (!scrollElement) return;
    
    const handleScroll = () => {
      const scrollTop = scrollElement.scrollTop;
      const isScrolledToTop = scrollTop <= 5; // Small tolerance for floating point precision
      setIsAtTop(isScrolledToTop);

      // Also track bottom state for virtualized list so the down-arrow hides when at bottom
      if (isVirtualized) {
        const distanceFromBottom = scrollElement.scrollHeight - scrollTop - scrollElement.clientHeight;
        setVirtualizedIsAtBottom(distanceFromBottom <= 8);
      }
    };
    
    scrollElement.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();
    
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [isVirtualized, messages.length]); // Re-run when virtualization mode changes
  
  // Reset to top when new messages are loaded (from pagination)
  useEffect(() => {
    if (messages.length > 0) {
      // When messages change, check if we're at the top
      const scrollElement = isVirtualized ? parentRef.current : scrollRef.current;
      if (scrollElement) {
        const scrollTop = scrollElement.scrollTop;
        setIsAtTop(scrollTop <= 5);
      }
    }
  }, [messages.length, isVirtualized]);
  
  // TanStack auto-scroll functions
  const scrollToBottomVirtual = useCallback(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [virtualizer, messages.length]);

  const enableVirtualAutoScroll = useCallback(() => {
    setVirtualizedIsAutoScrolling(true);
    // Immediately mark as at bottom after user requests scroll
    const el = parentRef.current;
    if (el) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setVirtualizedIsAtBottom(distanceFromBottom <= 8);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        if (isVirtualized && virtualizedIsAutoScrolling) {
          // For TanStack virtualized list
          scrollToBottomVirtual();
        } else if (!isVirtualized && isAutoScrolling) {
          // For non-virtualized list, use smooth scroll
          scrollToBottom();
        }
      }, 100); // Reduced delay for better responsiveness

      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isAutoScrolling, virtualizedIsAutoScrolling, isVirtualized, scrollToBottomVirtual, scrollToBottom]);

  // Ensure auto-scroll keeps following during streaming when message content grows
  useEffect(() => {
    if (!streamingMessageId) return;
    const timeoutId = setTimeout(() => {
      if (isVirtualized && virtualizedIsAutoScrolling) {
        scrollToBottomVirtual();
      } else if (!isVirtualized && isAutoScrolling) {
        scrollToBottom();
      }
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [messages, streamingMessageId, isReasoningStreaming, streamingReasoning, isVirtualized, virtualizedIsAutoScrolling, isAutoScrolling, scrollToBottomVirtual, scrollToBottom]);

  // Recompute bottom state after message count changes (virtualized only)
  useEffect(() => {
    if (!isVirtualized) return;
    const el = parentRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setVirtualizedIsAtBottom(distanceFromBottom <= 8);
  }, [messages.length, isVirtualized]);


  // Don't virtualize if there are few messages
  if (messages.length < 20) {
    return (
      <div 
        ref={containerRef}
        className="flex-1 w-full min-w-0 px-1 sm:px-4 md:px-8 lg:px-16 xl:px-24 2xl:px-32 flex flex-col overflow-hidden relative"
        data-chat-container
      >
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ height: height > 0 ? `${height}px` : '100%' }}
        >
          {/* Load More Messages Button - Floating overlay at top */}
          {hasMoreMessages && onLoadMore && isAtTop && (
            <div className="sticky top-0 z-10 flex justify-center pt-2 pb-1">
              <LoadMoreMessagesButton
                isLoading={isLoadingMore}
                hasMore={hasMoreMessages}
                onLoadMore={onLoadMore}
                totalDisplayed={totalDisplayed}
              />
            </div>
          )}
          <ul className="w-full min-w-0 space-y-1 pb-4" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {messages.map((message, index) => {
              // For room chats, check if the message is from the current user by comparing sender names
              // For regular chats, fall back to role-based check
              const isUserMessage = currentUserDisplayName 
                ? (message as any).senderName === currentUserDisplayName
                : message.role === 'user';
              
              // Check if this message is currently streaming
              const isStreaming = streamingMessageId === message.id;
                
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  index={index}
                  isUserMessage={isUserMessage}
                  isRoomChat={isRoomChat}
                  isStreaming={isStreaming}
                  streamingReasoning={isStreaming ? streamingReasoning : undefined}
                  isReasoningStreaming={isStreaming ? isReasoningStreaming : false}
                  isReasoningComplete={isStreaming ? isReasoningComplete : false}
                />
              );
            })}
            {/* Loading placeholder removed: rely on in-message temporary assistant row */}
          </ul>
        </div>
        
        {/* Scroll to bottom button */}
        <ScrollToBottomButton
          show={!isAtBottom}
          onClick={() => {
            scrollToBottom();
            enableNonVirtualizedAutoScroll();
          }}
          hasNewMessages={!isAutoScrolling}
        />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full min-w-0 px-1 sm:px-4 md:px-8 lg:px-16 xl:px-24 2xl:px-32 flex flex-col overflow-hidden relative" 
      data-chat-container
    >
      <div
        ref={parentRef}
        className="flex-1 overflow-auto relative"
        style={{ height: effectiveHeight }}
      >
        {/* Load More Messages Button - Floating overlay at top */}
        {hasMoreMessages && onLoadMore && isAtTop && (
          <div className="sticky top-0 z-10 flex justify-center pt-2 pb-1">
            <LoadMoreMessagesButton
              isLoading={isLoadingMore}
              hasMore={hasMoreMessages}
              onLoadMore={onLoadMore}
              totalDisplayed={totalDisplayed}
            />
          </div>
        )}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            
            // For room chats, check if the message is from the current user by comparing sender names
            // For regular chats, fall back to role-based check
            const isUserMessage = currentUserDisplayName 
              ? (message as any).senderName === currentUserDisplayName
              : message.role === 'user';

            // Check if this message is currently streaming
            const isStreaming = streamingMessageId === message.id;

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement} // Key feature: dynamic height measurement
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingLeft: 0
                }}
              >
                <ChatMessage
                  message={message}
                  index={virtualRow.index}
                  isUserMessage={isUserMessage}
                  isRoomChat={isRoomChat}
                  isStreaming={isStreaming}
                  streamingReasoning={isStreaming ? streamingReasoning : undefined}
                  isReasoningStreaming={isStreaming ? isReasoningStreaming : false}
                  isReasoningComplete={isStreaming ? isReasoningComplete : false}
                />
              </div>
            );
          })}
          {/* Loading placeholder removed: rely on in-message temporary assistant row */}
        </div>
      </div>
      
      {/* Scroll to bottom button for virtualized list */}
      <ScrollToBottomButton
        show={!virtualizedIsAtBottom}
        onClick={() => {
          scrollToBottomVirtual();
          // After scrolling, recompute and hide the arrow
          requestAnimationFrame(() => {
            const el = parentRef.current;
            if (el) {
              const d = el.scrollHeight - el.scrollTop - el.clientHeight;
              setVirtualizedIsAtBottom(d <= 8);
            }
          });
          enableVirtualAutoScroll();
        }}
        hasNewMessages={!virtualizedIsAutoScrolling}
      />
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default VirtualizedMessageList;