import { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import { createClient } from '@/lib/client/client';
import type { Message } from 'ai';

// Create client with proper error handling
const supabase = createClient();

interface RoomSocketHookProps {
  shareCode: string;
  displayName: string;
  chatSessionId?: string; // Add chat session filtering
  onNewMessage: (message: Message) => void;
  onTypingUpdate: (users: string[]) => void;
  onParticipantChange?: (participants: any[]) => void;
  onStreamStart?: (threadId: string) => void;
  onStreamChunk?: (threadId: string, chunk: string) => void;
  onStreamEnd?: (threadId: string, text: string, reasoning?: string) => void;
  // New reasoning events
  onReasoningStart?: (threadId: string) => void;
  onReasoningChunk?: (threadId: string, reasoning: string) => void;
  onReasoningEnd?: (threadId: string, reasoning: string) => void;
  onContentStart?: (threadId: string) => void;
}

export function useRoomSocket({
  shareCode,
  displayName,
  chatSessionId,
  onNewMessage,
  onTypingUpdate,
  onParticipantChange,
  onStreamStart,
  onStreamChunk,
  onStreamEnd,
  onReasoningStart,
  onReasoningChunk,
  onReasoningEnd,
  onContentStart
}: RoomSocketHookProps) {
  const { socket, isConnected } = useSocket(displayName);
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roomUuidRef = useRef<string | null>(null);
  const hasMessagesRef = useRef(false);
  const [isAIStreaming, setIsAIStreaming] = useState(false);

  // Handle new room messages from Socket.IO
  const handleNewRoomMessage = useCallback((data: any) => {
    console.log('RAW SOCKET ROOM MESSAGE:', data);
    const newMessage = data.new || data;

    console.log('ROOM MSG received:', {
      sender: newMessage.sender_name,
      isAI: newMessage.is_ai_response,
      content: newMessage.content?.substring(0, 50) + '...',
      roomId: newMessage.room_id,
      threadId: newMessage.thread_id,
      currentUser: displayName,
      currentThread: chatSessionId
    });

    // Filter by thread ID if specified
    if (chatSessionId && newMessage.thread_id !== chatSessionId) {
      console.log('SKIPPING: Message from different thread');
      return;
    }

    // Track that this thread has messages
    hasMessagesRef.current = true;

    console.log('PROCESSING SOCKET MSG from:', newMessage.sender_name, 'for user:', displayName);

    // Convert to Message format with reasoning support
    const message: Message & { senderName?: string; reasoning?: string; sources?: any[] } = {
      id: newMessage.id || `msg-${Date.now()}`,
      role: newMessage.is_ai_response ? 'assistant' : 'user',
      content: newMessage.is_ai_response
        ? newMessage.content
        : newMessage.content, // Don't prefix with sender name - use senderName field instead
      createdAt: new Date(newMessage.created_at),
      // Preserve sender information for proper message alignment
      ...(newMessage.sender_name && { senderName: newMessage.sender_name }),
      // Include reasoning and sources for AI messages
      ...(newMessage.is_ai_response && newMessage.reasoning && { reasoning: newMessage.reasoning }),
      ...(newMessage.is_ai_response && newMessage.sources && {
        sources: typeof newMessage.sources === 'string'
          ? JSON.parse(newMessage.sources)
          : newMessage.sources
      })
    };

    onNewMessage(message);
  }, [displayName, chatSessionId, onNewMessage]);

  // Handle typing updates from Socket.IO
  const handleTypingUpdate = useCallback((data: any) => {
    console.log('Typing update received:', data);
    const typingUsers = data.users || [];
    const filteredUsers = typingUsers.filter((name: string) => name && name !== displayName);
    console.log('Typing users updated:', filteredUsers);
    onTypingUpdate(filteredUsers);
  }, [displayName, onTypingUpdate]);

  // Handle participant changes from Socket.IO
  const handleParticipantChange = useCallback((data: any) => {
    console.log('Participant change:', data);
    if (onParticipantChange) {
      onParticipantChange([]);
    }
  }, [onParticipantChange]);

  // Handle room deletion from Socket.IO
  const handleRoomDeleted = useCallback((data: any) => {
    console.log('Room deleted:', data);
    // Redirect user away from deleted room
    if (typeof window !== 'undefined') {
      window.location.href = '/chat';
    }
  }, []);

  // Function to broadcast typing status
  const broadcastTyping = useCallback((isTyping: boolean) => {
    console.log('broadcastTyping called:', isTyping, 'displayName:', displayName);

    if (!socket || !isConnected || !displayName || !roomUuidRef.current) {
      console.log('No socket connection or missing data, skipping broadcast');
      return;
    }

    try {
      if (isTyping) {
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        console.log('Broadcasting typing START for:', displayName);
        socket.emit('typing-start', {
          roomId: shareCode, // Use share code instead of room UUID
          displayName,
          timestamp: Date.now()
        });

        // Auto-stop typing after 3 seconds
        typingTimeoutRef.current = setTimeout(() => {
          console.log('Auto-stopping typing for:', displayName);
          stopTyping();
        }, 3000);
      } else {
        console.log('Broadcasting typing STOP for:', displayName);
        stopTyping();
      }
    } catch (error) {
      console.error('Error broadcasting typing status:', error);
    }
  }, [socket, isConnected, displayName]);

  const stopTyping = useCallback(() => {
    console.log('stopTyping called');
    try {
      if (socket && isConnected) {
        console.log('Emitting typing stop');
        socket.emit('typing-stop', {
          roomId: shareCode, // Use share code instead of room UUID
          displayName
        });
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping typing:', error);
    }
  }, [socket, isConnected, displayName]);

  useEffect(() => {
    if (!shareCode || !displayName || !socket || !isConnected) {
      setConnectionStatus('DISCONNECTED');
      return;
    }

    let mounted = true;
    hasMessagesRef.current = false;

    const initializeRoomSocket = async () => {
      try {
        // Get the room UUID from share code
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select('id')
          .eq('share_code', shareCode)
          .single();

        if (roomError || !room) {
          console.error('Room not found for share code:', shareCode, roomError);
          setConnectionStatus('ERROR');
          return;
        }

        if (!mounted) return;

        roomUuidRef.current = room.id;
        console.log('Setting up room socket for room:', room.id);

        // Join the room
        socket.emit('join-room', shareCode);

        // Set up event listeners
        socket.on('room-message-created', handleNewRoomMessage);
        socket.on('user-typing', handleTypingUpdate);
        socket.on('user-joined-room', handleParticipantChange);
        socket.on('user-left-room', handleParticipantChange);
        socket.on('room-deleted', handleRoomDeleted);

        // Streaming listeners
        socket.on('ai-stream-start', (payload: { threadId: string; timestamp?: number }) => {
          const { threadId } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          setIsAIStreaming(true);
          onStreamStart?.(threadId);
        });
        
        // Reasoning events
        socket.on('ai-reasoning-start', (payload: { threadId: string; timestamp?: number }) => {
          const { threadId } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onReasoningStart?.(threadId);
        });
        socket.on('ai-reasoning-chunk', (payload: { threadId: string; reasoning: string; timestamp?: number }) => {
          const { threadId, reasoning } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onReasoningChunk?.(threadId, reasoning);
        });
        socket.on('ai-reasoning-end', (payload: { threadId: string; reasoning: string; timestamp?: number }) => {
          const { threadId, reasoning } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onReasoningEnd?.(threadId, reasoning);
        });
        
        // Content events
        socket.on('ai-content-start', (payload: { threadId: string; timestamp?: number }) => {
          const { threadId } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onContentStart?.(threadId);
        });
        socket.on('ai-stream-chunk', (payload: { threadId: string; chunk: string; timestamp?: number }) => {
          const { threadId, chunk } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onStreamChunk?.(threadId, chunk);
        });
        socket.on('ai-stream-end', (payload: { threadId: string; text: string; reasoning?: string; timestamp?: number }) => {
          const { threadId, text, reasoning } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          setIsAIStreaming(false);
          onStreamEnd?.(threadId, text, reasoning);
        });

        // Connection status updates
        socket.on('room-joined', () => {
          console.log('Successfully joined room via Socket.IO');
          setConnectionStatus('SUBSCRIBED');
        });

        socket.on('room-error', (error: any) => {
          console.warn('Room Socket.IO error (non-critical):', error);
          if (error && Object.keys(error).length > 0) {
            setConnectionStatus('CHANNEL_ERROR');
          }
        });

        setConnectionStatus('SUBSCRIBED');

      } catch (error) {
        console.error('Error initializing room socket:', error);
        setConnectionStatus('ERROR');
      }
    };

    initializeRoomSocket();

    return () => {
      mounted = false;

      // Clean up empty thread if no messages were sent (disable during active sessions to reduce churn)
      // if (!hasMessagesRef.current && chatSessionId) {
      //   fetch('/api/cleanup/empty-threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: chatSessionId }) }).catch(() => {});
      // }

      // Clean up socket listeners
      if (socket) {
        console.log('Cleaning up room socket listeners');
        socket.off('room-message-created', handleNewRoomMessage);
        socket.off('user-typing', handleTypingUpdate);
        socket.off('user-joined-room', handleParticipantChange);
        socket.off('user-left-room', handleParticipantChange);
        socket.off('room-deleted', handleRoomDeleted);
        socket.off('ai-stream-start');
        socket.off('ai-reasoning-start');
        socket.off('ai-reasoning-chunk');
        socket.off('ai-reasoning-end');
        socket.off('ai-content-start');
        socket.off('ai-stream-chunk');
        socket.off('ai-stream-end');
        socket.off('room-joined');
        socket.off('room-error');

        if (shareCode) {
          socket.emit('leave-room', shareCode);
        }
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [shareCode, displayName, chatSessionId, socket, isConnected, handleNewRoomMessage, handleTypingUpdate, handleParticipantChange, onStreamStart, onStreamChunk, onStreamEnd]);

  const invokeAI = useCallback((payload: {
    shareCode: string;
    threadId: string;
    prompt: string;
    roomName: string;
    participants: string[];
    modelId?: string;
    chatHistory?: Array<{role: 'user' | 'assistant', content: string}>;
  }) => {
    if (socket && isConnected) {
      socket.emit('invoke-ai', payload);
    }
  }, [socket, isConnected]);

  return {
    isConnected,
    connectionStatus,
    broadcastTyping,
    stopTyping,
    invokeAI,
    isAIStreaming
  };
}