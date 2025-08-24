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
  userRooms: { shareCode: string; name: string }[];
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

  // CRITICAL FIX: Use the same socket token format as room sockets
  // The socket authentication expects a sessionId format like "auth_${userId}"
  // For anonymous users, we don't initialize socket connections since they don't have persistent sessions
  const socketToken = userId ? `auth_${userId}` : '';
// Using socket token

  // Initialize sidebar Socket.IO updates (only for authenticated users)
  // Use the most current room data from SWR instead of static server-side data
  const { triggerSidebarRefresh, isConnected } = useSidebarSocket({
    userId: socketToken, // Use the formatted token instead of raw userId
    userRooms: socketToken ? (currentRooms || []).map(room => ({
      shareCode: room.shareCode || room.share_code,
      name: room.name
    })) : [], // Use SWR data which stays updated
    onThreadCreated: (threadData) => {
// New thread created in sidebar
      // Could show a toast notification here if desired
    }
  });

// Socket connection status updated

  // Expose triggerSidebarRefresh to children if needed (same API as original)
  // This maintains backward compatibility
  return <>{children}</>;
}