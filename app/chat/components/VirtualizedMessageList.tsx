'use client';

import React, { memo, useMemo, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { type Message } from '@ai-sdk/react';
import ChatMessage from './ChatMessage';

interface VirtualizedMessageListProps {
  messages: Message[];
  height: number;
  itemHeight?: number;
}

interface MessageItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    messages: Message[];
  };
}

const MessageItem = memo(({ index, style, data }: MessageItemProps) => {
  const message = data.messages[index];
  const isUserMessage = message.role === 'user';

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
  itemHeight = 150 
}: VirtualizedMessageListProps) => {
  const listRef = useRef<List>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);

  const itemData = useMemo(() => ({
    messages
  }), [messages]);

  // Don't virtualize if there are few messages
  if (messages.length < 20) {
    return (
      <div className="w-full mx-auto max-w-[1000px] px-0 md:px-1 lg:px-4 py-4">
        <ul>
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              index={index}
              isUserMessage={message.role === 'user'}
            />
          ))}
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