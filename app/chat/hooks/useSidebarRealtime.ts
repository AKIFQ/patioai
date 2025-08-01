import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/client/client';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';

const supabase = createClient();

interface SidebarRealtimeProps {
  userId: string;
  userRooms: Array<{ shareCode: string; name: string }>;
  onThreadCreated?: (threadData: any) => void;
}

export function useSidebarRealtime({ userId, userRooms, onThreadCreated }: SidebarRealtimeProps) {
  const channelsRef = useRef<any[]>([]);
  const seenThreadsRef = useRef<Set<string>>(new Set());
  const router = useRouter();

  const handleNewRoomMessage = useCallback(async (payload: any) => {
    const newMessage = payload.new;

    // Only handle user messages (not AI responses) to detect new threads
    if (newMessage.is_ai_response) return;

    const threadId = newMessage.thread_id;

    // Check if this is a new thread we haven't seen before
    if (!seenThreadsRef.current.has(threadId)) {
      console.log('🎉 New room thread detected in sidebar realtime:', {
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

            console.log(`📝 New thread "${newMessage.content?.substring(0, 30)}..." created in room ${roomData.name}`);

            // Force refresh the page data to show the new thread in sidebar
            router.refresh();

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
  }, [onThreadCreated, router]);

  const handleNewChatMessage = useCallback(async (payload: any) => {
    console.log('🚨 RAW CHAT MESSAGE PAYLOAD:', payload);
    const newMessage = payload.new;

    console.log('🔍 CHAT MESSAGE DETAILS:', {
      id: newMessage?.id,
      chatSessionId: newMessage?.chat_session_id,
      isUserMessage: newMessage?.is_user_message,
      content: newMessage?.content?.substring(0, 50),
      createdAt: newMessage?.created_at,
      eventType: payload.eventType,
      table: payload.table,
      schema: payload.schema
    });

    // Only handle user messages (not AI responses) to detect new chats
    if (!newMessage.is_user_message) {
      console.log('⏭️ SKIPPING: Not a user message');
      return;
    }

    console.log('🎉 New regular chat message detected in sidebar realtime:', {
      chatSessionId: newMessage.chat_session_id,
      content: newMessage.content?.substring(0, 30)
    });

    // Only refresh the sidebar data, not the entire page
    console.log('🔄 Updating sidebar data without page refresh');

    // Use SWR mutate to update only the sidebar data
    try {
      const { mutate } = await import('swr');
      await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      console.log('🔄 Triggered SWR mutate for chatPreviews');
    } catch (error) {
      console.warn('Could not mutate SWR cache:', error);
    }

    // Don't call router.refresh() as it causes the entire page to reload
    // The sidebar should update via SWR mutate

    // Call custom handler if provided
    if (onThreadCreated) {
      onThreadCreated({
        threadId: newMessage.chat_session_id,
        type: 'regular',
        firstMessage: newMessage.content,
        createdAt: newMessage.created_at
      });
    }
  }, [onThreadCreated, router]);

  useEffect(() => {
    if (!userId) return;

    console.log('📡 Setting up sidebar realtime for user:', userId);
    if (userRooms && userRooms.length > 0) {
      console.log('📡 User rooms:', userRooms.map(r => r.shareCode));
    }
    console.log('📡 Supabase client available:', !!supabase);

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    });
    channelsRef.current = [];

    // Reset seen threads when rooms change
    seenThreadsRef.current.clear();

    const setupRealtime = async () => {
      if (!supabase) return;

      try {
        // Always set up regular chat messages subscription
        console.log('📡 Setting up chat messages subscription for user:', userId);
        const chatChannel = supabase
          .channel('sidebar_chat_messages', {
            config: {
              broadcast: { self: false }
            }
          })
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_messages'
              // No filter needed - RLS will handle user filtering
            },
            (payload) => {
              console.log('🚨 RAW REALTIME EVENT RECEIVED:', payload);
              handleNewChatMessage(payload);
            }
          )
          .subscribe((status, err) => {
            console.log('📡 Sidebar chat messages realtime status:', status);
            if (status === 'SUBSCRIBED') {
              console.log('✅ Successfully subscribed to sidebar chat message updates');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Sidebar chat messages channel error:', err || 'Unknown error');
            } else if (status === 'TIMED_OUT') {
              console.error('⏰ Sidebar chat messages channel timeout');
            }

            if (err) {
              console.error('❌ Sidebar chat realtime subscription error:', err);
            }
          });

        channelsRef.current.push(chatChannel);

        // DEBUG: Test subscription to see if realtime is working at all
        const testChannel = supabase
          .channel('test_realtime', {
            config: {
              broadcast: { self: false }
            }
          })
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'chat_sessions'
            },
            (payload) => {
              console.log('🧪 TEST: chat_sessions realtime event:', payload);
            }
          )
          .subscribe((status, err) => {
            console.log('🧪 TEST: chat_sessions subscription status:', status);
            if (err) console.error('🧪 TEST: chat_sessions subscription error:', err);
          });

        channelsRef.current.push(testChannel);

        // Set up room messages subscription only if user has rooms
        if (userRooms && userRooms.length > 0) {
          console.log('📡 Setting up room messages subscription for rooms:', userRooms.map(r => r.shareCode));

          // Get room IDs for the user's rooms
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id, share_code')
            .in('share_code', userRooms.map(r => r.shareCode));

          if (rooms && rooms.length > 0) {
            // Subscribe to room_messages table changes for all user's rooms
            const roomIds = rooms.map(r => r.id);

            const roomChannel = supabase
              .channel('sidebar_room_messages', {
                config: {
                  broadcast: { self: false }
                }
              })
              .on(
                'postgres_changes',
                {
                  event: 'INSERT',
                  schema: 'public',
                  table: 'room_messages',
                  filter: `room_id=in.(${roomIds.join(',')})`
                },
                handleNewRoomMessage
              )
              .subscribe((status, err) => {
                console.log('📡 Sidebar room messages realtime status:', status);
                if (status === 'SUBSCRIBED') {
                  console.log('✅ Successfully subscribed to sidebar room message updates');
                } else if (status === 'CHANNEL_ERROR') {
                  console.error('❌ Sidebar room messages channel error:', err || 'Unknown error');
                } else if (status === 'TIMED_OUT') {
                  console.error('⏰ Sidebar room messages channel timeout');
                }

                if (err) {
                  console.error('❌ Sidebar room realtime subscription error:', err);
                }
              });

            channelsRef.current.push(roomChannel);

            // Pre-populate seen threads with existing threads to avoid false positives
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
              console.log(`📋 Pre-populated ${seenThreadsRef.current.size} existing threads`);
            }
          }
        }

      } catch (error) {
        console.error('Error setting up sidebar realtime:', error);
      }
    };

    setupRealtime();

    return () => {
      console.log('🧹 Cleaning up sidebar realtime channels');
      channelsRef.current.forEach(channel => {
        if (supabase) {
          supabase.removeChannel(channel);
        }
      });
      channelsRef.current = [];
      seenThreadsRef.current.clear();
    };
  }, [userId, userRooms, handleNewRoomMessage, handleNewChatMessage]);

  return {
    // Could return status or other utilities if needed
  };
}