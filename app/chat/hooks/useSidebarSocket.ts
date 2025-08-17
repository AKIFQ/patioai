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
console.log(' SIDEBAR: Raw room message received:', {
      eventType: data.eventType,
      table: data.table,
      messageId: data.new?.id,
      threadId: data.new?.thread_id,
      sender: data.new?.sender_name,
      isAI: data.new?.is_ai_response,
      content: data.new?.content?.substring(0, 30),
      roomId: data.new?.room_id
    });

    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    // Only handle user messages (not AI responses) to detect new threads
    if (newMessage.is_ai_response) {
console.log(' SIDEBAR: Skipping AI message');
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
      console.log('🆕 SIDEBAR: New room thread detected in authorized room:', {
        threadId,
        sender: newMessage.sender_name,
        content: newMessage.content?.substring(0, 30),
        roomId: newMessage.room_id,
        roomName: roomData.name,
        shareCode: roomData.share_code
      });

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

console.log(` SIDEBAR: New thread "${newMessage.content?.substring(0, 30)}..." created in authorized room ${roomData.name}`);

      // CRITICAL: Refresh sidebar data for new thread
console.log(' SIDEBAR: REFRESHING SIDEBAR for new thread:', threadData);
      try {
        // Use multiple strategies to ensure sidebar refresh
        await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
        await mutate('chatPreviews'); // Also try direct key
        await mutate('roomChats'); // CRITICAL: Refresh room chat data
console.log(' SIDEBAR: Triggered SWR mutate for chatPreviews and roomChats');
      } catch (error) {
        console.warn('SIDEBAR: Could not mutate SWR cache for room thread:', error);
      }

      // Also trigger a broader refresh to ensure all sidebar data is updated
      try {
        await mutate((key) => typeof key === 'string' && key.includes('chat'));
console.log(' SIDEBAR: Triggered broad chat data refresh');
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
console.log(' SIDEBAR: Thread already seen, skipping:', threadId);
    }
  }, [onThreadCreated, userRooms]);

  const handleNewChatMessage = useCallback(async (data: any) => {
    console.log('RAW CHAT MESSAGE PAYLOAD:', data);
    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    console.log('CHAT MESSAGE DETAILS:', {
      id: newMessage?.id,
      chatSessionId: newMessage?.chat_session_id,
      isUserMessage: newMessage?.is_user_message,
      content: newMessage?.content?.substring(0, 50),
      createdAt: newMessage?.created_at,
      eventType: data.eventType,
      table: data.table,
      schema: data.schema
    });

    // Only handle user messages (not AI responses) to detect new chats
    if (!newMessage.is_user_message) {
      console.log('SKIPPING: Not a user message');
      return;
    }

    console.log('New regular chat message detected in sidebar socket:', {
      chatSessionId: newMessage.chat_session_id,
      content: newMessage.content?.substring(0, 30)
    });

    // Only refresh the sidebar data, not the entire page
    console.log('Updating sidebar data without page refresh');

    // Use SWR mutate to update only the sidebar data
    try {
      await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      console.log('Triggered SWR mutate for chatPreviews');
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
    console.log('Sidebar refresh requested via Socket.IO');
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
console.log(' SIDEBAR: Not setting up sidebar socket:', { userId: !!userId, socket: !!socket, isConnected });
      return;
    }

console.log(' SIDEBAR: Setting up sidebar socket for user:', userId);
    if (userRooms && userRooms.length > 0) {
console.log(' SIDEBAR: User rooms:', userRooms.map(r => r.shareCode));
    } else {
console.log(' SIDEBAR: No user rooms found');
    }

    // Reset seen threads when rooms change
    seenThreadsRef.current.clear();

    // Join user's personal channel for sidebar updates
    socket.emit('join-user-channel');

    // Set up event listeners (matching server-side event names)
console.log(' SIDEBAR: Setting up sidebar socket event listeners');
    
    // Add connection verification
    socket.on('connect', () => {
console.log(' SIDEBAR: Socket connected successfully');
      socket.emit('join-user-channel'); // Re-join on reconnect
    });
    socket.on('room-message-created', (data) => {
console.log(' SIDEBAR: Received room-message-created event:', {
        threadId: data?.new?.thread_id,
        sender: data?.new?.sender_name,
        isAI: data?.new?.is_ai_response,
        content: data?.new?.content?.substring(0, 30),
        roomId: data?.new?.room_id
      });
      handleNewRoomMessage(data);
    });
    socket.on('chat-message-created', (data) => {
console.log(' SIDEBAR: Received chat-message-created event:', data);
      handleNewChatMessage(data);
    });
    socket.on('sidebar-refresh-requested', (data) => {
console.log(' SIDEBAR: Received sidebar-refresh-requested event:', data);
      handleSidebarRefreshRequested();
    });
    socket.on('thread-created', (data) => {
console.log(' SIDEBAR: Received thread-created event:', {
        threadId: data.threadId,
        shareCode: data.shareCode,
        roomName: data.roomName,
        sender: data.senderName,
        content: data.firstMessage?.substring(0, 30)
      });
      
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
      
console.log(' SIDEBAR: thread-created event verified for authorized room:', data.shareCode);
      
      // Force immediate sidebar refresh for new threads
console.log(' SIDEBAR: Refreshing sidebar data for new thread');
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
console.log(' SIDEBAR: Setting up notification channels (NOT auto-joining rooms)');

    // CRITICAL: Also join user's personal channel for direct notifications
    socket.emit('join-user-channel');
    
    // Test socket connection with a simple ping
console.log(' SIDEBAR: Testing socket connection...');
    socket.emit('ping', { message: 'sidebar-socket-test', timestamp: Date.now() });
    
    // Listen for pong response
    const handlePong = (data: any) => {
console.log(' SIDEBAR: Received pong response:', data);
    };
    socket.on('pong', handlePong);

    // Pre-populate seen threads with existing threads to avoid false positives
    // CRITICAL: Only load threads from rooms the user has access to
    const populateSeenThreads = async () => {
      try {
        if (supabase && userRooms && userRooms.length > 0) {
console.log(' SIDEBAR: Pre-populating seen threads for authorized rooms:', userRooms.map(r => r.shareCode));
          
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id, share_code')
            .in('share_code', userRooms.map(r => r.shareCode));

          if (rooms && rooms.length > 0) {
            const roomIds = rooms.map(r => r.id);
console.log(' SIDEBAR: Found room IDs for authorized rooms:', roomIds);
            
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
console.log(` SIDEBAR: Pre-populated ${seenThreadsRef.current.size} existing threads from authorized rooms`);
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
console.log(' FORCE THREAD REFRESH triggered:', threadData);
      
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