'use client';

import { useState, useEffect, useRef } from 'react';
import { type Message } from '@ai-sdk/react';

interface ReasoningStreamState {
  streamingMessageId: string | null;
  streamingReasoning: string;
  isReasoningComplete: boolean;
}

export const useReasoningStream = (messages: Message[], status: string) => {
  const [reasoningState, setReasoningState] = useState<ReasoningStreamState>({
    streamingMessageId: null,
    streamingReasoning: '',
    isReasoningComplete: false
  });

  const lastMessageRef = useRef<Message | null>(null);
  const reasoningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reasoningCacheRef = useRef<Map<string, string>>(new Map()); // Cache extracted reasoning

  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    // Only process assistant messages
    if (lastMessage.role !== 'assistant') return;

    // Check if this is a new message or an update to existing message
    const isNewMessage = !lastMessageRef.current || lastMessageRef.current.id !== lastMessage.id;
    const isStreaming = status === 'streaming';

    if (isNewMessage && isStreaming) {
      // New assistant message started streaming
      setReasoningState({
        streamingMessageId: lastMessage.id,
        streamingReasoning: '',
        isReasoningComplete: false
      });
    }

    // Prefer extracting reasoning from structured parts when available (AI SDK reasoning SSE)
    const parts = (lastMessage as any).parts as any[] | undefined;
    if (parts && parts.length > 0 && reasoningState.streamingMessageId === lastMessage.id) {
      const reasoningPart = parts.find((p) => p.type === 'reasoning');
      if (reasoningPart) {
        // reasoningPart may contain a plain string or details with segments
        let extracted = '';
        if (typeof (reasoningPart as any).reasoning === 'string') {
          extracted = (reasoningPart as any).reasoning;
        } else if (Array.isArray((reasoningPart as any).details)) {
          extracted = (reasoningPart as any).details
            .map((d: any) => (d.type === 'text' ? d.text : ''))
            .filter(Boolean)
            .join('\n');
        }
        if (extracted && extracted !== reasoningState.streamingReasoning) {
          setReasoningState((prev) => ({ ...prev, streamingReasoning: extracted }));
        }
      }
    }

    // Optimized reasoning extraction with caching
    const messageContent = lastMessage.content || '';
    const contentHash = `${lastMessage.id}_${messageContent.length}`;
    
    if (reasoningState.streamingMessageId === lastMessage.id && messageContent.length > 0) {
      // Check cache first
      let reasoning = reasoningCacheRef.current.get(contentHash);
      
      if (reasoning === undefined) {
        // Extract reasoning only if not cached
        reasoning = '';
        
        // Optimized marker detection - check most common first
        if (messageContent.includes('<thinking>')) {
          const startIdx = messageContent.indexOf('<thinking>');
          const endIdx = messageContent.indexOf('</thinking>', startIdx);
          if (startIdx !== -1 && endIdx !== -1) {
            reasoning = messageContent.slice(startIdx + 10, endIdx).trim();
          }
        } else if (messageContent.includes('**Reasoning:**')) {
          const startIdx = messageContent.indexOf('**Reasoning:**') + 14;
          const endIdx = messageContent.indexOf('\n\n', startIdx);
          reasoning = messageContent.slice(startIdx, endIdx === -1 ? undefined : endIdx).trim();
        } else if (messageContent.includes('**Thinking:**')) {
          const startIdx = messageContent.indexOf('**Thinking:**') + 13;
          const endIdx = messageContent.indexOf('\n\n', startIdx);
          reasoning = messageContent.slice(startIdx, endIdx === -1 ? undefined : endIdx).trim();
        }
        
        // Cache the result
        reasoningCacheRef.current.set(contentHash, reasoning);
        
        // Limit cache size
        if (reasoningCacheRef.current.size > 50) {
          const firstKey = reasoningCacheRef.current.keys().next().value;
          reasoningCacheRef.current.delete(firstKey);
        }
      }

      if (reasoning && reasoning !== reasoningState.streamingReasoning) {
        setReasoningState((prev) => ({ ...prev, streamingReasoning: reasoning }));
      }
    }

    // Handle completion when streaming stops for this message
    if (!isStreaming && reasoningState.streamingMessageId === lastMessage.id) {
      // Clear any pending timeout
      if (reasoningTimeoutRef.current) {
        clearTimeout(reasoningTimeoutRef.current);
      }

      // Mark as complete shortly after streaming ends for smoother UI
      reasoningTimeoutRef.current = setTimeout(() => {
        setReasoningState((prev) => ({ ...prev, isReasoningComplete: true }));

        // Retain the reasoning briefly, then clear state to avoid sticking to next turns
        setTimeout(() => {
          setReasoningState({
            streamingMessageId: null,
            streamingReasoning: '',
            isReasoningComplete: false
          });
        }, 2000);
      }, 300);
    }

    lastMessageRef.current = lastMessage;
  }, [messages, status, reasoningState.streamingMessageId, reasoningState.streamingReasoning]);

  // Cleanup timeout and cache on unmount
  useEffect(() => {
    return () => {
      if (reasoningTimeoutRef.current) {
        clearTimeout(reasoningTimeoutRef.current);
      }
      reasoningCacheRef.current.clear();
    };
  }, []);

  return reasoningState;
};