'use client';

import useSWR from 'swr';
import { useSidebarSocket } from '../hooks/useSidebarSocket';

// Fetch function to get current user rooms
const fetchRooms = async () => {
  const response = await fetch('/api/rooms');
  if (!response.ok) {
    throw new Error('Failed to fetch rooms');
  }
  const data = await response.json();
  return data.rooms || [];
};

interface SidebarSocketWrapperProps {
  userId: string;
  userRooms: { shareCode: string; name: string; expiresAt?: string }[];
  children: React.ReactNode;
}

export default function SidebarSocketWrapper({ userId, userRooms, children }: SidebarSocketWrapperProps) {
// Initializing sidebar wrapper

  // Use SWR to get the most up-to-date room data, with server-side data as fallback
  const { data: currentRooms } = useSWR(
    userId ? 'rooms' : null, // Only fetch for authenticated users
    userId ? fetchRooms : null,
    {
      fallbackData: userRooms, // Use server-side data as fallback
      revalidateOnFocus: false,
      revalidateOnReconnect: true
    }
  );

  // No need for separate socket token - using global socket from room connections
  console.log('🔗 SidebarSocketWrapper: Using global socket for sidebar updates');

  // Filter out expired rooms before passing to sidebar socket
  const activeRooms = (currentRooms || [])
    .filter(room => {
      if (!room.expiresAt) return true; // If no expiration date, assume active
      const now = new Date();
      const expiresAt = new Date(room.expiresAt);
      const isActive = now <= expiresAt;
      if (!isActive) {
        console.log(`⏰ Filtering out expired room: ${room.shareCode} (expired ${expiresAt.toISOString()})`);
      }
      return isActive;
    })
    .map(room => ({
      shareCode: room.shareCode || room.share_code,
      name: room.name,
      expiresAt: room.expiresAt
    }));

  // Initialize sidebar Socket.IO updates using global socket (no separate connection needed)
  const { triggerSidebarRefresh, isConnected } = useSidebarSocket({
    userId: userId, // Use original userId, not socket token
    userRooms: activeRooms, // Only pass active (non-expired) rooms
    onThreadCreated: (threadData) => {
      console.log('🎉 New thread created in sidebar:', threadData);
      // Could show a toast notification here if desired
    }
  });

  console.log('🔗 SidebarSocketWrapper status:', { 
    isConnected, 
    totalRooms: currentRooms?.length || 0,
    activeRooms: activeRooms.length,
    expiredRooms: (currentRooms?.length || 0) - activeRooms.length,
    globalSocketAvailable: typeof window !== 'undefined' && !!(window as any).__patio_socket
  });

// Socket connection status updated

  // Expose triggerSidebarRefresh to children if needed (same API as original)
  // This maintains backward compatibility
  return <>{children}</>;
}