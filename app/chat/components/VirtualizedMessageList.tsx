'use client';

import React, { memo, useMemo, useRef, useEffect } from 'react';
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
  
  // For non-virtualized lists (< 20 messages)
  const { scrollRef, isAtBottom: nonVirtualizedAtBottom, isAutoScrolling: nonVirtualizedAutoScrolling, scrollToBottom, enableAutoScroll: enableNonVirtualizedAutoScroll } = useAutoScroll({
    threshold: 100,
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
    threshold: 2,
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
      updateDimensions(messages.length, height, itemHeight);
    }
  }, [messages.length, height, itemHeight, isVirtualized, updateDimensions]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && isAutoScrolling) {
      if (isVirtualized && listRef.current) {
        // For virtualized list, scroll to last item
        scrollVirtualizedToBottom(listRef);
      } else {
        // For non-virtualized list, use smooth scroll
        scrollToBottom();
      }
    }
  }, [messages.length, isAutoScrolling, isVirtualized, scrollVirtualizedToBottom, scrollToBottom]);

  const itemData = useMemo(() => ({
    messages,
    currentUserDisplayName,
    isRoomChat
  }), [messages, currentUserDisplayName, isRoomChat]);

  // Don't virtualize if there are few messages
  if (messages.length < 20) {
    return (
      <div 
        ref={scrollRef}
        className="w-full mx-auto max-w-[1000px] px-0 md:px-1 lg:px-4 py-4 overflow-y-auto"
        style={{ height }}
        data-chat-container
      >
        <ul>
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
    <div className="w-full mx-auto max-w-[1000px] px-0 md:px-1 lg:px-4 py-4 relative" data-chat-container>
      <List
        ref={listRef}
        height={height}
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