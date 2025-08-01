'use client';

import { useSidebarRealtime } from '../hooks/useSidebarRealtime';

interface SidebarRealtimeWrapperProps {
  userId: string;
  userRooms: Array<{ shareCode: string; name: string }>;
  children: React.ReactNode;
}

export default function SidebarRealtimeWrapper({ userId, userRooms, children }: SidebarRealtimeWrapperProps) {
  // Initialize sidebar realtime updates
  useSidebarRealtime({
    userId,
    userRooms,
    onThreadCreated: (threadData) => {
      console.log('🎉 New thread created in sidebar:', threadData);
      // Could show a toast notification here if desired
    }
  });

  return <>{children}</>;
}