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
    const parts = (lastMessage as any).parts as Array<any> | undefined;
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

    // Fallback: extract reasoning markers from content for providers that inline thoughts
    const messageContent = lastMessage.content || '';
    const hasReasoningMarkers =
      messageContent.includes('<thinking>') ||
      messageContent.includes('**Reasoning:**') ||
      messageContent.includes('**Thinking:**');

    if (hasReasoningMarkers && reasoningState.streamingMessageId === lastMessage.id) {
      let reasoning = '';
      if (messageContent.includes('<thinking>')) {
        const thinkingMatch = messageContent.match(/<thinking>(.*?)<\/thinking>/s);
        reasoning = thinkingMatch ? thinkingMatch[1].trim() : '';
      } else if (messageContent.includes('**Reasoning:**')) {
        const reasoningMatch = messageContent.split('**Reasoning:**')[1];
        reasoning = reasoningMatch ? reasoningMatch.split('\n\n')[0].trim() : '';
      } else if (messageContent.includes('**Thinking:**')) {
        const thinkingMatch = messageContent.split('**Thinking:**')[1];
        reasoning = thinkingMatch ? thinkingMatch.split('\n\n')[0].trim() : '';
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (reasoningTimeoutRef.current) {
        clearTimeout(reasoningTimeoutRef.current);
      }
    };
  }, []);

  return reasoningState;
};