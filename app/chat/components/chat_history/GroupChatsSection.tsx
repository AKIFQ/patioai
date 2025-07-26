'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { 
  Users, 
  MoreHorizontal, 
  Copy, 
  ExternalLink,
  Crown,
  Clock,
  User
} from 'lucide-react';
import { toast } from 'sonner';

interface GroupChatRoom {
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

interface GroupChatsSectionProps {
  groupChatRooms: GroupChatRoom[];
  onChatSelect: () => void;
}

export default function GroupChatsSection({ 
  groupChatRooms, 
  onChatSelect 
}: GroupChatsSectionProps) {
  const handleCopyLink = async (shareCode: string, roomName: string) => {
    const baseUrl = window.location.origin;
    const shareableLink = `${baseUrl}/room/${shareCode}`;
    
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success(`Link copied for "${roomName}"`);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

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

  const getTierColor = (tier: 'free' | 'pro') => {
    return tier === 'pro' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
  };

  if (groupChatRooms.length === 0) {
    return (
      <SidebarGroup className="px-0">
        <SidebarGroupLabel>Group Chats</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No group chats yet
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="px-0">
      <SidebarGroupLabel>Group Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {groupChatRooms.map((room) => (
            <SidebarMenuItem key={room.id}>
              <div className="flex items-center w-full group">
                <SidebarMenuButton asChild className="flex-1 min-w-0">
                  <Link 
                    href={`/room/${room.shareCode}`}
                    onClick={onChatSelect}
                    className="flex items-center gap-2 w-full"
                  >
                    <Users className="h-4 w-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-medium">
                          {room.name}
                        </span>
                        {room.isCreator && (
                          <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {room.participantCount}/{room.maxParticipants}
                        </span>
                        <span className={`uppercase text-xs ${getTierColor(room.tier)}`}>
                          {room.tier}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeRemaining(room.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </SidebarMenuButton>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleCopyLink(room.shareCode, room.name)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy invite link
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/room/${room.shareCode}`}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open room
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}