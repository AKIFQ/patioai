import { useEffect, useCallback, useRef, useState } from 'react';
import { mutate } from 'swr';
import { createClient } from '@/lib/client/client';
import { useSocket } from '@/hooks/useSocket';

const supabase = createClient();

interface SidebarSocketProps {
  userId: string;
  displayName?: string;
  userRooms: { shareCode: string; name: string; expiresAt?: string }[];
  onThreadCreated?: (threadData: any) => void;
}

export function useSidebarSocket({ userId, displayName, userRooms, onThreadCreated }: SidebarSocketProps) {
  const seenThreadsRef = useRef<Set<string>>(new Set());
  const eventListenersSetupRef = useRef(false);
  
  // Use proper authenticated socket connection
  const { socket, isConnected } = useSocket(userId, displayName);

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('roomThreadCreated', {
          detail: threadData
        }));
      }

      // Call custom handler if provided
      if (onThreadCreated) {
        onThreadCreated(threadData);
      }
    }
  }, [onThreadCreated, userRooms]);

  const handleThreadCreated = useCallback((data: any) => {
    // CRITICAL: Verify room isolation - only process events from rooms the user has access to
    if (!data.shareCode) {
      return;
    }

    const userHasAccess = userRooms.some(room => room.shareCode === data.shareCode);
    if (!userHasAccess) {
      return;
    }

    // Mark thread as seen to prevent duplicate processing
    if (data.threadId) {
      seenThreadsRef.current.add(data.threadId);
    }

    // Force immediate sidebar refresh for new threads
    mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    mutate('chatPreviews');
    mutate('roomChats');

    // Dispatch custom event to trigger room chat data refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roomThreadCreated', {
        detail: data
      }));
    }

    if (onThreadCreated) {
      onThreadCreated(data);
    }
  }, [userRooms, onThreadCreated]);

  // Set up event listeners on the authenticated socket
  useEffect(() => {
    if (typeof window === 'undefined' || !userId || !socket || !isConnected || eventListenersSetupRef.current) {
      return;
    }

    const setupSocketListeners = () => {

      console.log('🔌 Setting up sidebar event listeners on authenticated socket');
      
      // Set up event listeners
      socket.on('room-message-created', handleNewRoomMessage);
      socket.on('thread-created', handleThreadCreated);

      // Join user's personal channel for direct notifications
      socket.emit('join-user-channel');

      // Listen for user channel join confirmation
      socket.on('user-channel-joined', (data: any) => {
        console.log('✅ Joined user channel for sidebar updates:', data.channelName);
      });

      eventListenersSetupRef.current = true;

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
    };

    // Start setup
    setupSocketListeners();

    return () => {
      if (socket && eventListenersSetupRef.current) {
        console.log('🧹 Cleaning up sidebar event listeners');
        socket.off('room-message-created', handleNewRoomMessage);
        socket.off('thread-created', handleThreadCreated);
        socket.off('user-channel-joined');
        eventListenersSetupRef.current = false;
      }
      seenThreadsRef.current.clear();
    };
  }, [userId, socket, isConnected, userRooms, handleNewRoomMessage, handleThreadCreated]);

  // Fallback polling mechanism when socket is not available
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isConnected && userRooms && userRooms.length > 0) {
      console.log('⏳ Sidebar socket not connected, using polling fallback');
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
  }, [isConnected, userRooms]);

  const triggerSidebarRefresh = useCallback(() => {
    if (socket) {
      socket.emit('request-sidebar-refresh');
    }
    // Always trigger SWR mutate as well for immediate updates
    mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    mutate('chatPreviews');
    mutate('roomChats');
  }, [socket]);

  return {
    triggerSidebarRefresh,
    isConnected
  };
}