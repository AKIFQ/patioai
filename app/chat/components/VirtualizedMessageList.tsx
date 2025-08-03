'use client';

import React, { memo, useMemo, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { type Message } from '@ai-sdk/react';
import ChatMessage from './ChatMessage';
import AILoadingMessage from './AILoadingMessage';

interface VirtualizedMessageListProps {
  messages: Message[];
  height: number;
  itemHeight?: number;
  currentUserDisplayName?: string; // For room chats to identify current user's messages
  showLoading?: boolean; // Show AI loading indicator
}

interface MessageItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    messages: Message[];
    currentUserDisplayName?: string;
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
  showLoading = false
}: VirtualizedMessageListProps) => {
  const listRef = useRef<List>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);

  const itemData = useMemo(() => ({
    messages,
    currentUserDisplayName
  }), [messages, currentUserDisplayName]);

  // Don't virtualize if there are few messages
  if (messages.length < 20) {
    return (
      <div className="w-full mx-auto max-w-[1000px] px-0 md:px-1 lg:px-4 py-4">
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
              />
            );
          })}
          {showLoading && <AILoadingMessage />}
        </ul>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto max-w-[1000px] px-0 md:px-1 lg:px-4 py-4">
      <List
        ref={listRef}
        height={height}
        width="100%"
        itemCount={messages.length}
        itemSize={itemHeight}
        itemData={itemData}
        overscanCount={5}
      >
        {MessageItem}
      </List>
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default VirtualizedMessageList;