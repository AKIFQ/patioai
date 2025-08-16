'use client';

import { useSidebarSocket } from '../hooks/useSidebarSocket';

interface SidebarSocketWrapperProps {
  userId: string;
  userRooms: Array<{ shareCode: string; name: string }>;
  children: React.ReactNode;
}

export default function SidebarSocketWrapper({ userId, userRooms, children }: SidebarSocketWrapperProps) {
  console.log('🔧 SIDEBAR WRAPPER: Initializing with:', {
    userId,
    userRoomsCount: userRooms?.length,
    userRooms: userRooms?.map(r => ({ shareCode: r.shareCode, name: r.name }))
  });

  // CRITICAL FIX: Use the same socket token format as room sockets
  // The socket authentication expects a sessionId format like "auth_${userId}"
  // For anonymous users, we don't initialize socket connections since they don't have persistent sessions
  const socketToken = userId ? `auth_${userId}` : '';
  console.log('🔧 SIDEBAR WRAPPER: Using socket token:', socketToken);

  // Initialize sidebar Socket.IO updates (only for authenticated users)
  const { triggerSidebarRefresh, isConnected } = useSidebarSocket({
    userId: socketToken, // Use the formatted token instead of raw userId
    userRooms: socketToken ? userRooms : [], // Only pass rooms for authenticated users
    onThreadCreated: (threadData) => {
      console.log('🎉 SIDEBAR WRAPPER: New thread created in sidebar:', threadData);
      // Could show a toast notification here if desired
    }
  });

  console.log('🔧 SIDEBAR WRAPPER: Socket connection status:', { isConnected });

  // Expose triggerSidebarRefresh to children if needed (same API as original)
  // This maintains backward compatibility
  return <>{children}</>;
}