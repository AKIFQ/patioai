import { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import { createClient } from '@/lib/client/client';
import type { Message } from 'ai';

// Create client with proper error handling
const supabase = createClient();

interface RoomSocketHookProps {
  shareCode: string;
  displayName: string;
  sessionId: string; // Authentication token (e.g., auth_userId)
  chatSessionId?: string; // Add chat session filtering
  onNewMessage: (message: Message) => void;
  onTypingUpdate: (users: string[]) => void;
  onParticipantChange?: (participants: any[]) => void;
  // NEW: Streaming handlers (optional - safe if not provided)
  onStreamingMessage?: (message: any) => void;
  streamingHandlers?: {
    onReasoningStart?: (data: any) => void;
    onReasoningChunk?: (data: any) => void;
    onReasoningComplete?: (data: any) => void;
    onAnswerStart?: (data: any) => void;
    onAnswerChunk?: (data: any) => void;
    onStreamComplete?: (data: any) => void;
    onStreamError?: (data: any) => void;
  };
}

export function useRoomSocket({
  shareCode,
  displayName,
  sessionId,
  chatSessionId,
  onNewMessage,
  onTypingUpdate,
  onParticipantChange,
  onStreamingMessage,
  streamingHandlers
}: RoomSocketHookProps) {
  const { socket, isConnected } = useSocket(sessionId); // Use sessionId for authentication
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roomUuidRef = useRef<string | null>(null);
  const hasMessagesRef = useRef(false);

  // Handle new room messages from Socket.IO
  const handleNewRoomMessage = useCallback((data: any) => {
    const newMessage = data.new || data;

    // Filter by thread ID if specified
    if (chatSessionId && newMessage.thread_id !== chatSessionId) {
      return;
    }

    // Track that this thread has messages
    hasMessagesRef.current = true;

    // Convert to Message format with reasoning support
    const message: Message & { senderName?: string; reasoning?: string; sources?: any[] } = {
      id: newMessage.id,
      role: newMessage.is_ai_response ? 'assistant' : 'user',
      content: newMessage.is_ai_response
        ? newMessage.content
        : `${newMessage.sender_name}: ${newMessage.content}`,
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
    const typingUsers = data.users || [];
    const filteredUsers = typingUsers.filter((name: string) => name && name !== displayName);
    onTypingUpdate(filteredUsers);
  }, [displayName, onTypingUpdate]);

  // Handle participant changes from Socket.IO
  const handleParticipantChange = useCallback((data: any) => {
    if (onParticipantChange) {
      onParticipantChange([]);
    }
  }, [onParticipantChange]);

  // Handle room deletion from Socket.IO
  const handleRoomDeleted = useCallback((data: any) => {
    // Redirect user away from deleted room
    if (typeof window !== 'undefined') {
      window.location.href = '/chat';
    }
  }, []);



  // Track current typing state to prevent duplicate broadcasts
  const isTypingRef = useRef(false);

  // Function to broadcast typing status
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!socket || !isConnected || !displayName || !roomUuidRef.current) {
      return;
    }

    // Prevent duplicate broadcasts
    if (isTypingRef.current === isTyping) {
      return;
    }

    isTypingRef.current = isTyping;

    try {
      if (isTyping) {
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        console.log('Broadcasting typing START for:', displayName);
        socket.emit('typing-start', {
          roomId: shareCode,
          displayName,
          timestamp: Date.now()
        });

        // Auto-stop typing after 4 seconds
        typingTimeoutRef.current = setTimeout(() => {
          stopTyping();
        }, 4000);
      } else {
        console.log('Broadcasting typing STOP for:', displayName);
        stopTyping();
      }
    } catch (error) {
      console.error('Error broadcasting typing status:', error);
    }
  }, [socket, isConnected, displayName, shareCode]);

  const stopTyping = useCallback(() => {
    // Only emit if we were actually typing
    if (!isTypingRef.current) {
      return;
    }

    isTypingRef.current = false;

    try {
      if (socket && isConnected) {
        console.log('Emitting typing stop');
        socket.emit('typing-stop', {
          roomId: shareCode,
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
  }, [socket, isConnected, displayName, shareCode]);

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

        // NEW: Set up streaming event listeners (safe - only if handlers provided)
        if (streamingHandlers) {
          if (streamingHandlers.onReasoningStart) {
            socket.on('ai-reasoning-start', streamingHandlers.onReasoningStart);
          }
          if (streamingHandlers.onReasoningChunk) {
            socket.on('ai-reasoning-chunk', streamingHandlers.onReasoningChunk);
          }
          if (streamingHandlers.onReasoningComplete) {
            socket.on('ai-reasoning-complete', streamingHandlers.onReasoningComplete);
          }
          if (streamingHandlers.onAnswerStart) {
            socket.on('ai-answer-start', streamingHandlers.onAnswerStart);
          }
          if (streamingHandlers.onAnswerChunk) {
            socket.on('ai-answer-chunk', streamingHandlers.onAnswerChunk);
          }
          if (streamingHandlers.onStreamComplete) {
            socket.on('ai-stream-complete', streamingHandlers.onStreamComplete);
          }
          if (streamingHandlers.onStreamError) {
            socket.on('ai-stream-error', streamingHandlers.onStreamError);
          }
        }

        // Connection status updates
        socket.on('room-joined', () => {
          console.log('Successfully joined room via Socket.IO');
          setConnectionStatus('SUBSCRIBED');
        });

        socket.on('room-error', (error) => {
          console.warn('Room Socket.IO error (non-critical):', error);
          // Don't set error status for empty errors, just log them
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

      // Clean up empty thread if no messages were sent
      if (!hasMessagesRef.current && chatSessionId) {
        console.log('Cleaning up empty thread on unmount:', chatSessionId);
        fetch('/api/cleanup/empty-threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId: chatSessionId })
        }).catch(error => {
          console.warn('Failed to cleanup empty thread:', error);
        });
      }

      // Clean up socket listeners
      if (socket) {
        console.log('Cleaning up room socket listeners');
        socket.off('room-message-created', handleNewRoomMessage);
        socket.off('user-typing', handleTypingUpdate);
        socket.off('user-joined-room', handleParticipantChange);
        socket.off('user-left-room', handleParticipantChange);
        socket.off('room-deleted', handleRoomDeleted);
        socket.off('room-joined');
        socket.off('room-error');

        // NEW: Clean up streaming listeners (safe - only if they were set up)
        if (streamingHandlers) {
          socket.off('ai-reasoning-start');
          socket.off('ai-reasoning-chunk');
          socket.off('ai-reasoning-complete');
          socket.off('ai-answer-start');
          socket.off('ai-answer-chunk');
          socket.off('ai-stream-complete');
          socket.off('ai-stream-error');
        }

        // Leave the room
        if (shareCode) {
          socket.emit('leave-room', shareCode);
        }
      }

      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [shareCode, displayName, chatSessionId, socket, isConnected, handleNewRoomMessage, handleTypingUpdate, handleParticipantChange]);

  return {
    isConnected,
    connectionStatus,
    broadcastTyping,
    stopTyping
  };
}