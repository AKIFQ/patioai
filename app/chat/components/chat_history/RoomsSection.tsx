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
import { Users, Crown, Clock, MessageSquare, Plus, ChevronDown, ChevronRight } from 'lucide-react';
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
  const searchParams = useSearchParams();
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;
  const currentChatSession = searchParams.get('chatSession');
  
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [roomSessions, setRoomSessions] = useState<Record<string, RoomChatSession[]>>({});
  const [loadingSessions, setLoadingSessions] = useState<Record<string, boolean>>({});

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

  const toggleRoomExpansion = async (roomShareCode: string) => {
    const newExpanded = new Set(expandedRooms);
    
    if (newExpanded.has(roomShareCode)) {
      newExpanded.delete(roomShareCode);
    } else {
      newExpanded.add(roomShareCode);
      
      // Load chat sessions for this room if not already loaded
      if (!roomSessions[roomShareCode] && userInfo) {
        setLoadingSessions(prev => ({ ...prev, [roomShareCode]: true }));
        try {
          const sessions = await fetchRoomChatSessions(roomShareCode, userInfo.id);
          setRoomSessions(prev => ({ ...prev, [roomShareCode]: sessions }));
        } catch (error) {
          console.error('Error loading room sessions:', error);
        } finally {
          setLoadingSessions(prev => ({ ...prev, [roomShareCode]: false }));
        }
      }
    }
    
    setExpandedRooms(newExpanded);
  };

  const getDisplayName = () => {
    return userInfo?.full_name || userInfo?.email?.split('@')[0] || 'User';
  };

  const getSessionId = () => {
    return userInfo ? `auth_${userInfo.id}` : '';
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
              const isExpanded = expandedRooms.has(room.shareCode);
              const isExpiringSoon = new Date(room.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
              const sessions = roomSessions[room.shareCode] || [];
              const isLoadingSessions = loadingSessions[room.shareCode];
              
              return (
                <SidebarMenuItem key={room.id}>
                  <div className="w-full">
                    {/* Room Header */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRoomExpansion(room.shareCode)}
                        className="p-1 h-6 w-6 flex-shrink-0"
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </Button>
                      
                      <SidebarMenuButton 
                        asChild 
                        className={`flex-1 ${isActive && !currentChatSession ? 'bg-accent text-accent-foreground' : ''}`}
                      >
                        <Link 
                          href={userInfo ? 
                            `/chat/room/${room.shareCode}?displayName=${encodeURIComponent(getDisplayName())}&sessionId=${encodeURIComponent(getSessionId())}&threadId=${crypto.randomUUID()}` :
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
                    </div>

                    {/* Room Chat Sessions */}
                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-1">
                        {/* New Chat Button */}
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs h-8"
                        >
                          <Link 
                            href={userInfo ? 
                              `/chat/room/${room.shareCode}?displayName=${encodeURIComponent(getDisplayName())}&sessionId=${encodeURIComponent(getSessionId())}&threadId=${crypto.randomUUID()}` :
                              `/room/${room.shareCode}`
                            }
                            onClick={onRoomSelect}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            New Chat
                          </Link>
                        </Button>

                        {/* Loading State */}
                        {isLoadingSessions && (
                          <div className="text-xs text-muted-foreground p-2">
                            Loading chats...
                          </div>
                        )}

                        {/* Chat Sessions */}
                        {sessions.map((session) => {
                          const isSessionActive = currentChatSession === session.id;
                          const title = session.chat_title || 'Untitled Chat';
                          
                          return (
                            <Link
                              key={session.id}
                              href={userInfo ? 
                                `/chat/room/${room.shareCode}?displayName=${encodeURIComponent(getDisplayName())}&sessionId=${encodeURIComponent(getSessionId())}&chatSession=${session.id}` :
                                `/room/${room.shareCode}`
                              }
                              onClick={onRoomSelect}
                              className={`block w-full text-left p-2 rounded text-xs transition-colors border-l-2 ${
                                isSessionActive 
                                  ? 'bg-accent text-accent-foreground border-l-accent-foreground' 
                                  : 'hover:bg-accent/50 border-l-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{title}</span>
                              </div>
                              <div className="text-muted-foreground text-xs mt-1">
                                {new Date(session.updated_at).toLocaleDateString()}
                              </div>
                            </Link>
                          );
                        })}

                        {/* No Sessions Message */}
                        {!isLoadingSessions && sessions.length === 0 && (
                          <div className="text-xs text-muted-foreground p-2">
                            No chats yet
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