import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message } from '@ai-sdk/react';

interface StreamingMessage extends Message {
  streamId: string;
  isStreaming: boolean;
  chunkCount: number;
  reasoning?: string;
  sources?: any[];
}

interface StreamingHandlers {
  onStreamStart: (data: StreamStartData) => void;
  onStreamChunk: (data: StreamChunkData) => void;
  onStreamComplete: (data: StreamCompleteData) => void;
  onStreamError: (data: StreamErrorData) => void;
}

interface StreamStartData {
  streamId: string;
  threadId: string;
  senderName: string;
  timestamp: number;
}

interface StreamChunkData {
  streamId: string;
  threadId: string;
  chunk: string;
  accumulatedText: string;
  chunkIndex: number;
  timestamp: number;
}

interface StreamCompleteData {
  streamId: string;
  threadId: string;
  finalText: string;
  reasoning?: string;
  sources?: any[];
  duration: number;
  chunkCount: number;
  timestamp: number;
}

interface StreamErrorData {
  streamId: string;
  threadId: string;
  error: string;
  timestamp: number;
}

export function useStreamingMessage(threadId?: string) {
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const streamTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      streamTimeouts.current.forEach(timeout => clearTimeout(timeout));
      streamTimeouts.current.clear();
    };
  }, []);

  const handleStreamStart = useCallback((data: StreamStartData) => {
    // Filter by thread if specified
    if (threadId && data.threadId !== threadId) {
      return;
    }

    console.log('🚀 Stream started:', data.streamId);

    const streamingMessage: StreamingMessage = {
      id: data.streamId,
      role: 'assistant',
      content: '',
      createdAt: new Date(data.timestamp),
      streamId: data.streamId,
      isStreaming: true,
      chunkCount: 0,
      senderName: data.senderName
    };

    setStreamingMessages(prev => new Map(prev.set(data.streamId, streamingMessage)));
    setIsStreamingActive(true);

    // Set a safety timeout to clean up stuck streams
    const timeout = setTimeout(() => {
      console.warn('⏰ Stream timeout, cleaning up:', data.streamId);
      handleStreamError({
        streamId: data.streamId,
        threadId: data.threadId,
        error: 'Stream timeout',
        timestamp: Date.now()
      });
    }, 35000); // 35 seconds

    streamTimeouts.current.set(data.streamId, timeout);

  }, [threadId]);

  const handleStreamChunk = useCallback((data: StreamChunkData) => {
    // Filter by thread if specified
    if (threadId && data.threadId !== threadId) {
      return;
    }

    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) {
        console.warn('⚠️ Received chunk for unknown stream:', data.streamId);
        return prev;
      }

      const updated: StreamingMessage = {
        ...existing,
        content: data.accumulatedText,
        chunkCount: data.chunkIndex
      };

      return new Map(prev.set(data.streamId, updated));
    });

  }, [threadId]);

  const handleStreamComplete = useCallback((data: StreamCompleteData) => {
    // Filter by thread if specified
    if (threadId && data.threadId !== threadId) {
      return;
    }

    console.log('✅ Stream completed:', data.streamId, `(${data.chunkCount} chunks, ${data.duration}ms)`);

    // Clear timeout
    const timeout = streamTimeouts.current.get(data.streamId);
    if (timeout) {
      clearTimeout(timeout);
      streamTimeouts.current.delete(data.streamId);
    }

    // Update the streaming message with final content
    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) {
        console.warn('⚠️ Received completion for unknown stream:', data.streamId);
        return prev;
      }

      const completed: StreamingMessage = {
        ...existing,
        content: data.finalText,
        isStreaming: false,
        reasoning: data.reasoning,
        sources: data.sources,
        chunkCount: data.chunkCount
      };

      const newMap = new Map(prev.set(data.streamId, completed));
      
      // Check if any streams are still active
      const hasActiveStreams = Array.from(newMap.values()).some(msg => msg.isStreaming);
      setIsStreamingActive(hasActiveStreams);

      return newMap;
    });

    // Remove the streaming message after a delay to allow the regular message to appear
    setTimeout(() => {
      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.streamId);
        return newMap;
      });
    }, 1000);

  }, [threadId]);

  const handleStreamError = useCallback((data: StreamErrorData) => {
    // Filter by thread if specified
    if (threadId && data.threadId !== threadId) {
      return;
    }

    console.error('❌ Stream error:', data.streamId, data.error);

    // Clear timeout
    const timeout = streamTimeouts.current.get(data.streamId);
    if (timeout) {
      clearTimeout(timeout);
      streamTimeouts.current.delete(data.streamId);
    }

    // Remove the streaming message
    setStreamingMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(data.streamId);
      
      // Check if any streams are still active
      const hasActiveStreams = Array.from(newMap.values()).some(msg => msg.isStreaming);
      setIsStreamingActive(hasActiveStreams);
      
      return newMap;
    });

  }, [threadId]);

  // Get all streaming messages as an array
  const streamingMessagesArray = Array.from(streamingMessages.values());

  // Get handlers object
  const handlers: StreamingHandlers = {
    onStreamStart: handleStreamStart,
    onStreamChunk: handleStreamChunk,
    onStreamComplete: handleStreamComplete,
    onStreamError: handleStreamError
  };

  return {
    streamingMessages: streamingMessagesArray,
    isStreamingActive,
    handlers,
    activeStreamCount: streamingMessages.size
  };
}