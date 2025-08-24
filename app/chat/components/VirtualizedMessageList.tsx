'use client';

import React, { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type Message } from '@ai-sdk/react';
import ChatMessage from './ChatMessage';
import AILoadingMessage from './AILoadingMessage';
import { useAutoScroll } from '../hooks/useAutoScroll';
import ScrollToBottomButton from './ScrollToBottomButton';

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
  isReasoningComplete = false
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
  const { scrollRef, isAtBottom: nonVirtualizedAtBottom, isAutoScrolling: nonVirtualizedAutoScrolling, scrollToBottom, enableAutoScroll: enableNonVirtualizedAutoScroll } = useAutoScroll({
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

  // Auto-scroll state management
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  
  // Determine which rendering mode to use
  const isVirtualized = messages.length >= 50; // Raised from 20 to 50
  
  // TanStack auto-scroll functions
  const scrollToBottomVirtual = useCallback(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [virtualizer, messages.length]);

  const enableVirtualAutoScroll = useCallback(() => {
    setIsAutoScrolling(true);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && isAutoScrolling) {
      const timeoutId = setTimeout(() => {
        if (isVirtualized) {
          // For TanStack virtualized list
          scrollToBottomVirtual();
        } else {
          // For non-virtualized list, use smooth scroll
          scrollToBottom();
        }
      }, 100); // Reduced delay for better responsiveness

      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isAutoScrolling, isVirtualized, scrollToBottomVirtual, scrollToBottom]);

  const itemData = useMemo(() => ({
    messages,
    currentUserDisplayName,
    isRoomChat,
    streamingMessageId,
    streamingReasoning,
    isReasoningStreaming,
    isReasoningComplete
  }), [messages, currentUserDisplayName, isRoomChat, streamingMessageId, streamingReasoning, isReasoningStreaming, isReasoningComplete]);

  // Don't virtualize if there are few messages - raised threshold to avoid gaps
  if (messages.length < 50) {
    return (
      <div 
        ref={containerRef}
        className="flex-1 w-full min-w-0 px-4 sm:px-8 md:px-16 lg:px-24 xl:px-32 2xl:px-48 flex flex-col overflow-hidden"
        data-chat-container
      >
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ height: height > 0 ? `${height}px` : '100%' }}
        >
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
            {showLoading && <AILoadingMessage showInline />}
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
      className="flex-1 w-full min-w-0 px-4 sm:px-8 md:px-16 lg:px-24 xl:px-32 2xl:px-48 flex flex-col overflow-hidden relative" 
      data-chat-container
    >
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ height: effectiveHeight }}
      >
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
          {showLoading && (
            <div
              style={{
                position: 'absolute',
                top: `${virtualizer.getTotalSize()}px`,
                left: 0,
                width: '100%'
              }}
            >
              <AILoadingMessage showInline />
            </div>
          )}
        </div>
      </div>
      
      {/* Scroll to bottom button for virtualized list */}
      <ScrollToBottomButton
        show={!isAtBottom}
        onClick={() => {
          scrollToBottomVirtual();
          enableVirtualAutoScroll();
        }}
        hasNewMessages={!isAutoScrolling}
      />
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default VirtualizedMessageList;