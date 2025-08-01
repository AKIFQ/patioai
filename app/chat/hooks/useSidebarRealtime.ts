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

  const handleNewMessage = useCallback(async (payload: any) => {
    const newMessage = payload.new;
    
    // Only handle user messages (not AI responses) to detect new threads
    if (newMessage.is_ai_response) return;
    
    const threadId = newMessage.thread_id;
    
    // Check if this is a new thread we haven't seen before
    if (!seenThreadsRef.current.has(threadId)) {
      console.log('🎉 New thread detected in sidebar realtime:', {
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
        console.error('Error handling new thread:', error);
      }
    }
  }, [onThreadCreated, router]);

  useEffect(() => {
    if (!userId || !userRooms || userRooms.length === 0) return;

    console.log('📡 Setting up sidebar realtime for rooms:', userRooms.map(r => r.shareCode));

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    });
    channelsRef.current = [];
    
    // Reset seen threads when rooms change
    seenThreadsRef.current.clear();

    // Get room IDs for the rooms the user participates in
    const setupRealtimeForRooms = async () => {
      if (!supabase) return;
      
      try {
        // Get room IDs for the user's rooms
        const { data: rooms } = await supabase
          .from('rooms')
          .select('id, share_code')
          .in('share_code', userRooms.map(r => r.shareCode));
        
        if (!rooms || rooms.length === 0) return;
        
        // Subscribe to room_messages table changes for all user's rooms
        const roomIds = rooms.map(r => r.id);
        
        const channel = supabase
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
            handleNewMessage
          )
          .subscribe((status, err) => {
            console.log('📡 Sidebar room messages realtime status:', status);
            if (status === 'SUBSCRIBED') {
              console.log('✅ Successfully subscribed to sidebar room message updates');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Sidebar room messages channel error:', err);
            } else if (status === 'TIMED_OUT') {
              console.error('⏰ Sidebar room messages channel timeout');
            }
          });

        channelsRef.current.push(channel);
        
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
        
      } catch (error) {
        console.error('Error setting up sidebar realtime:', error);
      }
    };

    setupRealtimeForRooms();

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
  }, [userId, userRooms, handleNewMessage]);

  return {
    // Could return status or other utilities if needed
  };
}