'use client';

import React, { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import ChatMessage from './ChatMessage';
import AILoadingMessage from './AILoadingMessage';
import ScrollToBottomButton from './ScrollToBottomButton';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useVirtualizedAutoScroll } from '../hooks/useVirtualizedAutoScroll';
import { scrollVirtualizedToBottom } from '../utils/dynamicImports';
import { useIsMobile } from '@/hooks/use-mobile';
import { RefreshCw } from 'lucide-react';

export interface EnhancedMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  senderName?: string;
  isOptimistic?: boolean;
}

interface VirtualizedMessageListProps {
  messages: EnhancedMessage[];
  height: number;
  itemHeight?: number;
  currentUserDisplayName?: string;
  showLoading?: boolean;
  isRoomChat?: boolean;
  onRefresh?: () => Promise<void>;
}

interface MessageItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    messages: EnhancedMessage[];
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

// Pull to refresh hook for mobile
const usePullToRefresh = (onRefresh?: () => Promise<void>) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const isMobile = useIsMobile();
  
  const maxPullDistance = 80;
  const triggerDistance = 60;
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !onRefresh) return;
    const scrollElement = e.currentTarget as HTMLElement;
    if (scrollElement.scrollTop <= 0) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  }, [isMobile, onRefresh]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    if (deltaY > 0) {
      e.preventDefault();
      const distance = Math.min(deltaY * 0.5, maxPullDistance);
      setPullDistance(distance);
    }
  }, [isPulling, isRefreshing, startY, maxPullDistance]);
  
  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    
    setIsPulling(false);
    
    if (pullDistance >= triggerDistance && onRefresh && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 500);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, triggerDistance, onRefresh, isRefreshing]);
  
  return {
    pullDistance,
    isRefreshing,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    shouldShowIndicator: pullDistance > 0 || isRefreshing
  };
};

const VirtualizedMessageList = memo(({ 
  messages, 
  height, 
  itemHeight = 80,
  currentUserDisplayName,
  showLoading = false,
  isRoomChat = false,
  onRefresh
}: VirtualizedMessageListProps) => {
  const pullToRefresh = usePullToRefresh(onRefresh);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [actualHeight, setActualHeight] = useState(0);

  // Auto-scroll hook for non-virtualized list (fewer messages)
  const { isAtBottom, enableAutoScroll } = useAutoScroll({
    scrollRef,
    threshold: 15, // Increased buffer for more comfortable spacing
    enabled: messages.length < 20
  });

  // Auto-scroll hook for virtualized list
  const { 
    isAtBottom: isVirtualizedAtBottom, 
    enableAutoScroll: enableVirtualizedAutoScroll 
  } = useVirtualizedAutoScroll({
    threshold: 0.5, // Ensure complete messages are visible
    enabled: messages.length >= 20
  });

  // Measure container height when height is 0 (flexible layout)
  useEffect(() => {
    if (height > 0) {
      setActualHeight(height);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setActualHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [height]);

  const effectiveHeight = height > 0 ? height : actualHeight;

  // Auto-scroll logic with delays to ensure content is rendered
  useEffect(() => {
    if (messages.length < 20) {
      // Non-virtualized auto-scroll
      setTimeout(() => {
        if (scrollRef.current && (isAtBottom || messages.length === 1)) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 150); // Increased delay for better reliability
      
      // Additional scroll for new content
      setTimeout(() => {
        if (scrollRef.current && (isAtBottom || messages.length === 1)) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    } else {
      // Virtualized auto-scroll
      setTimeout(() => {
        if (listRef.current && (isVirtualizedAtBottom || messages.length === 1)) {
          listRef.current.scrollToItem(messages.length - 1, 'start');
        }
      }, 150); // Increased delay for better reliability
    }
  }, [messages, isAtBottom, isVirtualizedAtBottom]);

  const enableNonVirtualizedAutoScroll = useCallback(() => {
    enableAutoScroll();
  }, [enableAutoScroll]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

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
        {/* Pull to refresh indicator for non-virtualized */}
        {pullToRefresh.shouldShowIndicator && (
          <div 
            className="flex items-center justify-center py-2 transition-all duration-200"
            style={{
              transform: `translateY(${pullToRefresh.pullDistance - 40}px)`,
              opacity: pullToRefresh.pullDistance / 60
            }}
          >
            <RefreshCw 
              className={`h-5 w-5 text-muted-foreground ${pullToRefresh.isRefreshing ? 'animate-spin' : ''}`}
              style={{
                transform: `rotate(${pullToRefresh.pullDistance * 4}deg)`
              }}
            />
          </div>
        )}
        
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ height: height > 0 ? `${height}px` : '100%' }}
          onTouchStart={pullToRefresh.handleTouchStart}
          onTouchMove={pullToRefresh.handleTouchMove}
          onTouchEnd={pullToRefresh.handleTouchEnd}
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
          hasNewMessages={!isAtBottom}
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
      {/* Pull to refresh indicator for virtualized */}
      {pullToRefresh.shouldShowIndicator && (
        <div 
          className="absolute top-0 left-1/2 transform -translate-x-1/2 flex items-center justify-center py-2 transition-all duration-200 z-10"
          style={{
            transform: `translate(-50%, ${pullToRefresh.pullDistance - 40}px)`,
            opacity: pullToRefresh.pullDistance / 60
          }}
        >
          <RefreshCw 
            className={`h-5 w-5 text-muted-foreground ${pullToRefresh.isRefreshing ? 'animate-spin' : ''}`}
            style={{
              transform: `rotate(${pullToRefresh.pullDistance * 4}deg)`
            }}
          />
        </div>
      )}
      
      <List
        ref={listRef}
        height={effectiveHeight}
        width="100%"
        itemCount={messages.length}
        itemSize={itemHeight}
        itemData={itemData}
        overscanCount={5}
        onScroll={handleVirtualizedScroll}
        onTouchStart={pullToRefresh.handleTouchStart}
        onTouchMove={pullToRefresh.handleTouchMove}
        onTouchEnd={pullToRefresh.handleTouchEnd}
      >
        {MessageItem}
      </List>
      
      {/* Scroll to bottom button for virtualized list */}
      <ScrollToBottomButton
        show={!isVirtualizedAtBottom}
        onClick={() => {
          scrollVirtualizedToBottom(listRef);
          enableVirtualizedAutoScroll();
        }}
        hasNewMessages={!isVirtualizedAtBottom}
      />
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default VirtualizedMessageList;