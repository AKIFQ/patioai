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

  // Optimized deduplication with memoized comparison
  const deduplicatedMessages = useMemo(() => {
    if (messages.length === 0) return [];
    
    // Fast path: if messages are already unique by ID (common case), skip expensive operations
    const uniqueIds = new Set<string>();
    let hasDuplicates = false;
    
    for (const msg of messages) {
      if (msg.id) {
        if (uniqueIds.has(msg.id)) {
          hasDuplicates = true;
          break;
        }
        uniqueIds.add(msg.id);
      }
    }
    
    if (!hasDuplicates) {
      // Already unique, just sort if needed
      return messages.slice().sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });
    }
    
    // Slow path: deduplicate and sort
    const messageMap = new Map<string, Message>();
    messages.forEach(msg => {
      if (msg.id) {
        messageMap.set(msg.id, msg);
      }
    });
    
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
        // Optimized prepend with minimal operations
        setMessages(prevMessages => {
          if (prevMessages.length === 0) {
            return result.messages;
          }
          
          // Create Set of existing message IDs for O(1) lookup
          const existingIds = new Set(prevMessages.map(m => m.id).filter(Boolean));
          
          // Filter out duplicates from new messages
          const newUniqueMessages = result.messages.filter(msg => 
            msg.id && !existingIds.has(msg.id)
          );
          
          if (newUniqueMessages.length === 0) {
            return prevMessages; // No new messages to add
          }
          
          // Prepend and sort only if needed
          const combined = [...newUniqueMessages, ...prevMessages];
          return combined.sort((a, b) => {
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

  // Optimized real-time message updates
  useEffect(() => {
    if (initialMessages.length === 0) return;
    
    setMessages(prevMessages => {
      if (prevMessages.length === 0) {
        return initialMessages; // First load, no merging needed
      }
      
      // Check if we need to merge at all
      const prevIds = new Set(prevMessages.map(m => m.id).filter(Boolean));
      const hasNewMessages = initialMessages.some(msg => msg.id && !prevIds.has(msg.id));
      
      if (!hasNewMessages) {
        // Only updates to existing messages, merge efficiently
        const updatedMessages = [...prevMessages];
        const updateMap = new Map(initialMessages.map(msg => [msg.id, msg]));
        
        for (let i = 0; i < updatedMessages.length; i++) {
          const existing = updatedMessages[i];
          const update = updateMap.get(existing.id);
          if (update) {
            updatedMessages[i] = update;
          }
        }
        return updatedMessages;
      }
      
      // Full merge needed for new messages
      const messageMap = new Map<string, Message>();
      prevMessages.forEach(msg => msg.id && messageMap.set(msg.id, msg));
      initialMessages.forEach(msg => msg.id && messageMap.set(msg.id, msg));
      
      return Array.from(messageMap.values()).sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });
    });
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