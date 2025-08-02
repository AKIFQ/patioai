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
}

export function useRoomSocket({
  shareCode,
  displayName,
  chatSessionId,
  onNewMessage,
  onTypingUpdate,
  onParticipantChange
}: RoomSocketHookProps) {
  const { socket, isConnected } = useSocket(displayName);
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roomUuidRef = useRef<string | null>(null);
  const hasMessagesRef = useRef(false);

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

    // Convert to Message format (same as Supabase realtime)
    const message: Message = {
      id: newMessage.id,
      role: newMessage.is_ai_response ? 'assistant' : 'user',
      content: newMessage.is_ai_response
        ? newMessage.content
        : `${newMessage.sender_name}: ${newMessage.content}`,
      createdAt: new Date(newMessage.created_at)
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

        // Connection status updates
        socket.on('room-joined', () => {
          console.log('Successfully joined room via Socket.IO');
          setConnectionStatus('SUBSCRIBED');
        });

        socket.on('room-error', (error) => {
          console.error('Room Socket.IO error:', error);
          setConnectionStatus('CHANNEL_ERROR');
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