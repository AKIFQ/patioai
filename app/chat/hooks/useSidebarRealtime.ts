import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/client/client';
import { mutate } from 'swr';

const supabase = createClient();

interface SidebarRealtimeProps {
  userId: string;
  userRooms: Array<{ shareCode: string; name: string }>;
  onThreadCreated?: (threadData: any) => void;
}

export function useSidebarRealtime({ userId, userRooms, onThreadCreated }: SidebarRealtimeProps) {
  const channelsRef = useRef<any[]>([]);

  const handleThreadCreated = useCallback((payload: any) => {
    console.log('🎉 New thread created:', payload);
    
    // Show a subtle notification that a new thread was created
    console.log(`📝 New thread "${payload.firstMessage?.substring(0, 30)}..." created in room`);
    
    // Try to refresh cache instead of full page reload
    mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    
    // Call custom handler if provided
    if (onThreadCreated) {
      onThreadCreated(payload);
    }
  }, [onThreadCreated]);

  useEffect(() => {
    if (!userId || !userRooms || userRooms.length === 0) return;

    console.log('📡 Setting up sidebar realtime for rooms:', userRooms.map(r => r.shareCode));

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Subscribe to thread creation events for each room the user participates in
    userRooms.forEach(room => {
      const channel = supabase
        .channel(`room_sidebar_${room.shareCode}`)
        .on('broadcast', { event: 'thread_created' }, (payload) => {
          console.log(`📨 Thread created broadcast received for room ${room.shareCode}:`, payload);
          handleThreadCreated(payload.payload);
        })
        .subscribe((status) => {
          console.log(`📡 Sidebar realtime status for ${room.shareCode}:`, status);
        });

      channelsRef.current.push(channel);
    });

    return () => {
      console.log('🧹 Cleaning up sidebar realtime channels');
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [userId, userRooms, handleThreadCreated]);

  return {
    // Could return status or other utilities if needed
  };
}