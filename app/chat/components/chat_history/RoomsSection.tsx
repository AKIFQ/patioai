'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from '@/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Crown, Clock, MessageSquare, Plus, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { fetchRoomChatSessions } from '../../room/[shareCode]/fetch';

interface RoomChatSession {
  id: string;
  chat_title: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface RoomPreview {
  id: string;
  name: string;
  shareCode: string;
  participantCount: number;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  isCreator?: boolean;
}

interface RoomsSectionProps {
  rooms: RoomPreview[];
  onRoomSelect?: () => void;
  userInfo: {
    id: string;
    full_name: string;
    email: string;
  };
}

export default function RoomsSection({ rooms, onRoomSelect, userInfo }: RoomsSectionProps) {
  
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [roomSessions, setRoomSessions] = useState<Record<string, RoomChatSession[]>>({});
  const [loadingSessions, setLoadingSessions] = useState<Record<string, boolean>>({});
  
  const params = useParams();
  const searchParams = useSearchParams();
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;

  const toggleRoomExpansion = async (shareCode: string) => {
    const newExpanded = new Set(expandedRooms);
    
    if (expandedRooms.has(shareCode)) {
      newExpanded.delete(shareCode);
    } else {
      newExpanded.add(shareCode);
      
      // Load chat sessions if not already loaded
      if (!roomSessions[shareCode] && !loadingSessions[shareCode]) {
        setLoadingSessions(prev => ({ ...prev, [shareCode]: true }));
        try {
          const sessions = await fetchRoomChatSessions(shareCode);
          setRoomSessions(prev => ({ ...prev, [shareCode]: sessions }));
        } catch (error) {
          console.error('Failed to load room sessions:', error);
          setRoomSessions(prev => ({ ...prev, [shareCode]: [] }));
        } finally {
          setLoadingSessions(prev => ({ ...prev, [shareCode]: false }));
        }
      }
    }
    
    setExpandedRooms(newExpanded);
  };

  const handleRoomClick = (e: React.MouseEvent, shareCode: string) => {
    e.preventDefault();
    onRoomSelect?.();
  };

  const getDisplayName = () => {
    return userInfo?.full_name || userInfo?.email?.split('@')[0] || 'User';
  };

  const getSessionId = () => {
    return userInfo ? `auth_${userInfo.id}` : '';
  };

  // Helper function to check if room is expired
  const isRoomExpired = (expiresAt: string) => {
    return new Date() > new Date(expiresAt);
  };

  // Helper function to check if room is expiring soon (within 24 hours)
  const isRoomExpiringSoon = (expiresAt: string) => {
    const expiresTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const hoursUntilExpiry = (expiresTime - now) / (1000 * 60 * 60);
    return hoursUntilExpiry > 0 && hoursUntilExpiry < 24;
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
        <ScrollArea className="h-32">
          <SidebarMenu>
            {rooms.map((room) => {
              const isActive = currentRoomShareCode === room.shareCode;
              const isExpanded = expandedRooms.has(room.shareCode);
              const isExpired = isRoomExpired(room.expiresAt);
              const isExpiringSoon = !isExpired && isRoomExpiringSoon(room.expiresAt);
              const sessions = roomSessions[room.shareCode] || [];
              const isLoadingSessions = loadingSessions[room.shareCode];
              
              return (
                <SidebarMenuItem key={room.id}>
                  <div className="space-y-1">
                    {/* Room Header */}
                    <div className={`flex items-center gap-1 ${isExpired ? 'opacity-50' : ''}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-6 w-6"
                        onClick={() => toggleRoomExpansion(room.shareCode)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </Button>
                      
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={`flex-1 ${isExpired ? 'pointer-events-none' : ''}`}
                      >
                        <Link
                          href={isExpired ? '#' : `/chat/room/${room.shareCode}?displayName=${encodeURIComponent(getDisplayName())}&sessionId=${encodeURIComponent(getSessionId())}&threadId=${crypto.randomUUID()}`}
                          onClick={(e) => {
                            if (isExpired) {
                              e.preventDefault();
                              return;
                            }
                            handleRoomClick(e, room.shareCode);
                          }}
                          className={`flex items-center gap-2 w-full ${isExpired ? 'line-through decoration-2' : ''}`}
                        >
                          {isExpired ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                          <span className={`truncate ${isExpired ? 'text-muted-foreground' : ''}`}>
                            {room.name}
                          </span>
                          <div className="flex items-center gap-1 ml-auto">
                            {room.isCreator && (
                              <Crown className="h-3 w-3 text-amber-500" />
                            )}
                            {isExpired && (
                              <Badge variant="destructive" className="text-xs px-1 py-0">
                                Expired
                              </Badge>
                            )}
                            {isExpiringSoon && (
                              <Badge variant="outline" className="text-xs px-1 py-0 border-amber-300 text-amber-600">
                                <Clock className="h-2 w-2 mr-1" />
                                Soon
                              </Badge>
                            )}
                          </div>
                        </Link>
                      </SidebarMenuButton>
                    </div>

                    {/* Room Details */}
                    <div className={`ml-7 text-xs text-muted-foreground flex items-center gap-2 ${isExpired ? 'opacity-50' : ''}`}>
                      <span>{room.participantCount}/{room.maxParticipants}</span>
                      <Badge variant="secondary" className="text-xs">
                        {room.tier}
                      </Badge>
                    </div>

                    {/* Expanded Sessions */}
                    {isExpanded && (
                      <div className="ml-7 space-y-1">
                        {isLoadingSessions ? (
                          <div className="text-xs text-muted-foreground py-2">
                            Loading sessions...
                          </div>
                        ) : sessions.length > 0 ? (
                          sessions.map((session) => (
                            <SidebarMenuButton
                              key={session.id}
                              asChild
                              size="sm"
                              className={`text-xs ${isExpired ? 'pointer-events-none opacity-50' : ''}`}
                            >
                              <Link
                                href={isExpired ? '#' : `/chat/room/${room.shareCode}?displayName=${encodeURIComponent(getDisplayName())}&sessionId=${encodeURIComponent(getSessionId())}&threadId=${session.id}`}
                                onClick={(e) => {
                                  if (isExpired) {
                                    e.preventDefault();
                                    return;
                                  }
                                  handleRoomClick(e, room.shareCode);
                                }}
                                className="flex items-center gap-2"
                              >
                                <MessageSquare className="h-3 w-3" />
                                <span className="truncate">
                                  {session.chat_title || `Chat with ${session.display_name}`}
                                </span>
                              </Link>
                            </SidebarMenuButton>
                          ))
                        ) : (
                          <div className="text-xs text-muted-foreground py-2">
                            No conversations yet
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}