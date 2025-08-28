'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { type Message } from '@ai-sdk/react';
import { fetchRoomMessagesPaginated, type PaginatedMessages } from '../room/[shareCode]/fetch';

interface UseChatPaginationProps {
  shareCode?: string;
  chatSessionId?: string;
  isRoomChat: boolean;
  initialMessages?: Message[];
  pageSize?: number;
}

interface ChatPaginationState {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  totalDisplayed: number;
}

export function useChatPagination({
  shareCode,
  chatSessionId,
  isRoomChat,
  initialMessages = [],
  pageSize = 50
}: UseChatPaginationProps): ChatPaginationState {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false); // Default to false - only true if we actually have more to load
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Initialize cursor from initial messages and determine if there are more messages
  useEffect(() => {
    if (initialMessages.length > 0 && !cursor) {
      // Get the oldest message's timestamp as cursor for loading even older messages
      const oldestMessage = initialMessages[0];
      if (oldestMessage?.createdAt) {
        setCursor(oldestMessage.createdAt.toISOString());
      }
      // Assume there might be more messages only if we have a full page of messages
      // This prevents showing "Load more" when there are only a few messages
      setHasMore(initialMessages.length >= pageSize);
    } else if (initialMessages.length === 0) {
      // No messages means no more to load
      setHasMore(false);
    }
  }, [initialMessages, cursor, pageSize]);

  // Deduplicate messages by ID to handle real-time updates
  const deduplicatedMessages = useMemo(() => {
    const messageMap = new Map<string, Message>();
    
    // Add all messages to map, with later ones overwriting earlier duplicates
    [...messages].forEach(msg => {
      if (msg.id) {
        messageMap.set(msg.id, msg);
      }
    });
    
    // Return as array sorted by creation date
    return Array.from(messageMap.values()).sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });
  }, [messages]);

  const loadMore = useCallback(async () => {
    if (!isRoomChat || !shareCode || isLoading || !hasMore) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result: PaginatedMessages = await fetchRoomMessagesPaginated(
        shareCode,
        chatSessionId,
        cursor,
        pageSize
      );

      if (result.messages.length > 0) {
        // Prepend older messages to the beginning of the list
        setMessages(prevMessages => {
          const combined = [...result.messages, ...prevMessages];
          // Deduplicate in case of overlap
          const messageMap = new Map<string, Message>();
          combined.forEach(msg => {
            if (msg.id) {
              messageMap.set(msg.id, msg);
            }
          });
          return Array.from(messageMap.values()).sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeA - timeB;
          });
        });

        // Update cursor to the oldest loaded message
        if (result.nextCursor) {
          setCursor(result.nextCursor);
        }
      }

      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Error loading more messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [isRoomChat, shareCode, chatSessionId, cursor, isLoading, hasMore, pageSize]);

  const refresh = useCallback(async () => {
    if (!isRoomChat || !shareCode) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setCursor(undefined);

    try {
      // Load the latest messages (no cursor = get most recent)
      const result: PaginatedMessages = await fetchRoomMessagesPaginated(
        shareCode,
        chatSessionId,
        undefined, // No cursor = get latest messages
        pageSize
      );

      setMessages(result.messages);
      setHasMore(result.hasMore);
      
      if (result.messages.length > 0 && result.hasMore) {
        // Set cursor to the oldest message in this batch
        const oldestMessage = result.messages[0];
        if (oldestMessage?.createdAt) {
          setCursor(oldestMessage.createdAt.toISOString());
        }
      }
    } catch (err) {
      console.error('Error refreshing messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh messages');
    } finally {
      setIsLoading(false);
    }
  }, [isRoomChat, shareCode, chatSessionId, pageSize]);

  // Update messages when initialMessages change (for real-time updates)
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(prevMessages => {
        // Merge with existing messages, with initial messages taking precedence for updates
        const messageMap = new Map<string, Message>();
        
        // Add existing messages first
        prevMessages.forEach(msg => {
          if (msg.id) {
            messageMap.set(msg.id, msg);
          }
        });
        
        // Add/update with initial messages
        initialMessages.forEach(msg => {
          if (msg.id) {
            messageMap.set(msg.id, msg);
          }
        });
        
        return Array.from(messageMap.values()).sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });
      });
    }
  }, [initialMessages]);

  return {
    messages: deduplicatedMessages,
    isLoading,
    hasMore,
    error,
    loadMore,
    refresh,
    totalDisplayed: deduplicatedMessages.length
  };
}

// Hook for regular chat messages (non-room)
export function useRegularChatPagination({
  chatSessionId,
  initialMessages = [],
  pageSize = 50
}: {
  chatSessionId?: string;
  initialMessages?: Message[];
  pageSize?: number;
}) {
  // For now, regular chat messages don't support pagination
  // This can be implemented later with a similar pattern
  const [messages] = useState<Message[]>(initialMessages);
  
  return {
    messages,
    isLoading: false,
    hasMore: false,
    error: null,
    loadMore: async () => {},
    refresh: async () => {},
    totalDisplayed: messages.length
  };
}