'use client';

import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from '@/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Crown, Clock } from 'lucide-react';

interface RoomPreview {
  id: string;
  name: string;
  shareCode: string;
  participantCount: number;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
  isCreator: boolean;
}

interface RoomsSectionProps {
  rooms: RoomPreview[];
  onRoomSelect: () => void;
  userInfo?: {
    id: string;
    full_name?: string;
    email?: string;
  };
}

export default function RoomsSection({ rooms, onRoomSelect, userInfo }: RoomsSectionProps) {
  const params = useParams();
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffHours = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 24) {
      return `${diffHours}h`;
    } else {
      const diffDays = Math.ceil(diffHours / 24);
      return `${diffDays}d`;
    }
  };

  if (rooms.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Your Rooms</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>No rooms yet</p>
            <p>Create a room to get started</p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Your Rooms ({rooms.length})</SidebarGroupLabel>
      <SidebarGroupContent>
        <ScrollArea className="h-[400px]">
          <SidebarMenu>
            {rooms.map((room) => {
              const isActive = currentRoomShareCode === room.shareCode;
              const isExpiringSoon = new Date(room.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
              
              return (
                <SidebarMenuItem key={room.id}>
                  <SidebarMenuButton 
                    asChild 
                    className={`w-full ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    <Link 
                      href={userInfo ? 
                        `/chat/room/${room.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}` :
                        `/room/${room.shareCode}`
                      }
                      onClick={onRoomSelect}
                      className="flex flex-col items-start gap-1 p-2"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {room.isCreator && (
                            <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-sm truncate">
                            {room.name}
                          </span>
                        </div>
                        <Badge 
                          variant="secondary" 
                          className="text-xs flex items-center gap-1 flex-shrink-0"
                        >
                          <Users className="h-2 w-2" />
                          {room.participantCount}/{room.maxParticipants}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                        <span className="font-mono">{room.shareCode}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {room.tier}
                          </Badge>
                          <div className={`flex items-center gap-1 ${isExpiringSoon ? 'text-orange-500' : ''}`}>
                            <Clock className="h-2 w-2" />
                            {formatTimeRemaining(room.expiresAt)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}