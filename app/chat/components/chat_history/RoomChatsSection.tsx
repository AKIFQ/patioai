'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from '@/components/ui/sidebar';
import { Users, Clock } from 'lucide-react';
import Link from 'next/link';
import { getStoredDisplayName, getOrCreateSessionId } from '@/lib/utils/session';

interface RoomChat {
  shareCode: string;
  roomName: string;
  lastActivity: string;
  participantCount: number;
  maxParticipants: number;
  tier: 'free' | 'pro';
}

interface RoomChatsSectionProps {
  onChatSelect: () => void;
}

export default function RoomChatsSection({ onChatSelect }: RoomChatsSectionProps) {
  const [roomChats, setRoomChats] = useState<RoomChat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRoomChats();
  }, []);

  const loadRoomChats = async () => {
    try {
      setIsLoading(true);
      
      // Get room chats from localStorage (rooms the user has joined)
      const storedRooms: RoomChat[] = [];
      
      // Check localStorage for room display names (indicates user has joined)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('room_') && key.endsWith('_displayName')) {
          const shareCode = key.replace('room_', '').replace('_displayName', '');
          const displayName = localStorage.getItem(key);
          
          if (displayName) {
            // Fetch room info
            try {
              const response = await fetch(`/api/rooms/${shareCode}/join`);
              if (response.ok) {
                const roomInfo = await response.json();
                storedRooms.push({
                  shareCode,
                  roomName: roomInfo.room.name,
                  lastActivity: roomInfo.room.createdAt,
                  participantCount: roomInfo.participantCount,
                  maxParticipants: roomInfo.room.maxParticipants,
                  tier: roomInfo.room.tier
                });
              }
            } catch (error) {
              console.error(`Error fetching room ${shareCode}:`, error);
            }
          }
        }
      }
      
      // Sort by last activity
      storedRooms.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
      
      setRoomChats(storedRooms);
    } catch (error) {
      console.error('Error loading room chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatLastActivity = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    }
  };

  const getRoomChatUrl = (shareCode: string) => {
    const displayName = getStoredDisplayName(shareCode);
    const sessionId = getOrCreateSessionId();
    
    if (displayName) {
      return `/chat/room/${shareCode}?displayName=${encodeURIComponent(displayName)}&sessionId=${encodeURIComponent(sessionId)}`;
    }
    
    return `/room/${shareCode}`;
  };

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Room Chats</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (roomChats.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Room Chats</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">No room chats yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a room to start chatting with others
            </p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Room Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {roomChats.map((room) => (
            <SidebarMenuItem key={room.shareCode}>
              <SidebarMenuButton asChild onClick={onChatSelect}>
                <Link href={getRoomChatUrl(room.shareCode)}>
                  <div className="flex items-center gap-2 w-full">
                    <Users className="h-4 w-4 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">
                          {room.roomName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatLastActivity(room.lastActivity)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{room.participantCount}/{room.maxParticipants}</span>
                        <span>•</span>
                        <span>{room.tier}</span>
                        <span>•</span>
                        <span>{room.shareCode}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}