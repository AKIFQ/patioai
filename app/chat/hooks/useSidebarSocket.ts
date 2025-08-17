import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client/client';

const supabase = createClient();

interface SidebarSocketProps {
  userId: string;
  userRooms: { shareCode: string; name: string }[];
  onThreadCreated?: (threadData: any) => void;
}

export function useSidebarSocket({ userId, userRooms, onThreadCreated }: SidebarSocketProps) {
  const { socket, isConnected } = useSocket(userId);
  const seenThreadsRef = useRef<Set<string>>(new Set());
  const router = useRouter();

  const handleNewRoomMessage = useCallback(async (data: any) => {
// Debug logging removed for production

    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    // Only handle user messages (not AI responses) to detect new threads
    if (newMessage.is_ai_response) {
// Skipping AI message
      return;
    }

    // CRITICAL: Verify room isolation - only process messages from rooms the user has access to
    if (!newMessage.room_id) {
console.warn(' SIDEBAR: Message missing room_id, skipping for security');
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
      console.error('SIDEBAR: Error fetching room data:', error);
      return;
    }

    if (!roomData) {
console.warn(' SIDEBAR: Could not find room data for room ID:', newMessage.room_id);
      return;
    }

    // CRITICAL: Verify user has access to this room
    const userHasAccess = userRooms.some(room => room.shareCode === roomData.share_code);
    if (!userHasAccess) {
console.warn(' SIDEBAR: User does not have access to room:', roomData.share_code, 'Ignoring message for security');
      return;
    }

    const threadId = newMessage.thread_id;

    // Check if this is a new thread we haven't seen before
    if (!seenThreadsRef.current.has(threadId)) {
      // New room thread detected

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

// New thread created in room

      // CRITICAL: Refresh sidebar data for new thread
// Refreshing sidebar for new thread
      try {
        // Use multiple strategies to ensure sidebar refresh
        await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
        await mutate('chatPreviews'); // Also try direct key
        await mutate('roomChats'); // CRITICAL: Refresh room chat data
// Triggered SWR mutate
      } catch (error) {
        console.warn('SIDEBAR: Could not mutate SWR cache for room thread:', error);
      }

      // Also trigger a broader refresh to ensure all sidebar data is updated
      try {
        await mutate((key) => typeof key === 'string' && key.includes('chat'));
// Triggered broad refresh
      } catch (error) {
        console.warn('SIDEBAR: Could not trigger broad refresh:', error);
      }

      // Dispatch custom event to trigger room chat data refresh
      window.dispatchEvent(new CustomEvent('roomThreadCreated', { 
        detail: threadData 
      }));

      // Call custom handler if provided
      if (onThreadCreated) {
        onThreadCreated(threadData);
      }
    } else {
// Thread already seen, skipping
    }
  }, [onThreadCreated, userRooms]);

  const handleNewChatMessage = useCallback(async (data: any) => {
    // Processing chat message
    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    // Processing chat message details

    // Only handle user messages (not AI responses) to detect new chats
    if (!newMessage.is_user_message) {
      // Skipping: Not a user message
      return;
    }

    // New regular chat message detected

    // Only refresh the sidebar data, not the entire page
    // Updating sidebar data

    // Use SWR mutate to update only the sidebar data
    try {
      await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      // Triggered SWR mutate
    } catch (error) {
      console.warn('Could not mutate SWR cache:', error);
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
    // Sidebar refresh requested
    // Trigger SWR mutate to refresh sidebar data
    mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
  }, []);

  // Trigger sidebar refresh function (maintains same API as current)
  const triggerSidebarRefresh = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('request-sidebar-refresh');
    } else {
      console.warn('Socket not connected, cannot trigger sidebar refresh');
      // Fallback to direct SWR mutate
      mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    }
  }, [socket, isConnected]);

  useEffect(() => {
    if (!userId || !socket || !isConnected) {
// Not setting up sidebar socket
      return;
    }

// Setting up sidebar socket
    if (userRooms && userRooms.length > 0) {
// User rooms loaded
    } else {
// No user rooms found
    }

    // Reset seen threads when rooms change
    seenThreadsRef.current.clear();

    // Join user's personal channel for sidebar updates
    socket.emit('join-user-channel');

    // Set up event listeners (matching server-side event names)
// Setting up event listeners
    
    // Add connection verification
    socket.on('connect', () => {
// Socket connected
      socket.emit('join-user-channel'); // Re-join on reconnect
    });
    socket.on('room-message-created', (data) => {
// Received room-message-created event
      handleNewRoomMessage(data);
    });
    socket.on('chat-message-created', (data) => {
// Received chat-message-created event
      handleNewChatMessage(data);
    });
    socket.on('sidebar-refresh-requested', (data) => {
// Received sidebar-refresh-requested event
      handleSidebarRefreshRequested();
    });
    socket.on('thread-created', (data) => {
// Received thread-created event
      
      // CRITICAL: Verify room isolation - only process events from rooms the user has access to
      if (!data.shareCode) {
console.warn(' SIDEBAR: thread-created event missing shareCode, ignoring for security');
        return;
      }

      const userHasAccess = userRooms.some(room => room.shareCode === data.shareCode);
      if (!userHasAccess) {
console.warn(' SIDEBAR: User does not have access to room:', data.shareCode, 'Ignoring thread-created event for security');
        return;
      }
      
// Thread-created event verified
      
      // Force immediate sidebar refresh for new threads
// Refreshing sidebar data
      mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      mutate('chatPreviews');
      mutate('roomChats'); // Also refresh room chat data
      
      // Dispatch custom event to trigger room chat data refresh
      window.dispatchEvent(new CustomEvent('roomThreadCreated', { 
        detail: data 
      }));
      
      if (onThreadCreated) {
        onThreadCreated(data);
      }
    });



    // FIXED: Do NOT auto-join all user rooms - this was causing massive performance issues
    // Users should only join rooms when they explicitly navigate to them
    // The sidebar only needs the personal notification channel for updates
// Setting up notification channels

    // CRITICAL: Also join user's personal channel for direct notifications
    socket.emit('join-user-channel');
    
    // Test socket connection with a simple ping
// Testing socket connection
    socket.emit('ping', { message: 'sidebar-socket-test', timestamp: Date.now() });
    
    // Listen for pong response
    const handlePong = (data: any) => {
// Received pong response
    };
    socket.on('pong', handlePong);

    // Pre-populate seen threads with existing threads to avoid false positives
    // CRITICAL: Only load threads from rooms the user has access to
    const populateSeenThreads = async () => {
      try {
        if (supabase && userRooms && userRooms.length > 0) {
// Pre-populating seen threads
          
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id, share_code')
            .in('share_code', userRooms.map(r => r.shareCode));

          if (rooms && rooms.length > 0) {
            const roomIds = rooms.map(r => r.id);
// Found room IDs for authorized rooms
            
            const { data: existingMessages } = await supabase
              .from('room_messages')
              .select('thread_id, room_id')
              .in('room_id', roomIds)
              .not('thread_id', 'is', null);

            if (existingMessages) {
              // Double-check room authorization before adding to seen threads
              existingMessages.forEach(msg => {
                const roomData = rooms.find(r => r.id === msg.room_id);
                if (roomData && userRooms.some(ur => ur.shareCode === roomData.share_code)) {
                  if (msg.thread_id) {
                    seenThreadsRef.current.add(msg.thread_id);
                  }
                } else {
console.warn(' SIDEBAR: Skipping thread from unauthorized room:', msg.room_id);
                }
              });
// Pre-populated existing threads
            }
          }
        }
      } catch (error) {
        console.error('SIDEBAR: Error pre-populating seen threads:', error);
      }
    };

    populateSeenThreads();

    // Listen for manual thread refresh events
    const handleForceThreadRefresh = (event: CustomEvent) => {
      const threadData = event.detail;
// Force thread refresh triggered
      
      // Mark thread as seen and trigger refresh
      if (threadData.threadId) {
        seenThreadsRef.current.add(threadData.threadId);
      }
      
      // Force sidebar refresh
      mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      mutate('chatPreviews');
      
      // Call custom handler
      if (onThreadCreated) {
        onThreadCreated(threadData);
      }
    };

    window.addEventListener('forceThreadRefresh', handleForceThreadRefresh as EventListener);

    return () => {
      console.log('🧹 SIDEBAR: Cleaning up sidebar socket listeners');
      socket.off('connect');
      socket.off('room-message-created', handleNewRoomMessage);
      socket.off('chat-message-created', handleNewChatMessage);
      socket.off('sidebar-refresh-requested', handleSidebarRefreshRequested);
      socket.off('thread-created');
      socket.off('pong', handlePong); // Clean up pong listener with specific handler
      
      // FIXED: No room cleanup needed since we don't auto-join rooms anymore
      
      // Leave user channel
      socket.emit('leave-user-channel');
      
      // Clean up custom event listener
      window.removeEventListener('forceThreadRefresh', handleForceThreadRefresh as EventListener);
      
      seenThreadsRef.current.clear();
    };
  }, [userId, userRooms, socket, isConnected, handleNewRoomMessage, handleNewChatMessage, handleSidebarRefreshRequested]);

  return {
    triggerSidebarRefresh,
    isConnected
  };
}