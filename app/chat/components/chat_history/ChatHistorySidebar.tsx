'use client';
import React, { type FC, useState, useCallback } from 'react';
import { fetchMoreChatPreviews } from '../../actions';
import { useParams, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  useSidebar
} from '@/components/ui/sidebar';
import {
  Menu,
  FileText,
  MessageSquare,
  PanelLeftIcon,
  FilePlus,
  Loader2,
  Users,
  Crown
} from 'lucide-react';
import Link from 'next/link';
import type { Tables } from '@/types/database';
import ChatHistorySection from './ChatHistorySection';
import FilesSection from './FilesSection';
import RoomsSection from './RoomsSection';
import UploadPage from './FileUpload';
import CreateRoomModal from '../CreateRoomModal';
import JoinRoomModal from '../JoinRoomModal';
import ChatSidebarFooter from './SidebarFooter';

type UserInfo = Pick<Tables<'users'>, 'full_name' | 'email' | 'id'>;
type UserDocument = Pick<
  Tables<'user_documents'>,
  'id' | 'title' | 'created_at' | 'total_pages' | 'filter_tags'
>;
interface ChatPreview {
  id: string;
  firstMessage: string;
  created_at: string;
  type?: 'regular' | 'room';
  roomName?: string;
  shareCode?: string;
}

