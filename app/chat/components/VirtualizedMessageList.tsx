'use client';

import React, { memo, useMemo, useRef, useEffect, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { type Message } from '@ai-sdk/react';
import ChatMessage from './ChatMessage';
import AILoadingMessage from './AILoadingMessage';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useVirtualizedAutoScroll } from '../hooks/useVirtualizedAutoScroll';
import ScrollToBottomButton from './ScrollToBottomButton';

interface VirtualizedMessageListProps {
  messages: Message[];
  height: number;
  itemHeight?: number;
  currentUserDisplayName?: string; // For room chats to identify current user's messages
  showLoading?: boolean; // Show AI loading indicator
  isRoomChat?: boolean; // Whether this is a room chat (affects reasoning display)
}

interface MessageItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    messages: Message[];
    currentUserDisplayName?: string;
    isRoomChat?: boolean;
  };
}

const MessageItem = memo(({ index, style, data }: MessageItemProps) => {
  const message = data.messages[index];
  
  // For room chats, check if the message is from the current user by comparing sender names
  // For regular chats, fall back to role-based check
  const isUserMessage = data.currentUserDisplayName 
    ? (message as any).senderName === data.currentUserDisplayName
    : message.role === 'user';

  return (
    <div style={style}>
      <ChatMessage
        message={message}
        index={index}
        isUserMessage={isUserMessage}
        isRoomChat={data.isRoomChat}
      />
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

const VirtualizedMessageList = memo(({ 
  messages, 
  height, 
  itemHeight = 80,
  currentUserDisplayName,
  showLoading = false,
  isRoomChat = false
}: VirtualizedMessageListProps) => {
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [actualHeight, setActualHeight] = useState(height || 600);
  
  // Measure actual container height when height is 0 (flexible layout)
  useEffect(() => {
    if (height === 0 && containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
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
  
  // For non-virtualized lists (< 20 messages)
  const { scrollRef, isAtBottom: nonVirtualizedAtBottom, isAutoScrolling: nonVirtualizedAutoScrolling, scrollToBottom, enableAutoScroll: enableNonVirtualizedAutoScroll } = useAutoScroll({
    threshold: 15, // Slightly increased for more comfortable spacing
    resumeDelay: 1500,
    enabled: true
  });
  
  // For virtualized lists (>= 20 messages)
  const { 
    isAtBottom: virtualizedAtBottom, 
    isAutoScrolling: virtualizedAutoScrolling, 
    scrollToBottom: scrollVirtualizedToBottom, 
    enableAutoScroll: enableVirtualizedAutoScroll,
    handleScroll: handleVirtualizedScroll,
    updateDimensions
  } = useVirtualizedAutoScroll({
    threshold: 0.1, // Very small threshold for virtualized lists
    resumeDelay: 1500,
    enabled: true
  });
  
  // Determine which scroll state to use
  const isVirtualized = messages.length >= 20;
  const isAtBottom = isVirtualized ? virtualizedAtBottom : nonVirtualizedAtBottom;
  const isAutoScrolling = isVirtualized ? virtualizedAutoScrolling : nonVirtualizedAutoScrolling;

  // Update dimensions for virtualized scroll calculations
  useEffect(() => {
    if (isVirtualized) {
      updateDimensions(messages.length, effectiveHeight, itemHeight);
    }
  }, [messages.length, effectiveHeight, itemHeight, isVirtualized, updateDimensions]);

  // Auto-scroll to bottom when new messages arrive or content changes
  useEffect(() => {
    if (messages.length > 0 && isAutoScrolling) {
      // Increased delay to ensure content is fully rendered, especially for AI streaming
      const timeoutId = setTimeout(() => {
        if (isVirtualized && listRef.current) {
          // For virtualized list, scroll to last item
          scrollVirtualizedToBottom(listRef);
        } else {
          // For non-virtualized list, use smooth scroll
          scrollToBottom();
        }
        
        // Additional scroll after a short delay to ensure complete visibility
        setTimeout(() => {
          if (isVirtualized && listRef.current) {
            scrollVirtualizedToBottom(listRef);
          } else {
            scrollToBottom();
          }
        }, 100);
      }, 150); // Increased delay for better content rendering

      return () => clearTimeout(timeoutId);
    }
  }, [messages, isAutoScrolling, isVirtualized, scrollVirtualizedToBottom, scrollToBottom]); // Changed dependency from messages.length to messages to catch content updates

  const itemData = useMemo(() => ({
    messages,
    currentUserDisplayName,
    isRoomChat
  }), [messages, currentUserDisplayName, isRoomChat]);

  // Don't virtualize if there are few messages
  if (messages.length < 20) {
    return (
      <div 
        ref={containerRef}
        className="flex-1 w-full min-w-0 px-1 sm:px-2 md:px-4 lg:px-6 flex flex-col overflow-hidden"
        data-chat-container
      >
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          style={{ height: height > 0 ? `${height}px` : '100%' }}
        >
          <ul className="w-full min-w-0 space-y-1 pb-4" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {messages.map((message, index) => {
              // For room chats, check if the message is from the current user by comparing sender names
              // For regular chats, fall back to role-based check
              const isUserMessage = currentUserDisplayName 
                ? (message as any).senderName === currentUserDisplayName
                : message.role === 'user';
                
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  index={index}
                  isUserMessage={isUserMessage}
                  isRoomChat={isRoomChat}
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
      className="flex-1 w-full min-w-0 px-1 sm:px-2 md:px-4 lg:px-6 flex flex-col overflow-hidden relative" 
      data-chat-container
    >
      <List
        ref={listRef}
        height={effectiveHeight}
        width="100%"
        itemCount={messages.length}
        itemSize={itemHeight}
        itemData={itemData}
        overscanCount={5}
        onScroll={handleVirtualizedScroll}
      >
        {MessageItem}
      </List>
      
      {/* Scroll to bottom button for virtualized list */}
      <ScrollToBottomButton
        show={!isAtBottom}
        onClick={() => {
          scrollVirtualizedToBottom(listRef);
          enableVirtualizedAutoScroll();
        }}
        hasNewMessages={!isAutoScrolling}
      />
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default VirtualizedMessageList;