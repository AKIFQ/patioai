'use client';

import React from 'react';
import { useSidebar } from '@/components/ui/sidebar';

interface SidebarAwareContentProps {
  children: React.ReactNode;
}

export default function SidebarAwareContent({ children }: SidebarAwareContentProps) {
  // Since the sidebar uses flex-shrink-0 and takes up actual layout space,
  // the content should naturally flow next to it without extra margin
  return (
    <div className="flex-1 h-full overflow-hidden">
      {children}
    </div>
  );
}