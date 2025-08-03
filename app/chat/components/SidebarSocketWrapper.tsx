'use client';

import { useSidebarSocket } from '../hooks/useSidebarSocket';

interface SidebarSocketWrapperProps {
  userId: string;
  userRooms: Array<{ shareCode: string; name: string }>;
  children: React.ReactNode;
}

export default function SidebarSocketWrapper({ userId, userRooms, children }: SidebarSocketWrapperProps) {
  // Initialize sidebar Socket.IO updates
  const { triggerSidebarRefresh, isConnected } = useSidebarSocket({
    userId,
    userRooms,
    onThreadCreated: (threadData) => {
      console.log('New thread created in sidebar:', threadData);
      // Could show a toast notification here if desired
    }
  });

  // Expose triggerSidebarRefresh to children if needed (same API as original)
  // This maintains backward compatibility
  return <>{children}</>;
}