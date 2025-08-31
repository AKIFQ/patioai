'use client';

import useSWR from 'swr';
import { useSidebarSocket } from '../hooks/useSidebarSocket';
import { getSocketToken } from '@/lib/utils/userIdentification';

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
  displayName?: string; // Add displayName for authenticated users
  userRooms: { shareCode: string; name: string; expiresAt?: string }[];
  children: React.ReactNode;
}

export default function SidebarSocketWrapper({ userId, displayName, userRooms, children }: SidebarSocketWrapperProps) {

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



  // Filter out expired rooms before passing to sidebar socket
  const activeRooms = (currentRooms || [])
    .filter(room => {
      if (!room.expiresAt) return true; // If no expiration date, assume active
      const now = new Date();
      const expiresAt = new Date(room.expiresAt);
      return now <= expiresAt;
    })
    .map(room => ({
      shareCode: room.shareCode || room.share_code,
      name: room.name,
      expiresAt: room.expiresAt
    }));

  // Initialize sidebar Socket.IO updates
  useSidebarSocket({
    userId: userId,
    displayName: displayName,
    userRooms: activeRooms,
    onThreadCreated: (threadData) => {
      // Dispatch window event for RoomsSection
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('roomThreadCreated', {
          detail: threadData
        }));
      }
    }
  });

  return <>{children}</>;
}