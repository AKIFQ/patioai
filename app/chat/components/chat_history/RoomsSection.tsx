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
import { Users, Crown, Clock, MessageSquare, Plus, ChevronDown, ChevronRight, AlertTriangle, Share2 } from 'lucide-react';
import { fetchRoomChatSessions } from '../../room/[shareCode]/fetch';
import ShareRoomModal from '../ShareRoomModal';
import { useSiteUrl } from '@/hooks/useSiteUrl';
import { useSocket } from '@/lib/client/socketManager';

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
  password: string;
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedRoomForShare, setSelectedRoomForShare] = useState<RoomPreview | null>(null);
  
  const params = useParams();
  const searchParams = useSearchParams();
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;
  const siteUrl = useSiteUrl();
  const socket = useSocket();

  const toggleRoomExpansion = async (shareCode: string) => {
    const newExpanded = new Set(expandedRooms);
    
    if (expandedRooms.has(shareCode)) {
      newExpanded.delete(shareCode);
    } else {
      newExpanded.add(shareCode);
      
      // CRITICAL: Only load chat sessions if we don't have ANY existing data (including real-time updates)
      const existingSessions = roomSessions[shareCode];
      if (!existingSessions && !loadingSessions[shareCode]) {
        console.log('📎 Loading sessions for room:', shareCode, '(no existing data)');
        setLoadingSessions(prev => ({ ...prev, [shareCode]: true }));
        try {
          const sessions = await fetchRoomChatSessions(shareCode);
          
          // CRITICAL: Merge with any real-time updates that arrived during loading
          setRoomSessions(prev => {
            const currentSessions = prev[shareCode] || [];
            
            // If we received real-time updates during loading, merge them
            if (currentSessions.length > 0) {
              console.log('🔄 Merging real-time updates with fetched sessions');
              const mergedSessions = [...currentSessions];
              
              // Add any sessions from API that aren't already in real-time updates
              sessions.forEach(apiSession => {
                if (!currentSessions.some(rtSession => rtSession.id === apiSession.id)) {
                  mergedSessions.push(apiSession);
                }
              });
              
              // Sort by creation date (newest first)
              mergedSessions.sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
              
              return { ...prev, [shareCode]: mergedSessions };
            } else {
              // No real-time updates, use API data
              return { ...prev, [shareCode]: sessions };
            }
          });
        } catch (error) {
          console.error('Failed to load room sessions:', error);
          // Don't overwrite existing real-time data on error
          if (!roomSessions[shareCode]) {
            setRoomSessions(prev => ({ ...prev, [shareCode]: [] }));
          }
        } finally {
          setLoadingSessions(prev => ({ ...prev, [shareCode]: false }));
        }
      } else if (existingSessions && existingSessions.length > 0) {
        console.log('✨ Room', shareCode, 'already has', existingSessions.length, 'sessions (including real-time updates)');
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

  const handleShareRoom = (room: RoomPreview) => {
    setSelectedRoomForShare(room);
    setShowShareModal(true);
  };

  // Real-time thread updates via custom event (handled by useSidebarSocket)
  useEffect(() => {
    const handleRoomThreadCreated = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🔥 RoomsSection: Received roomThreadCreated event:', data);
      
      const newThread: RoomChatSession = {
        id: data.threadId,
        chat_title: data.firstMessage && data.firstMessage.length > 50 
          ? data.firstMessage.substring(0, 50) + '...' 
          : data.firstMessage || `Chat by ${data.senderName}`,
        display_name: data.senderName,
        created_at: data.createdAt,
        updated_at: data.createdAt
      };
      
      // CRITICAL: Update roomSessions state with new thread (works for both expanded and collapsed rooms)
      setRoomSessions(prev => {
        const currentSessions = prev[data.shareCode] || [];
        
        // Check if thread already exists to avoid duplicates
        if (currentSessions.some(session => session.id === data.threadId)) {
          console.log('⚠️ Thread already exists, skipping duplicate:', data.threadId);
          return prev;
        }
        
        // Add new thread at the beginning (most recent first)
        const updatedSessions = [newThread, ...currentSessions];
        
        // CRITICAL: Also ensure the room is marked as having sessions loaded
        // This prevents fetchRoomChatSessions from overwriting our real-time update
        setLoadingSessions(loadingPrev => ({ ...loadingPrev, [data.shareCode]: false }));
        
        console.log(`✅ Added new thread ${data.threadId} to room ${data.shareCode} sidebar`);
        
        return {
          ...prev,
          [data.shareCode]: updatedSessions
        };
      });
    };

    // Listen for custom roomThreadCreated event dispatched by useSidebarSocket
    window.addEventListener('roomThreadCreated', handleRoomThreadCreated as EventListener);

    return () => {
      window.removeEventListener('roomThreadCreated', handleRoomThreadCreated as EventListener);
    };
  }, []);

  // Fallback: Periodic refresh for active rooms to catch any missed updates
  useEffect(() => {
    if (!socket?.isConnected) return;

    const refreshInterval = setInterval(() => {
      // Only refresh expanded rooms to avoid unnecessary API calls
      expandedRooms.forEach(async (shareCode) => {
        try {
          const sessions = await fetchRoomChatSessions(shareCode);
          setRoomSessions(prev => {
            const currentSessions = prev[shareCode] || [];
            
            // Only update if we got more sessions than we currently have
            if (sessions.length > currentSessions.length) {
              console.log(`🔄 Fallback refresh found ${sessions.length - currentSessions.length} new threads for room ${shareCode}`);
              return { ...prev, [shareCode]: sessions };
            }
            
            return prev;
          });
        } catch (error) {
          console.warn('Fallback refresh failed for room:', shareCode, error);
        }
      });
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [expandedRooms, socket?.isConnected]);

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
                            <Badge variant="outline" className="text-xs px-1 py-0 border-blue-300 text-blue-600">
                              🔒 Protected
                            </Badge>
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

                      {/* Share Button */}
                      {!isExpired && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 h-6 w-6 hover:bg-blue-100 hover:text-blue-600"
                          onClick={() => handleShareRoom(room)}
                          title="Share room"
                        >
                          <Share2 className="h-3 w-3" />
                        </Button>
                      )}
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
                            <div key={session.id} className="space-y-1">
                              <SidebarMenuButton
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

                            </div>
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

      {/* Share Room Modal */}
      {showShareModal && selectedRoomForShare && (
        <ShareRoomModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSelectedRoomForShare(null);
          }}
          room={{
            id: selectedRoomForShare.id,
            name: selectedRoomForShare.name,
            shareCode: selectedRoomForShare.shareCode,
            maxParticipants: selectedRoomForShare.maxParticipants,
            tier: selectedRoomForShare.tier,
            expiresAt: selectedRoomForShare.expiresAt,
            createdAt: new Date().toISOString(), // We don't have this in RoomPreview, so use current time
            password: selectedRoomForShare.password
          }}
          shareableLink={`${siteUrl}/room/${selectedRoomForShare.shareCode}`}
        />
      )}
    </SidebarGroup>
  );
}