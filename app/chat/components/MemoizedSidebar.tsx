'use client';

import React, { memo } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import SidebarSocketWrapper from './SidebarSocketWrapper';

interface MemoizedSidebarProps {
  userId: string;
  userRooms: { shareCode: string; name: string }[];
  children: React.ReactNode;
}

const MemoizedSidebar = memo(({ userId, userRooms, children }: MemoizedSidebarProps) => {
  return (
    <SidebarProvider className="h-full flex">
      <SidebarSocketWrapper
        userId={userId}
        userRooms={userRooms}
      >
        {children}
      </SidebarSocketWrapper>
    </SidebarProvider>
  );
});

MemoizedSidebar.displayName = 'MemoizedSidebar';

export default MemoizedSidebar;