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
const fetchRooms = async () => {
  const response = await fetch('/api/rooms');
  if (!response.ok) {
    throw new Error('Failed to fetch rooms');
  }
  const data = await response.json();
  return data.rooms || [];
};

// Function to fetch room chat data
const fetchRoomChats = async () => {
  const response = await fetch('/api/rooms?includeChats=true');
  if (!response.ok) {
    throw new Error('Failed to fetch room chats');
  }
  const data = await response.json();
  return data.roomChatsData || [];
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
    'rooms', // Always use consistent key
    userInfo.email ? fetchRooms : () => Promise.resolve([]), // Conditional function instead of conditional key
    {
      fallbackData: rooms,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  // Add SWR for room chat data with real-time updates
  const { data: currentRoomChatsData, mutate: mutateRoomChats } = useSWR(
    'roomChats',
    userInfo.email ? fetchRoomChats : () => Promise.resolve([]),
    {
      fallbackData: roomChatsData,
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

  const handleRoomCreated = useCallback(() => {
    // Refresh the rooms list when a new room is created
    mutateRooms();
  }, [mutateRooms]);

  const handleThreadCreated = useCallback(() => {
    // Refresh room chat data when a new thread is created
    mutateRoomChats();
  }, [mutateRoomChats]);

  // Listen for room thread creation events from sidebar socket
  React.useEffect(() => {
    const handleRoomThreadCreated = () => {
      console.log('Received room thread created event, refreshing room chat data');
      mutateRoomChats();
    };

    // Listen for custom event from sidebar socket
    window.addEventListener('roomThreadCreated', handleRoomThreadCreated);

    return () => {
      window.removeEventListener('roomThreadCreated', handleRoomThreadCreated);
    };
  }, [mutateRoomChats]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleRoomSelect = () => {
    // Room selection is handled by navigation
    handleChatSelect();
  };

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
      (currentRoomChatsData || []).forEach((msg: any) => {
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
            if (title.length > 30) {
              title = title.substring(0, 30) + '...';
            }
          }

          allRoomThreads.push({
            id: threadId,
            firstMessage: title,
            created_at: firstMsg.created_at,
            type: 'room' as const,
            roomName: roomData.name,
            shareCode: roomData.shareCode
          });
        }
      });

      // Sort by latest message time
      allRoomThreads.sort((a, b) => {
        const timeA = threadLatestTimes.get(a.id) || a.created_at;
        const timeB = threadLatestTimes.get(b.id) || b.created_at;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      return allRoomThreads;
    } else {
      // Room context: Show only threads for the current room
      const roomThreads: any[] = [];
      const threadFirstMessages = new Map();
      const threadLatestTimes = new Map();

      // Find the current room
      const currentRoom = (currentRooms || []).find((room: any) => room.shareCode === currentRoomShareCode);

      if (currentRoom) {
        // Group room messages by thread_id for the current room
        (currentRoomChatsData || []).forEach((msg: any) => {
          if (msg.room_id === currentRoom.id && msg.thread_id && !msg.is_ai_response) {
            if (!threadFirstMessages.has(msg.thread_id)) {
              threadFirstMessages.set(msg.thread_id, msg);
            }
          }
          // Track latest message time for each thread
          if (msg.room_id === currentRoom.id && msg.thread_id) {
            const currentLatest = threadLatestTimes.get(msg.thread_id);
            if (!currentLatest || new Date(msg.created_at) > new Date(currentLatest)) {
              threadLatestTimes.set(msg.thread_id, msg.created_at);
            }
          }
        });

        // Create sidebar entries for each thread in the current room
        threadFirstMessages.forEach((firstMsg, threadId) => {
          // Use the first few words of the first user message as the title
          let title = 'New Chat';
          if (firstMsg.content) {
            const words = firstMsg.content.trim().split(/\s+/);
            title = words.slice(0, 4).join(' ');
            if (title.length > 30) {
              title = title.substring(0, 30) + '...';
            }
          }

          roomThreads.push({
            id: threadId,
            firstMessage: title,
            created_at: firstMsg.created_at,
            type: 'room' as const,
            roomName: currentRoom.name,
            shareCode: currentRoom.shareCode
          });
        });

        // Sort by latest message time
        roomThreads.sort((a, b) => {
          const timeA = threadLatestTimes.get(a.id) || a.created_at;
          const timeB = threadLatestTimes.get(b.id) || b.created_at;
          return new Date(timeB).getTime() - new Date(timeA).getTime();
        });
      }

      return roomThreads;
    }
  }, [currentRoomShareCode, currentRoomChatsData, currentRooms]);

  // Minimized sidebar - Clean and minimal
  if (!sidebarOpen) {
    return (
      <div className="h-full border-r border-border/40 w-[50px] flex-shrink-0 bg-background/80 backdrop-blur-md flex flex-col items-center py-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                className="h-8 w-8 mb-3 hover:bg-muted/70 transition-colors"
                aria-label="Open sidebar"
              >
                <Menu size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Open sidebar</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator className="w-6 my-3 opacity-30" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                asChild
                aria-label="Start new chat"
                className="h-8 w-8 mb-2 hover:bg-muted/70 transition-colors"
              >
                <a href="/chat">
                  <FilePlus size={16} />
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
                size="sm"
                onClick={() => setIsCreateGroupModalOpen(true)}
                aria-label="Create room"
                className="h-8 w-8 mb-2 hover:bg-muted/70 transition-colors"
              >
                <Users size={16} />
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
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="h-8 w-8 mb-2 hover:bg-muted/70 transition-colors"
                aria-label="Chat mode"
              >
                <MessageSquare size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Chat history</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

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
        className="h-full border-r border-border/40 w-0 md:w-[240px] lg:w-[280px] flex-shrink-0 flex flex-col bg-background/80 backdrop-blur-md"
      >
        <SidebarHeader className="px-5 py-4 border-b border-border/40 gap-0">
          {/* PatioAI Logo - Larger with more spacing */}
          <div className="flex items-center justify-between mb-5 mt-2">
            <div className="ml-2">
              <Image
                src="/logos/logo-horizontal.png"
                alt="PatioAI"
                width={100}
                height={24}
                priority
                className="opacity-90"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/70 transition-colors"
              aria-label="Close sidebar"
            >
              <PanelLeftIcon size={14} />
            </Button>
          </div>

          {/* Personal Chat Button - Aligned with ROOMS */}
          <Button
            asChild
            variant="ghost"
            className="w-full justify-start h-8 mb-6 ml-2 hover:bg-muted/70 transition-colors text-sm font-medium"
            size="sm"
          >
            <Link href="/chat">
              Personal Chat
            </Link>
          </Button>

          {/* ROOMS Header - Compact */}
          <div className="flex items-center justify-between mb-1 ml-2">
            <h2 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Rooms</h2>
          </div>

          {/* Room Action Buttons - Compact */}
          <div className="flex gap-2 ml-2">
            <Button
              onClick={() => setIsCreateGroupModalOpen(true)}
              className="flex-1 h-7 text-xs font-medium"
              size="sm"
              variant="ghost"
            >
              <Users size={13} className="mr-1.5" />
              New
            </Button>
            <Button
              onClick={() => setIsJoinRoomModalOpen(true)}
              className="flex-1 h-7 text-xs font-medium"
              size="sm"
              variant="outline"
            >
              <Users size={13} className="mr-1.5" />
              Join
            </Button>
          </div>
        </SidebarHeader>

        {/* Rooms List - Clean scrollable section */}
        <div className="flex-1 overflow-y-auto border-b border-border/40">
          <div className="px-4 py-2">
            {!userInfo.email ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-muted-foreground/80">Sign in to view rooms</p>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="/signin">Sign in</Link>
                </Button>
              </div>
            ) : isLoadingRooms ? (
              <div className="text-center py-6">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-3 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground/80">Loading rooms...</p>
              </div>
            ) : currentRooms.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground/80">No rooms yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Create your first room above</p>
              </div>
            ) : (
              <div className="space-y-1">
                {currentRooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/chat/room/${room.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${crypto.randomUUID()}`}
                    onClick={handleRoomSelect}
                    className={`block w-full text-left p-3 rounded-lg transition-colors ${currentRoomShareCode === room.shareCode
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/60'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-medium text-sm truncate">{room.name}</span>
                      {room.isCreator && (
                        <Crown className="h-3 w-3 text-amber-500 ml-auto" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                      <span>{room.participantCount} online</span>
                      <span className="px-1.5 py-0.5 bg-muted/50 rounded text-xs font-medium">
                        {room.tier}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat History - Clean bottom section */}
        <div className="h-[40%] flex flex-col">
          <div className="px-4 py-1.5 border-b border-border/40 bg-muted/20">
            <h3 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide ml-2">
              {currentRoomShareCode ? 'Room Threads' : 'Recent Chats'}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {currentRoomShareCode ? (
              <div className="px-4 py-2">
                {processedThreads.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground/80">No chat threads yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Start a new conversation!</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {processedThreads.map((thread: any) => (
                      <Link
                        key={thread.id}
                        href={`/chat/room/${thread.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.id}`}
                        onClick={handleChatSelect}
                        className="block p-2.5 rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <div className="text-xs text-muted-foreground/70 mb-1">
                          {new Date(thread.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric'
                          })} {thread.roomName && `• ${thread.roomName}`}
                        </div>
                        <div className="text-sm text-foreground font-medium truncate">
                          {thread.firstMessage}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-2">
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
                    <div className="mt-4 mb-1 ml-2">
                      <h4 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
                        Room Threads
                      </h4>
                    </div>
                    <div className="space-y-1">
                      {processedThreads.map((thread: any) => (
                        <Link
                          key={thread.id}
                          href={`/chat/room/${thread.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.id}`}
                          onClick={handleChatSelect}
                          className="block p-2.5 rounded-lg hover:bg-muted/60 transition-colors"
                        >
                          <div className="text-xs text-muted-foreground/70 mb-1">
                            {thread.roomName} • {new Date(thread.created_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-sm text-foreground font-medium truncate">
                            {thread.firstMessage}
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