interface CategorizedChats {
  today: ChatPreview[];
  yesterday: ChatPreview[];
  last7Days: ChatPreview[];
  last30Days: ChatPreview[];
  last2Months: ChatPreview[];
  older: ChatPreview[];
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

interface CombinedDrawerProps {
  userInfo: UserInfo;
  initialChatPreviews: ChatPreview[];
  categorizedChats: CategorizedChats;
  documents: UserDocument[];
  rooms?: RoomPreview[];
  roomChatsData?: any[];
}

// Function to fetch rooms
const fetchRooms = async (): Promise<RoomPreview[]> => {
  const response = await fetch('/api/rooms');
  if (!response.ok) {
    throw new Error('Failed to fetch rooms');
  }
  const data = await response.json();
  return data.rooms || [];
};

const CombinedDrawer: FC<CombinedDrawerProps> = ({
  userInfo,
  initialChatPreviews,
  categorizedChats,
  documents,
  rooms = [],
  roomChatsData = []
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [isJoinRoomModalOpen, setIsJoinRoomModalOpen] = useState(false);

  // Use SWR to manage room data with fallback to initial rooms
  const { data: currentRooms, mutate: mutateRooms, isLoading: isLoadingRooms } = useSWR(
    userInfo.email ? 'rooms' : null,
    fetchRooms,
    {
      fallbackData: rooms,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  const params = useParams();
  const searchParams = useSearchParams();
  const currentChatId = typeof params.id === 'string' ? params.id : undefined;
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;
  const { setOpenMobile } = useSidebar();

  // Only chat data needs infinite loading
  const {
    data: chatPreviews,
    mutate: mutateChatPreviews,
    isValidating: isLoadingMore,
    size,
    setSize
  } = useSWRInfinite(
    (index) => [`chatPreviews`, index],
    async ([_, index]) => {
      const offset = index * 25;
      const newChatPreviews = await fetchMoreChatPreviews(offset);
      return newChatPreviews;
    },
    {
      fallbackData: [initialChatPreviews],
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: false
    }
  );

  const hasMore =
    chatPreviews && chatPreviews[chatPreviews.length - 1]?.length === 30;

  const loadMoreChats = useCallback(async () => {
    if (!isLoadingMore) {
      await setSize(size + 1);
    }
  }, [isLoadingMore, setSize, size]);

  const handleChatSelect = useCallback(() => {
    if (window.innerWidth < 1200) {
      setOpenMobile(false);
    }
  }, [setOpenMobile]);

  // Process room threads based on current context
  const processedThreads = React.useMemo(() => {
    if (!currentRoomShareCode) {
      // Home context: Show all room threads grouped by room
      const roomsLookup = new Map();
      (currentRooms || []).forEach((room: any) => {
        roomsLookup.set(room.id, room);
      });

      const threadFirstMessages = new Map();
      const threadLatestTimes = new Map();
      
      // Group room messages by thread_id and find the first user message for each thread
      (roomChatsData || []).forEach((msg: any) => {
        if (msg.thread_id && !msg.is_ai_response) {
          if (!threadFirstMessages.has(msg.thread_id)) {
            threadFirstMessages.set(msg.thread_id, msg);
          }
        }
        // Track latest message time for each thread
        if (msg.thread_id) {
          const currentLatest = threadLatestTimes.get(msg.thread_id);
          if (!currentLatest || new Date(msg.created_at) > new Date(currentLatest)) {
            threadLatestTimes.set(msg.thread_id, msg.created_at);
          }
        }
      });
      
      // Create sidebar entries for each thread
      const allRoomThreads: any[] = [];
      threadFirstMessages.forEach((firstMsg, threadId) => {
        const roomData = roomsLookup.get(firstMsg.room_id);
        
        if (roomData && roomData.shareCode) {
          // Use the first few words of the first user message as the title
          let title = 'New Chat';
          if (firstMsg.content) {
            const words = firstMsg.content.trim().split(/\s+/);
            title = words.slice(0, 4).join(' ');
            if (words.length > 4) title += '...';
          }
          
          allRoomThreads.push({
            id: `room_thread_${threadId}`,
            title,
            created_at: threadLatestTimes.get(threadId) || firstMsg.created_at,
            roomName: roomData.name,
            shareCode: roomData.shareCode,
            threadId: threadId
          });
        }
      });

      return allRoomThreads.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else {
      // Room context: Show only threads for current room
      const currentRoom = (currentRooms || []).find((room: any) => room.shareCode === currentRoomShareCode);
      
      if (!currentRoom) {
        return [];
      }

      const threadFirstMessages = new Map();
      const threadLatestTimes = new Map();
      
      // Filter messages for current room only
      (roomChatsData || [])
        .filter((msg: any) => msg.room_id === currentRoom.id)
        .forEach((msg: any) => {
          if (msg.thread_id && !msg.is_ai_response) {
            if (!threadFirstMessages.has(msg.thread_id)) {
              threadFirstMessages.set(msg.thread_id, msg);
            }
          }
          // Track latest message time for each thread
          if (msg.thread_id) {
            const currentLatest = threadLatestTimes.get(msg.thread_id);
            if (!currentLatest || new Date(msg.created_at) > new Date(currentLatest)) {
              threadLatestTimes.set(msg.thread_id, msg.created_at);
            }
          }
        });
      
      // Create sidebar entries for current room's threads
      const roomThreads: any[] = [];
      threadFirstMessages.forEach((firstMsg, threadId) => {
        // Use the first few words of the first user message as the title
        let title = 'New Chat';
        if (firstMsg.content) {
          const words = firstMsg.content.trim().split(/\s+/);
          title = words.slice(0, 4).join(' ');
          if (words.length > 4) title += '...';
        }
        
        roomThreads.push({
          id: `room_thread_${threadId}`,
          title,
          created_at: threadLatestTimes.get(threadId) || firstMsg.created_at,
          threadId: threadId,
          senderName: firstMsg.sender_name
        });
      });

      return roomThreads.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  }, [currentRoomShareCode, roomChatsData, currentRooms]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleRoomSelect = () => {
    // Room selection is handled by navigation
    handleChatSelect();
  };

  // Minimized sidebar when closed
  if (!sidebarOpen) {
    return (
      <div className="h-full border-r border-border w-[50px] flex-shrink-0 bg-background flex flex-col items-center py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="mb-2"
                aria-label="Open sidebar"
              >
                <Menu size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Open sidebar</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator className="w-4/5 my-2" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Start new chat"
                className="my-2"
              >
                <a href="/chat">
                  <FilePlus size={20} />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCreateGroupModalOpen(true)}
                aria-label="Create room"
                className="my-2"
              >
                <Users size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Create room</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="my-2"
                aria-label="Chat mode"
              >
                <MessageSquare size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Chat history</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  const handleRoomCreated = useCallback(() => {
    // Refresh the rooms list when a new room is created
    mutateRooms();
  }, [mutateRooms]);

  return (
    <>
      <CreateRoomModal 
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onRoomCreated={handleRoomCreated}
      />
      
      <JoinRoomModal 
        isOpen={isJoinRoomModalOpen}
        onClose={() => setIsJoinRoomModalOpen(false)}
      />
      <Sidebar
        collapsible="none"
        className="h-full border-r border-border w-0 md:w-[240px] lg:w-[280px] flex-shrink-0 flex flex-col"
      >
        <SidebarHeader className="px-3 !py-0 !gap-0 border-b">
          {/* PatioAI Logo - At the very top */}
          <div className="flex items-center justify-between ">
            <Image
              src="/logos/logo-horizontal.png"
              alt="PatioAI"
              width={90}
              height={40}
              priority
              className="rounded-lg"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close sidebar"
            >
              <PanelLeftIcon size={16} />
            </Button>
          </div>
          
          {/* Home Chat Button - Below logo */}
          <Button 
            asChild
            variant="outline"
            className="w-full mb-3"
            size="sm"
          >
            <Link href="/chat">
              <MessageSquare size={16} className="mr-2" />
              Home Chat
            </Link>
          </Button>
          
          {/* ROOMS Header with close button */}
          <div className="flex items-center justify-between w-full mb-2">
            <h2 className="text-sm font-semibold">ROOMS</h2>
          </div>
          
          {/* Room Action Buttons - Below ROOMS header */}
          <div className="flex items-center space-x-2 px-3 mb-2">
            <Button
              onClick={() => setIsCreateGroupModalOpen(true)}
              className="flex-1"
              size="sm"
            >
              <Users size={16} className="mr-1" />
              New
            </Button>
            <Button
              onClick={() => setIsJoinRoomModalOpen(true)}
              className="flex-1"
              size="sm"
              variant="outline"
            >
              <Users size={16} className="mr-1" />
              Join
            </Button>
          </div>
        </SidebarHeader>

        {/* Rooms List - Top Section (Scrollable) */}
        <div className="flex-1 overflow-y-auto border-b">
          <div className="p-2">
            {!userInfo.email ? (
              <div className="text-center p-4 space-y-2">
                <p className="text-sm text-muted-foreground">Sign in to view rooms</p>
                <Button asChild size="sm">
                  <Link href="/signin">Sign in</Link>
                </Button>
              </div>
            ) : isLoadingRooms ? (
              <div className="text-center p-4">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading rooms...</p>
              </div>
            ) : currentRooms.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-sm text-muted-foreground">No rooms yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first room above</p>
              </div>
            ) : (
              <div className="space-y-1">
                {currentRooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/chat/room/${room.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}`}
                    onClick={handleRoomSelect}
                    className={`block w-full text-left p-3 rounded-lg border transition-colors ${
                      currentRoomShareCode === room.shareCode
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'hover:bg-muted/50 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="font-medium text-sm truncate">{room.name}</span>
                      {room.isCreator && (
                        <Crown className="h-3 w-3 text-yellow-500 ml-auto" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{room.participantCount}/{room.maxParticipants} users</span>
                      <span className="capitalize">{room.tier}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat History - Bottom Section (Scrollable) */}
        <div className="h-[40%] flex flex-col">
          <div className="p-2 border-b bg-muted/30">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {currentRoomShareCode ? 'ROOM THREADS' : 'CHATS & THREADS'}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {currentRoomShareCode ? (
              <div className="p-2">
                {processedThreads.length === 0 ? (
                  <div className="text-center p-4">
                    <p className="text-sm text-muted-foreground">No chat threads yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Start a new conversation!</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {processedThreads.map((thread: any) => (
                      <Link
                        key={thread.id}
                        href={`/chat/room/${currentRoomShareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.threadId}`}
                        onClick={handleChatSelect}
                        className="block p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-xs text-muted-foreground mb-1">
                          {new Date(thread.created_at).toLocaleDateString([], { 
                            month: 'short',
                            day: 'numeric'
                          })} {thread.senderName && `• ${thread.senderName}`}
                        </div>
                        <div className="text-sm text-foreground">
                          {thread.title}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2">
                {/* Personal Chats */}
                <ChatHistorySection
                  initialChatPreviews={initialChatPreviews}
                  categorizedChats={categorizedChats}
                  currentChatId={currentChatId}
                  searchParams={searchParams}
                  onChatSelect={handleChatSelect}
                  mutateChatPreviews={mutateChatPreviews}
                />
                
                {/* Room Threads */}
                {processedThreads.length > 0 && (
                  <>
                    <div className="mt-4 mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        ROOM THREADS
                      </h4>
                    </div>
                    <div className="space-y-1">
                      {processedThreads.map((thread: any) => (
                        <Link
                          key={thread.id}
                          href={`/chat/room/${thread.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.threadId}`}
                          onClick={handleChatSelect}
                          className="block p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="text-xs text-muted-foreground mb-1">
                            {thread.roomName} • {new Date(thread.created_at).toLocaleDateString([], { 
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-sm text-foreground">
                            {thread.title}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Settings Footer - Like ChatGPT */}
        <ChatSidebarFooter userInfo={userInfo} />
      </Sidebar>
    </>
  );
};

export default CombinedDrawer;
