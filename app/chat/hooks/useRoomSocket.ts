import { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import { createClient } from '@/lib/client/client';
import { MessageQueue } from '@/lib/client/messageQueue';
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
  // Cross-thread activity
  onCrossThreadActivity?: (activities: {
    threadId: string;
    threadName: string;
    activeUsers: string[];
    typingUsers: string[];
  }[]) => void;
  // Error handling callbacks
  onAIError?: (error: AIErrorPayload) => void;
  onRoomLimitReached?: (limitType: 'messages' | 'ai_responses' | 'threads', details: RoomLimitDetails) => void;
}

interface AIErrorPayload {
  threadId?: string;
  error: string;
  details?: string;
  timestamp?: number;
  roomLimitExceeded?: boolean;
  limitType?: 'room' | 'user';
  currentUsage?: number;
  limit?: number;
  resetTime?: Date;
}

interface RoomLimitDetails {
  currentUsage: number;
  limit: number;
  resetTime?: Date;
  reason?: string;
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
  onContentStart,
  onCrossThreadActivity,
  onAIError,
  onRoomLimitReached
}: RoomSocketHookProps) {
  const { socket, isConnected } = useSocket(displayName);
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roomUuidRef = useRef<string | null>(null);
  const hasMessagesRef = useRef(false);
  const [isAIStreaming, setIsAIStreaming] = useState(false);
  const isTypingActiveRef = useRef(false);
  const messageQueueRef = useRef<MessageQueue | null>(null);

  // Use refs to stabilize callback dependencies and prevent socket re-initialization
  const callbacksRef = useRef({
    onNewMessage,
    onTypingUpdate,
    onParticipantChange,
    onStreamStart,
    onStreamChunk,
    onStreamEnd,
    onReasoningStart,
    onReasoningChunk,
    onReasoningEnd,
    onContentStart,
    onCrossThreadActivity,
    onAIError,
    onRoomLimitReached
  });

  // Update refs when callbacks change (without triggering useEffect)
  useEffect(() => {
    callbacksRef.current = {
      onNewMessage,
      onTypingUpdate,
      onParticipantChange,
      onStreamStart,
      onStreamChunk,
      onStreamEnd,
      onReasoningStart,
      onReasoningChunk,
      onReasoningEnd,
      onContentStart,
      onCrossThreadActivity,
      onAIError,
      onRoomLimitReached
    };
  });

  // Handle new room messages from Socket.IO
  const handleNewRoomMessage = useCallback((data: any) => {
    if (process.env.NODE_ENV === 'development') console.debug('RAW SOCKET ROOM MESSAGE:', data);
    const newMessage = data.new || data;
    if (process.env.NODE_ENV === 'development') {
      console.debug('ROOM MSG received:', {
        sender: newMessage.sender_name,
        isAI: newMessage.is_ai_response,
        content: newMessage.content?.substring(0, 50) + '...',
        roomId: newMessage.room_id,
        threadId: newMessage.thread_id,
        currentUser: displayName,
        currentThread: chatSessionId
      });
    }

    // Filter by thread ID if specified
    if (chatSessionId && newMessage.thread_id !== chatSessionId) {
      if (process.env.NODE_ENV === 'development') console.debug('SKIPPING: Message from different thread');
      return;
    }

    // Track that this thread has messages
    hasMessagesRef.current = true;
    if (process.env.NODE_ENV === 'development') console.debug('PROCESSING SOCKET MSG from:', newMessage.sender_name, 'for user:', displayName);

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

    callbacksRef.current.onNewMessage(message);
  }, [displayName, chatSessionId]);

  // Handle typing updates from Socket.IO - only for SAME thread
  const handleTypingUpdate = useCallback((data: any) => {
    if (process.env.NODE_ENV === 'development') console.debug('Typing update received:', data);
    
    // Only show typing if it's from the SAME thread
    if (data.threadId && chatSessionId && data.threadId !== chatSessionId) {
      if (process.env.NODE_ENV === 'development') console.debug('Ignoring typing from different thread:', data.threadId, 'vs', chatSessionId);
      callbacksRef.current.onTypingUpdate([]); // Clear typing indicators for different threads
      return;
    }
    
    const typingUsers = data.users || [];
    const filteredUsers = typingUsers.filter((name: string) => name && name !== displayName);
    if (process.env.NODE_ENV === 'development') console.debug('Typing users updated for same thread:', filteredUsers);
    callbacksRef.current.onTypingUpdate(filteredUsers);
  }, [displayName, chatSessionId]);

  // Handle participant changes from Socket.IO
  const handleParticipantChange = useCallback((data: any) => {
    // Participant change
    if (callbacksRef.current.onParticipantChange) {
      callbacksRef.current.onParticipantChange([]);
    }
  }, []);

  // Handle room deletion from Socket.IO
  const handleRoomDeleted = useCallback((data: any) => {
    // Room deleted
    // Redirect user away from deleted room
    if (typeof window !== 'undefined') {
      window.location.href = '/chat';
    }
  }, []);

  // Initialize message queue when socket is available
  useEffect(() => {
    if (socket && !messageQueueRef.current) {
      messageQueueRef.current = new MessageQueue(socket, {
        maxRetries: 3,
        retryDelay: 1000,
        queueSize: 50
      });
// Message queue initialized
    }
  }, [socket]);

  // Function to broadcast typing status with queue reliability
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (process.env.NODE_ENV === 'development') console.debug('broadcastTyping called:', isTyping, 'displayName:', displayName);

    if (!socket || !isConnected || !displayName || !roomUuidRef.current) {
      if (process.env.NODE_ENV === 'development') console.debug('No socket connection or missing data, skipping broadcast');
      return;
    }

    // Do not broadcast when tab is hidden (visibility-safe typing)
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    try {
      if (isTyping) {
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Only emit start if not already active
        if (!isTypingActiveRef.current) {
          if (process.env.NODE_ENV === 'development') console.debug('Broadcasting typing START for:', displayName);
          
          // Use message queue for reliability
          if (messageQueueRef.current) {
            messageQueueRef.current.enqueue('typing-start', {
              roomId: shareCode,
              displayName,
              threadId: chatSessionId,
              timestamp: Date.now()
            }, 'high');
          } else {
            // Fallback to direct emit
            socket.emit('typing-start', {
              roomId: shareCode,
              displayName,
              threadId: chatSessionId,
              timestamp: Date.now()
            });
          }
          
          isTypingActiveRef.current = true;
        }

        // Auto-stop typing after 3 seconds
        typingTimeoutRef.current = setTimeout(() => {
          if (process.env.NODE_ENV === 'development') console.debug('Auto-stopping typing for:', displayName);
          stopTyping();
        }, 3000);
      } else {
        if (process.env.NODE_ENV === 'development') console.debug('Broadcasting typing STOP for:', displayName);
        stopTyping();
      }
    } catch (error) {
      console.error('Error broadcasting typing status:', error);
    }
  }, [socket, isConnected, displayName]);

  const stopTyping = useCallback(() => {
    if (process.env.NODE_ENV === 'development') console.debug('stopTyping called');
    try {
      if (socket && isConnected && isTypingActiveRef.current) {
        if (process.env.NODE_ENV === 'development') console.debug('Emitting typing stop');
        
        // Use message queue for reliability
        if (messageQueueRef.current) {
          messageQueueRef.current.enqueue('typing-stop', {
            roomId: shareCode,
            displayName,
            threadId: chatSessionId
          }, 'high');
        } else {
          // Fallback to direct emit
          socket.emit('typing-stop', {
            roomId: shareCode,
            displayName,
            threadId: chatSessionId
          });
        }
        
        isTypingActiveRef.current = false;
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
    let cleanupExecuted = false;
    hasMessagesRef.current = false;
    
    // Track all event listeners for proper cleanup
    const eventListeners = new Map<string, (...args: any[]) => void>();
    
    // Define reconnection handler for cleanup access
    let handleConnect: (() => void) | null = null;

    // Pause typing timers when tab hidden (visibility-safe typing)
    const handleVisibility = () => {
      if (document.hidden) {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        isTypingActiveRef.current = false;
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

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
        if (process.env.NODE_ENV === 'development') console.debug('Setting up room socket for room:', room.id);

        // Re-join the room after reconnects
        handleConnect = () => {
          socket.emit('join-room', shareCode);
          // Re-emit thread switch on reconnect
          if (chatSessionId) {
            socket.emit('switch-thread', {
              roomId: shareCode,
              threadId: chatSessionId,
              displayName
            });
          }
        };
        
        // Join the room initially
        handleConnect();
        
        // Set up reconnection handlers
        socket.on('connect', handleConnect);
        socket.on('reconnect', handleConnect as any);

        // Set up event listeners with tracking
        const addTrackedListener = (event: string, handler: (...args: any[]) => void) => {
          socket.on(event, handler);
          eventListeners.set(event, handler);
        };

        addTrackedListener('room-message-created', handleNewRoomMessage);
        addTrackedListener('user-typing', handleTypingUpdate);
        addTrackedListener('user-joined-room', handleParticipantChange);
        addTrackedListener('user-left-room', handleParticipantChange);
        addTrackedListener('user-removed-from-room', (data: any) => {
          console.log('User removed from room:', data);
          // Update participant list if provided
          if (callbacksRef.current.onParticipantChange && data.updatedParticipants) {
            callbacksRef.current.onParticipantChange?.(data.updatedParticipants);
          }
          // If current user was removed, redirect them (but only if they were actively in the room)
          if (data.removedUser?.displayName === displayName) {
            // Check if this is due to room expiration vs actual removal
            const isExpiredRoom = data.reason?.includes('expired') || 
                                data.details?.includes('expired') ||
                                !hasMessagesRef.current; // If no messages were loaded, user wasn't really "in" the room
            
            if (isExpiredRoom) {
              console.log('Room expired or user was not actively in room - no redirect needed');
              return;
            }
            
            console.log('Current user was actively removed from room, redirecting...');
            if (typeof window !== 'undefined') {
              window.location.href = `/room/${shareCode}/removed?roomName=${encodeURIComponent(data.roomName || 'Unknown Room')}`;
            }
          }
        });
        addTrackedListener('room-deleted', handleRoomDeleted);

        // Streaming listeners with tracking
        const aiStreamStartHandler = (payload: { threadId?: string; timestamp?: number; modelId?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
          setIsAIStreaming(true);
if (process.env.NODE_ENV === 'development') console.info(' ai-stream-start', payload);
          callbacksRef.current.onStreamStart?.(threadId);
        };
        addTrackedListener('ai-stream-start', aiStreamStartHandler);
        
        // Reasoning events
        const aiReasoningStartHandler = (payload: { threadId?: string; timestamp?: number; modelUsed?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
if (process.env.NODE_ENV === 'development') console.info(' reasoning-start model:', payload?.modelUsed);
          onReasoningStart?.(threadId);
        };
        const aiReasoningChunkHandler = (payload: { threadId?: string; reasoning: string; timestamp?: number; modelUsed?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          const { reasoning } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onReasoningChunk?.(threadId, reasoning);
        };
        const aiReasoningEndHandler = (payload: { threadId?: string; reasoning: string; timestamp?: number; modelUsed?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          const { reasoning } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          onReasoningEnd?.(threadId, reasoning);
        };
        
        addTrackedListener('ai-reasoning-start', aiReasoningStartHandler);
        addTrackedListener('ai-reasoning-chunk', aiReasoningChunkHandler);
        
        // Cross-thread activity listener
        const crossThreadActivityHandler = (payload: { 
          roomId: string; 
          activities: {
            threadId: string;
            threadName: string;
            activeUsers: string[];
            typingUsers: string[];
          }[];
          timestamp: string;
        }) => {
          // Only process cross-thread activity for the current room
          if (payload.roomId !== shareCode) {
            if (process.env.NODE_ENV === 'development') console.debug('Ignoring cross-thread activity from different room:', payload.roomId, 'current:', shareCode);
            return;
          }
          if (process.env.NODE_ENV === 'development') console.debug('Cross-thread activity:', payload);
          onCrossThreadActivity?.(payload.activities);
        };
        addTrackedListener('cross-thread-activity', crossThreadActivityHandler);
        addTrackedListener('ai-reasoning-end', aiReasoningEndHandler);
        
        // Content events with tracking
        const aiContentStartHandler = (payload: { threadId?: string; timestamp?: number; modelUsed?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
if (process.env.NODE_ENV === 'development') console.info(' model used:', payload?.modelUsed);
          onContentStart?.(threadId);
        };
        const aiStreamChunkHandler = (payload: { threadId?: string; chunk: string; timestamp?: number; modelUsed?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          const { chunk } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          callbacksRef.current.onStreamChunk?.(threadId, chunk);
        };
        const aiStreamEndHandler = (payload: { threadId?: string; text: string; reasoning?: string; timestamp?: number; modelUsed?: string; usage?: any }) => {
          const threadId = payload.threadId || chatSessionId || '';
          const { text, reasoning } = payload;
          if (chatSessionId && threadId !== chatSessionId) return;
          setIsAIStreaming(false);
if (process.env.NODE_ENV === 'development') console.info(' ai-stream-end', { model: payload?.modelUsed, usage: payload?.usage });
          callbacksRef.current.onStreamEnd?.(threadId, text, reasoning);
        };
        
        addTrackedListener('ai-content-start', aiContentStartHandler);
        addTrackedListener('ai-stream-chunk', aiStreamChunkHandler);
        addTrackedListener('ai-stream-end', aiStreamEndHandler);
        
        // AI Error handling - crucial for fixing stuck "thinking" state
        const aiErrorHandler = (payload: AIErrorPayload) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
          
console.error('🔥 AI Error received:', payload);
          setIsAIStreaming(false); // Stop the thinking state
          
          // Call the error callback if provided
          if (callbacksRef.current.onAIError) {
            callbacksRef.current.onAIError(payload);
          }
          
          // Handle room limit reached specifically
          if (payload.roomLimitExceeded && callbacksRef.current.onRoomLimitReached) {
            const limitType = payload.error.includes('reasoning') ? 'ai_responses' : 'ai_responses';
            callbacksRef.current.onRoomLimitReached(limitType, {
              currentUsage: payload.currentUsage || 0,
              limit: payload.limit || 0,
              resetTime: payload.resetTime,
              reason: payload.error
            });
          }
        };
        addTrackedListener('ai-error', aiErrorHandler);

        // AI Stop handlers
        const aiStoppedHandler = (payload: { threadId?: string; success?: boolean }) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
          
          setIsAIStreaming(false);
          if (process.env.NODE_ENV === 'development') console.info('AI response stopped successfully');
        };
        addTrackedListener('ai-stopped', aiStoppedHandler);

        const aiStreamStoppedHandler = (payload: { threadId?: string; timestamp?: number; reason?: string }) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
          
          setIsAIStreaming(false);
          if (process.env.NODE_ENV === 'development') console.info('AI stream stopped:', payload.reason);
        };
        addTrackedListener('ai-stream-stopped', aiStreamStoppedHandler);

        // AI Fallback notification - inform user when switching models
        const aiFallbackHandler = (payload: { threadId?: string; primaryModel: string; fallbackModel: string; reason: string; timestamp?: number }) => {
          const threadId = payload.threadId || chatSessionId || '';
          if (chatSessionId && threadId !== chatSessionId) return;
          
console.log(` AI Fallback: ${payload.primaryModel} → ${payload.fallbackModel} (${payload.reason})`);
          
          // You can add UI notification here if needed
          // For example: show a toast saying "Switched to backup model due to rate limits"
        };
        addTrackedListener('ai-fallback-used', aiFallbackHandler);

        // Connection status updates with tracking
        const roomJoinedHandler = () => {
          if (process.env.NODE_ENV === 'development') console.info('Successfully joined room via Socket.IO');
          setConnectionStatus('SUBSCRIBED');
        };
        const roomErrorHandler = (error: any) => {
          console.warn('Room Socket.IO error:', error);
          
          // Handle removal from room
          if (error.error === 'REMOVED_FROM_ROOM') {
            console.log('User was removed from room via Socket.IO, redirecting...');
            if (typeof window !== 'undefined') {
              window.location.href = `/room/${shareCode}/removed?roomName=${encodeURIComponent(error.roomName || 'Unknown Room')}`;
            }
            return;
          }
          
          if (error && Object.keys(error).length > 0) {
            setConnectionStatus('CHANNEL_ERROR');
          }
        };
        
        addTrackedListener('room-joined', roomJoinedHandler);
        addTrackedListener('room-error', roomErrorHandler);

        setConnectionStatus('SUBSCRIBED');

      } catch (error) {
        console.error('Error initializing room socket:', error);
        setConnectionStatus('ERROR');
      }
    };

    initializeRoomSocket();

    return () => {
      mounted = false;
      
      // Prevent double cleanup
      if (cleanupExecuted) {
console.log(' Cleanup already executed, skipping');
        return;
      }
      cleanupExecuted = true;

      // Starting room socket cleanup

      // Clean up empty thread if no messages were sent (disable during active sessions to reduce churn)
      // if (!hasMessagesRef.current && chatSessionId) {
      //   fetch('/api/cleanup/empty-threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: chatSessionId }) }).catch(() => {});
      // }

      // Clean up socket listeners using tracked listeners
      if (socket) {
        // Removing tracked socket listeners
        
        // Remove all tracked listeners with their specific handlers
        for (const [event, handler] of eventListeners.entries()) {
          try {
            socket.off(event, handler);
// Removed listener
          } catch (error) {
console.warn(` Failed to remove listener ${event}:`, error);
          }
        }
        
        // Clear the tracking map
        eventListeners.clear();

        // Clean up reconnection handlers
        if (handleConnect) {
          socket.off('connect', handleConnect);
          socket.off('reconnect', handleConnect as any);
        }

        // Leave room (use message queue if available)
        if (shareCode) {
          if (messageQueueRef.current) {
            messageQueueRef.current.enqueue('leave-room', shareCode, 'high');
          } else {
            socket.emit('leave-room', shareCode);
          }
        }
      }

      // Clean up timers
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Clean up message queue
      if (messageQueueRef.current) {
        messageQueueRef.current.clear();
        messageQueueRef.current = null;
      }

      // Clean up visibility handler
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      
// Room socket cleanup completed
    };
  }, [shareCode, displayName, chatSessionId, socket, isConnected, handleNewRoomMessage, handleTypingUpdate, handleParticipantChange]);

  const invokeAI = useCallback((payload: {
    shareCode: string;
    threadId: string;
    prompt: string;
    roomName: string;
    participants: string[];
    modelId?: string;
    chatHistory?: {role: 'user' | 'assistant', content: string}[];
    reasoningMode?: boolean;
  }) => {
    if (socket && isConnected) {
      // Use message queue for critical AI invocation
      if (messageQueueRef.current) {
        // Queueing AI invocation
        messageQueueRef.current.enqueue('invoke-ai', payload, 'high');
      } else {
        // Fallback to direct emit
        // Direct AI invocation
        socket.emit('invoke-ai', payload);
      }
    } else {
console.warn(' Cannot invoke AI: socket not connected');
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