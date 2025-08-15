import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client/client';

const supabase = createClient();

interface SidebarSocketProps {
  userId: string;
  userRooms: Array<{ shareCode: string; name: string }>;
  onThreadCreated?: (threadData: any) => void;
}

export function useSidebarSocket({ userId, userRooms, onThreadCreated }: SidebarSocketProps) {
  const { socket, isConnected } = useSocket(userId);
  const seenThreadsRef = useRef<Set<string>>(new Set());
  const router = useRouter();

  const handleNewRoomMessage = useCallback(async (data: any) => {
    // Data structure from Socket.IO should match the Supabase realtime payload structure
    const newMessage = data.new || data;

    // Only handle user messages (not AI responses) to detect new threads
    if (newMessage.is_ai_response) return;

    const threadId = newMessage.thread_id;

    // Check if this is a new thread we haven't seen before
    if (!seenThreadsRef.current.has(threadId)) {
      console.log('New room thread detected in sidebar socket:', {
        threadId,
        sender: newMessage.sender_name,
        content: newMessage.content?.substring(0, 30)
      });

      // Mark this thread as seen
      seenThreadsRef.current.add(threadId);

      // Get room info for the thread
      try {
        if (supabase) {
          const { data: roomData } = await supabase
            .from('rooms')
            .select('share_code, name')
            .eq('id', newMessage.room_id)
            .single();

          if (roomData) {
            const threadData = {
              threadId,
              roomId: newMessage.room_id,
              shareCode: roomData.share_code,
              roomName: roomData.name,
              senderName: newMessage.sender_name,
              firstMessage: newMessage.content,
              createdAt: newMessage.created_at
            };

            console.log(`New thread "${newMessage.content?.substring(0, 30)}..." created in room ${roomData.name}`);

            // CRITICAL: Refresh sidebar for ALL users when new thread is created
            console.log('🔄 REFRESHING SIDEBAR for new thread:', threadData);
            try {
              // Use multiple strategies to ensure sidebar refresh
              await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
              await mutate('chatPreviews'); // Also try direct key
              console.log('✅ Triggered SWR mutate for chatPreviews (room thread)');
            } catch (error) {
              console.warn('Could not mutate SWR cache for room thread:', error);
            }

            // Also trigger a broader refresh to ensure all sidebar data is updated
            try {
              await mutate((key) => typeof key === 'string' && key.includes('chat'));
              console.log('✅ Triggered broad chat data refresh');
            } catch (error) {
              console.warn('Could not trigger broad refresh:', error);
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
        }
      } catch (error) {
        console.error('Error handling new room thread:', error);
      }
    }
  }, [onThreadCreated]);

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
    if (!userId || !socket || !isConnected) return;

    console.log('Setting up sidebar socket for user:', userId);
    if (userRooms && userRooms.length > 0) {
      console.log('User rooms:', userRooms.map(r => r.shareCode));
    }

    // Reset seen threads when rooms change
    seenThreadsRef.current.clear();

    // Join user's personal channel for sidebar updates
    socket.emit('join-user-channel');

    // Set up event listeners (matching server-side event names)
    console.log('🔧 Setting up sidebar socket event listeners');
    socket.on('room-message-created', (data) => {
      console.log('📨 SIDEBAR: Received room-message-created event:', {
        threadId: data?.new?.thread_id,
        sender: data?.new?.sender_name,
        isAI: data?.new?.is_ai_response,
        content: data?.new?.content?.substring(0, 30)
      });
      handleNewRoomMessage(data);
    });
    socket.on('chat-message-created', (data) => {
      console.log('📨 SIDEBAR: Received chat-message-created event:', data);
      handleNewChatMessage(data);
    });
    socket.on('sidebar-refresh-requested', (data) => {
      console.log('📨 SIDEBAR: Received sidebar-refresh-requested event:', data);
      handleSidebarRefreshRequested();
    });
    socket.on('thread-created', (data) => {
      console.log('📨 SIDEBAR: Received thread-created event:', data);
      // Force immediate sidebar refresh for new threads
      mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      mutate('chatPreviews');
      
      if (onThreadCreated) {
        onThreadCreated(data);
      }
    });

    // CRITICAL: Join all user rooms for sidebar notifications
    // This is essential so the sidebar can detect new threads created by other users
    if (userRooms && userRooms.length > 0) {
      console.log('Joining rooms for sidebar notifications:', userRooms.map(r => r.shareCode));
      userRooms.forEach(room => {
        socket.emit('join-room', room.shareCode);
      });
    }

    // Pre-populate seen threads with existing threads to avoid false positives
    const populateSeenThreads = async () => {
      try {
        if (supabase && userRooms && userRooms.length > 0) {
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id')
            .in('share_code', userRooms.map(r => r.shareCode));

          if (rooms && rooms.length > 0) {
            const roomIds = rooms.map(r => r.id);
            const { data: existingMessages } = await supabase
              .from('room_messages')
              .select('thread_id')
              .in('room_id', roomIds)
              .not('thread_id', 'is', null);

            if (existingMessages) {
              existingMessages.forEach(msg => {
                if (msg.thread_id) {
                  seenThreadsRef.current.add(msg.thread_id);
                }
              });
              console.log(`Pre-populated ${seenThreadsRef.current.size} existing threads`);
            }
          }
        }
      } catch (error) {
        console.error('Error pre-populating seen threads:', error);
      }
    };

    populateSeenThreads();

    // Listen for manual thread refresh events
    const handleForceThreadRefresh = (event: CustomEvent) => {
      const threadData = event.detail;
      console.log('🔄 FORCE THREAD REFRESH triggered:', threadData);
      
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
      console.log('Cleaning up sidebar socket listeners');
      socket.off('room-message-created', handleNewRoomMessage);
      socket.off('chat-message-created', handleNewChatMessage);
      socket.off('sidebar-refresh-requested', handleSidebarRefreshRequested);
      socket.off('thread-created');
      
      // Leave rooms
      if (userRooms && userRooms.length > 0) {
        console.log('Leaving rooms for sidebar cleanup:', userRooms.map(r => r.shareCode));
        userRooms.forEach(room => {
          socket.emit('leave-room', room.shareCode);
        });
      }
      
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