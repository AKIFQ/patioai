import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message } from '@ai-sdk/react';

interface StreamingMessage extends Message {
  streamId: string;
  phase: 'reasoning' | 'answering' | 'complete';
  reasoningContent: string;
  answerContent: string;
  isStreaming: boolean;
}

interface StreamingHandlers {
  onReasoningStart: (data: any) => void;
  onReasoningChunk: (data: any) => void;
  onReasoningComplete: (data: any) => void;
  onAnswerStart: (data: any) => void;
  onAnswerChunk: (data: any) => void;
  onStreamComplete: (data: any) => void;
  onStreamError: (data: any) => void;
}

/**
 * Safe Streaming Hook - Adds streaming without breaking existing system
 * 
 * Key Safety Features:
 * - Does not interfere with existing message handling
 * - Streaming messages are separate from regular messages
 * - Easy to disable or remove
 * - Graceful fallback to regular messages
 */
export function useSafeStreaming(threadId?: string) {
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const streamTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Feature flag - can be disabled
  const STREAMING_ENABLED = process.env.NODE_ENV === 'development'; // Only in dev for now

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamTimeouts.current.forEach(timeout => clearTimeout(timeout));
      streamTimeouts.current.clear();
    };
  }, []);

  /**
   * Handle reasoning start
   * SAFE: Creates new streaming message without affecting existing ones
   */
  const handleReasoningStart = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;
    if (threadId && data.threadId !== threadId) return;

    console.log('🧠 Reasoning started:', data.streamId);

    const streamingMessage: StreamingMessage = {
      id: data.streamId,
      role: 'assistant',
      content: '', // Will be built from reasoning + answer
      createdAt: new Date(data.timestamp),
      streamId: data.streamId,
      phase: 'reasoning',
      reasoningContent: '',
      answerContent: '',
      isStreaming: true,
      senderName: 'AI Assistant'
    };

    setStreamingMessages(prev => new Map(prev.set(data.streamId, streamingMessage)));
    setIsStreamingActive(true);

    // Safety timeout
    const timeout = setTimeout(() => {
      console.warn('⏰ Reasoning timeout:', data.streamId);
      handleStreamError({ streamId: data.streamId, error: 'Timeout' });
    }, 30000);

    streamTimeouts.current.set(data.streamId, timeout);

  }, [threadId, STREAMING_ENABLED]);

  /**
   * Handle reasoning chunk
   * SAFE: Only updates streaming message, doesn't affect regular messages
   */
  const handleReasoningChunk = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;
    if (threadId && data.threadId !== threadId) return;

    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing || existing.phase !== 'reasoning') {
        return prev;
      }

      const updated: StreamingMessage = {
        ...existing,
        reasoningContent: data.accumulatedReasoning,
        // Content is just reasoning during this phase
        content: `**Reasoning:**\n${data.accumulatedReasoning}`
      };

      return new Map(prev.set(data.streamId, updated));
    });

  }, [threadId, STREAMING_ENABLED]);

  /**
   * Handle reasoning complete and transition to answer
   * SAFE: Just updates phase, doesn't break anything
   */
  const handleReasoningComplete = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;
    if (threadId && data.threadId !== threadId) return;

    console.log('🧠 Reasoning complete, transitioning to answer:', data.streamId);

    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) return prev;

      const updated: StreamingMessage = {
        ...existing,
        phase: 'answering',
        reasoningContent: data.finalReasoning
      };

      return new Map(prev.set(data.streamId, updated));
    });

  }, [threadId, STREAMING_ENABLED]);

  /**
   * Handle answer start
   * SAFE: Just updates phase
   */
  const handleAnswerStart = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;
    if (threadId && data.threadId !== threadId) return;

    console.log('💬 Answer started:', data.streamId);

  }, [threadId, STREAMING_ENABLED]);

  /**
   * Handle answer chunk
   * SAFE: Updates streaming message content
   */
  const handleAnswerChunk = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;
    if (threadId && data.threadId !== threadId) return;

    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing || existing.phase !== 'answering') {
        return prev;
      }

      const updated: StreamingMessage = {
        ...existing,
        answerContent: data.accumulatedAnswer,
        // Content is answer only during this phase (reasoning is separate)
        content: data.accumulatedAnswer
      };

      return new Map(prev.set(data.streamId, updated));
    });

  }, [threadId, STREAMING_ENABLED]);

  /**
   * Handle stream complete
   * SAFE: Cleanup streaming message, regular message will appear from DB
   */
  const handleStreamComplete = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;
    if (threadId && data.threadId !== threadId) return;

    console.log('✅ Stream complete:', data.streamId);

    // Clear timeout
    const timeout = streamTimeouts.current.get(data.streamId);
    if (timeout) {
      clearTimeout(timeout);
      streamTimeouts.current.delete(data.streamId);
    }

    // Mark as complete but keep for a moment
    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) return prev;

      const completed: StreamingMessage = {
        ...existing,
        phase: 'complete',
        isStreaming: false
      };

      return new Map(prev.set(data.streamId, completed));
    });

    // Remove streaming message after delay (regular message will replace it)
    setTimeout(() => {
      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.streamId);
        
        // Update streaming active state
        const hasActiveStreams = Array.from(newMap.values()).some(msg => msg.isStreaming);
        setIsStreamingActive(hasActiveStreams);
        
        return newMap;
      });
    }, 1000);

  }, [threadId, STREAMING_ENABLED]);

  /**
   * Handle stream error
   * SAFE: Just cleanup, doesn't affect regular messages
   */
  const handleStreamError = useCallback((data: any) => {
    if (!STREAMING_ENABLED) return;

    console.error('❌ Stream error:', data.streamId, data.error);

    // Clear timeout
    const timeout = streamTimeouts.current.get(data.streamId);
    if (timeout) {
      clearTimeout(timeout);
      streamTimeouts.current.delete(data.streamId);
    }

    // Remove streaming message
    setStreamingMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(data.streamId);
      
      const hasActiveStreams = Array.from(newMap.values()).some(msg => msg.isStreaming);
      setIsStreamingActive(hasActiveStreams);
      
      return newMap;
    });

  }, [STREAMING_ENABLED]);

  // Get streaming messages as array
  const streamingMessagesArray = Array.from(streamingMessages.values());

  // Create handlers object
  const handlers: StreamingHandlers = {
    onReasoningStart: handleReasoningStart,
    onReasoningChunk: handleReasoningChunk,
    onReasoningComplete: handleReasoningComplete,
    onAnswerStart: handleAnswerStart,
    onAnswerChunk: handleAnswerChunk,
    onStreamComplete: handleStreamComplete,
    onStreamError: handleStreamError
  };

  return {
    streamingMessages: streamingMessagesArray,
    isStreamingActive,
    handlers,
    enabled: STREAMING_ENABLED,
    activeStreamCount: streamingMessages.size
  };
}