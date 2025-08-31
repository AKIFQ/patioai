import { useEffect, useCallback, useRef, useState } from 'react';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client/client';

const supabase = createClient();

interface SidebarSocketProps {
  userId: string;
  userRooms: { shareCode: string; name: string; expiresAt?: string }[];
  onThreadCreated?: (threadData: any) => void;
}

export function useSidebarSocket({ userId, userRooms, onThreadCreated }: SidebarSocketProps) {
  const seenThreadsRef = useRef<Set<string>>(new Set());

  const sidebarSocketRef = useRef<any>(null);
  const [socketReady, setSocketReady] = useState(false);



  // Initialize socket in a separate useEffect
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initSocket = async () => {
      // First try to use the global room socket if available
      const globalSocket = (window as any).__patio_socket;
      if (globalSocket) {
        console.log('🔌 Using existing global socket for sidebar');
        sidebarSocketRef.current = globalSocket;
        setSocketReady(true);
        return;
      }

      // Wait a bit and try again for global socket (it might be initializing)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryGlobalSocket = (window as any).__patio_socket;
      if (retryGlobalSocket) {
        console.log('🔌 Using global socket for sidebar (retry)');
        sidebarSocketRef.current = retryGlobalSocket;
        setSocketReady(true);
        return;
      }

      // If we already have a sidebar socket, use it
      if (sidebarSocketRef.current && sidebarSocketRef.current.connected) {
        console.log('🔌 Using existing sidebar socket');
        setSocketReady(true);
        return;
      }

      // Create a dedicated sidebar socket as fallback
      try {
        console.log('🔌 Creating dedicated sidebar socket...');
        const socketIO = await import('socket.io-client');

        // Use the displayName as the token for authentication (same as room socket pattern)
        const urlParams = new URLSearchParams(window.location.search);
        const displayName = urlParams.get('displayName');
        const socketToken = displayName || userId;

        const socket = socketIO.default(window.location.origin, {
          auth: { token: socketToken },
          transports: ['polling', 'websocket'], // Prioritize polling for Railway
          timeout: 45000,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 10000
        });

        socket.on('connect', () => {
          console.log('✅ Sidebar socket connected successfully');
          setSocketReady(true);
        });

        socket.on('connect_error', (error: any) => {
          console.error('❌ Sidebar socket connection error:', error);
          setSocketReady(false);
        });

        socket.on('disconnect', (reason: any) => {
          console.log('🔌 Sidebar socket disconnected:', reason);
          setSocketReady(false);
        });

        sidebarSocketRef.current = socket;
      } catch (error) {
        console.error('❌ Failed to create sidebar socket:', error);
        setSocketReady(false);
      }
    };

    initSocket();

    return () => {
      // Cleanup dedicated socket if we created one
      if (sidebarSocketRef.current && sidebarSocketRef.current !== (window as any).__patio_socket) {
        sidebarSocketRef.current.disconnect();
      }
      sidebarSocketRef.current = null;
      setSocketReady(false);
    };
  }, [userId]);

  const handleNewRoomMessage = useCallback(async (data: any) => {
    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    // Only handle user messages (not AI responses) to detect new threads
    if (newMessage.is_ai_response) {
      return;
    }

    // CRITICAL: Verify room isolation - only process messages from rooms the user has access to
    if (!newMessage.room_id) {
      return;
    }

    // Get room info first to verify access
    let roomData = null;
    try {
      if (supabase) {
        const { data } = await supabase
          .from('rooms')
          .select('share_code, name')
          .eq('id', newMessage.room_id)
          .single();
        roomData = data;
      }
    } catch (error) {
      // Silent fail - room data fetch is not critical
      return;
    }

    if (!roomData) {
      return;
    }

    // CRITICAL: Verify user has access to this room
    const userHasAccess = userRooms.some(room => room.shareCode === roomData.share_code);
    if (!userHasAccess) {
      return;
    }

    const threadId = newMessage.thread_id;

    // Check if this is a new thread we haven't seen before
    if (!seenThreadsRef.current.has(threadId)) {
      // Mark this thread as seen
      seenThreadsRef.current.add(threadId);

      const threadData = {
        threadId,
        roomId: newMessage.room_id,
        shareCode: roomData.share_code,
        roomName: roomData.name,
        senderName: newMessage.sender_name,
        firstMessage: newMessage.content,
        createdAt: newMessage.created_at
      };

      // CRITICAL: Refresh sidebar data for new thread
      try {
        // Use multiple strategies to ensure sidebar refresh
        await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
        await mutate('chatPreviews');
        await mutate('roomChats');
      } catch (error) {
        // Silent fail - sidebar refresh is not critical
      }

      // Also trigger a broader refresh to ensure all sidebar data is updated
      try {
        await mutate((key) => typeof key === 'string' && key.includes('chat'));
      } catch (error) {
        // Silent fail
      }

      // Dispatch custom event to trigger room chat data refresh
      window.dispatchEvent(new CustomEvent('roomThreadCreated', {
        detail: threadData
      }));

      // Call custom handler if provided
      if (onThreadCreated) {
        onThreadCreated(threadData);
      }
    }
  }, [onThreadCreated, userRooms]);

  const handleNewChatMessage = useCallback(async (data: any) => {
    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    // Only handle user messages (not AI responses) to detect new chats
    if (!newMessage.is_user_message) {
      return;
    }

    // Use SWR mutate to update only the sidebar data
    try {
      await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    } catch (error) {
      // Silent fail
    }

    // Call custom handler if provided
    if (onThreadCreated) {
      onThreadCreated({
        threadId: newMessage.chat_session_id,
        type: 'regular',
        firstMessage: newMessage.content,
        createdAt: newMessage.created_at
      });
    }
  }, [onThreadCreated]);

  const handleSidebarRefreshRequested = useCallback(() => {
    mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
  }, []);

  const triggerSidebarRefresh = useCallback(() => {
    const socket = sidebarSocketRef.current;
    if (socket) {
      socket.emit('request-sidebar-refresh');
    }
    // Always trigger SWR mutate as well for immediate updates
    mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    mutate('chatPreviews');
    mutate('roomChats');
  }, []);

  useEffect(() => {
    // Only run when socket is ready
    if (!socketReady || !sidebarSocketRef.current || !userId) {
      return;
    }

    const socket = sidebarSocketRef.current;

    // Reset seen threads when rooms change
    seenThreadsRef.current.clear();

    // Define handlers that can be properly cleaned up
    const handleThreadCreated = (data: any) => {
      // CRITICAL: Verify room isolation - only process events from rooms the user has access to
      if (!data.shareCode) {
        return;
      }

      const userHasAccess = userRooms.some(room => room.shareCode === data.shareCode);
      if (!userHasAccess) {
        return;
      }

      // Mark thread as seen to prevent duplicate processing
      seenThreadsRef.current.add(data.threadId);

      // Force immediate sidebar refresh for new threads
      mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      mutate('chatPreviews');
      mutate('roomChats');

      // Dispatch custom event to trigger room chat data refresh
      window.dispatchEvent(new CustomEvent('roomThreadCreated', {
        detail: data
      }));

      if (onThreadCreated) {
        onThreadCreated(data);
      }
    };

    const handleRoomMessageCreated = (data: any) => {
      handleNewRoomMessage(data);
    };

    const handleChatMessageCreated = (data: any) => {
      handleNewChatMessage(data);
    };

    const handleSidebarRefreshRequestedEvent = (data: any) => {
      handleSidebarRefreshRequested();
    };

    // Set up event listeners
    socket.on('room-message-created', handleRoomMessageCreated);
    socket.on('chat-message-created', handleChatMessageCreated);
    socket.on('sidebar-refresh-requested', handleSidebarRefreshRequestedEvent);
    socket.on('thread-created', handleThreadCreated);

    // Join user's personal channel for direct notifications
    socket.emit('join-user-channel');

    // Test socket connection
    socket.emit('ping', { message: 'sidebar-socket-test', timestamp: Date.now() });

    // Listen for pong response
    const handlePong = () => {
      // Connection confirmed
    };
    socket.on('pong', handlePong);

    // Listen for user channel join confirmation
    const handleUserChannelJoined = () => {
      // Channel joined successfully
    };
    socket.on('user-channel-joined', handleUserChannelJoined);

    // Pre-populate seen threads to avoid false positives

    const populateSeenThreads = async () => {
      try {
        if (supabase && userRooms && userRooms.length > 0) {
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id, share_code')
            .in('share_code', userRooms.map(r => r.shareCode));

          if (rooms && rooms.length > 0) {
            const roomIds = rooms.map(r => r.id);

            const { data: existingMessages } = await supabase
              .from('room_messages')
              .select('thread_id, room_id')
              .in('room_id', roomIds)
              .not('thread_id', 'is', null);

            if (existingMessages) {
              existingMessages.forEach(msg => {
                const roomData = rooms.find(r => r.id === msg.room_id);
                if (roomData && userRooms.some(ur => ur.shareCode === roomData.share_code)) {
                  if (msg.thread_id) {
                    seenThreadsRef.current.add(msg.thread_id);
                  }
                }
              });
            }
          }
        }
      } catch (error) {
        // Silent fail - not critical
      }
    };

    populateSeenThreads();

    // Listen for manual thread refresh events
    const handleForceThreadRefresh = (event: CustomEvent) => {
      const threadData = event.detail;

      if (threadData.threadId) {
        seenThreadsRef.current.add(threadData.threadId);
      }

      mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      mutate('chatPreviews');

      if (onThreadCreated) {
        onThreadCreated(threadData);
      }
    };

    window.addEventListener('forceThreadRefresh', handleForceThreadRefresh as EventListener);

    return () => {
      if (socket) {
        socket.off('room-message-created', handleRoomMessageCreated);
        socket.off('chat-message-created', handleChatMessageCreated);
        socket.off('sidebar-refresh-requested', handleSidebarRefreshRequestedEvent);
        socket.off('thread-created', handleThreadCreated);
        socket.off('pong', handlePong);
        socket.off('user-channel-joined', handleUserChannelJoined);
      }

      window.removeEventListener('forceThreadRefresh', handleForceThreadRefresh as EventListener);
      seenThreadsRef.current.clear();
    };
  }, [socketReady, userId, userRooms, handleNewRoomMessage, handleNewChatMessage, handleSidebarRefreshRequested]);

  // Fallback polling mechanism when socket is not available
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    if (!socketReady && userRooms && userRooms.length > 0) {
      const pollInterval = setInterval(() => {
        // Trigger SWR revalidation to check for new threads
        mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
        mutate('chatPreviews');
        mutate('roomChats');
      }, 15000); // Poll every 15 seconds when no socket

      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [socketReady, userRooms]);

  return {
    triggerSidebarRefresh,
    isConnected: socketReady && sidebarSocketRef.current && sidebarSocketRef.current.connected
  };
}