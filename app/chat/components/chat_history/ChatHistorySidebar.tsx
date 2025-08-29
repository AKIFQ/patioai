'use client';
import React, { type FC, useState, useCallback, useEffect, createContext, useContext } from 'react';
import { fetchMoreChatPreviews } from '../../actions';
import { useParams, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
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
  Crown,
  X
} from 'lucide-react';
import Link from 'next/link';
import type { Tables } from '@/types/database';
import ChatHistorySection from './ChatHistorySection';
import FilesSection from './FilesSection';
import RoomsSection from './RoomsSection';
import UploadPage from './FileUpload';
import { useModalContext } from '../../contexts/ModalContext';
import ChatSidebarFooter from './SidebarFooter';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';

// Mobile Sidebar Context
interface MobileSidebarContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextType | null>(null);

export const useMobileSidebar = () => {
  const context = useContext(MobileSidebarContext);
  if (!context) {
    throw new Error('useMobileSidebar must be used within a MobileSidebarProvider');
  }
  return context;
};

export const MobileSidebarProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <MobileSidebarContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </MobileSidebarContext.Provider>
  );
};

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
  userInfo: UserInfo | null;
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

// Function to fetch room threads for anonymous users
const fetchRoomThreadsForAnonymous = async (shareCode: string, displayName: string) => {
  const response = await fetch(`/api/rooms/${shareCode}/threads?displayName=${encodeURIComponent(displayName)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch room threads');
  }
  const data = await response.json();
  return {
    threads: data.threads || [],
    room: data.room
  };
};

const CombinedDrawer: FC<CombinedDrawerProps> = ({
  userInfo,
  initialChatPreviews,
  categorizedChats,
  documents,
  rooms = [],
  roomChatsData = []
}) => {
  // Get mobile state and sidebar context (single source of truth)
  const isMobile = useIsMobile();
  const { setOpen, openMobile, setOpenMobile, open, toggleSidebar: toggleSidebarCtx } = useSidebar();
  // Use unified sidebar context for mobile open/close
  const isMobileSidebarOpen = openMobile;
  const closeMobileSidebar = useCallback(() => setOpenMobile(false), [setOpenMobile]);
  const router = useRouter();
  // Safe user params for links
  const safeUserId = userInfo?.id || 'anon';
  const safeUserDisplay = userInfo?.full_name || userInfo?.email?.split('@')[0] || 'User';
  const encodedDisplayName = encodeURIComponent(safeUserDisplay);
  const encodedSessionId = encodeURIComponent(`auth_${safeUserId}`);
  
  // Get global modal context
  const { openCreateRoomModal, openJoinRoomModal } = useModalContext();



  // Auto-collapse sidebar on mobile only; don't force open on desktop
  useEffect(() => {
    if (isMobile) {
      setOpen(false);
    }
  }, [isMobile, setOpen]);



  // Use SWR to manage room data with fallback to initial rooms
  const { data: currentRooms, mutate: mutateRooms, isLoading: isLoadingRooms } = useSWR(
    (userInfo && userInfo.email) ? 'rooms' : null, // Only fetch for authenticated users
    (userInfo && userInfo.email) ? fetchRooms : null,
    {
      fallbackData: rooms,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  // Add SWR for room chat data with real-time updates
  const { data: currentRoomChatsData, mutate: mutateRoomChats } = useSWR(
    (userInfo && userInfo.email) ? 'roomChats' : null, // Only fetch for authenticated users
    (userInfo && userInfo.email) ? fetchRoomChats : null,
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
  const displayName = searchParams.get('displayName');

  // Add SWR for anonymous room threads when in room context
  const { data: anonymousRoomData, mutate: mutateAnonymousThreads } = useSWR(
    (!userInfo?.email && currentRoomShareCode && displayName) 
      ? `anonymousRoomThreads_${currentRoomShareCode}_${displayName}` 
      : null,
    (!userInfo?.email && currentRoomShareCode && displayName) 
      ? () => fetchRoomThreadsForAnonymous(currentRoomShareCode, displayName)
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

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
    if (isMobile) {
      closeMobileSidebar();
    }
  }, [isMobile, closeMobileSidebar]);

  const handleRoomCreated = useCallback(() => {
    // Refresh the rooms list when a new room is created
    mutateRooms();
  }, [mutateRooms]);

  const handleThreadCreated = useCallback(() => {
    // Refresh room chat data when a new thread is created
    mutateRoomChats();
    // Also refresh anonymous room threads if applicable
    if (!userInfo?.email && currentRoomShareCode && displayName) {
      mutateAnonymousThreads();
    }
  }, [mutateRoomChats, mutateAnonymousThreads, userInfo, currentRoomShareCode, displayName]);

  // Define available rooms for use in multiple places
  // For anonymous users in room context, include the fetched room data
  const availableRooms = React.useMemo(() => {
    if (userInfo && userInfo.email) {
      return currentRooms || [];
    } else {
      const baseRooms = rooms || [];
      // If we have anonymous room data, ensure the current room is included
      if (anonymousRoomData?.room && currentRoomShareCode) {
        const existingRoom = baseRooms.find((room: any) => 
          (room.shareCode || room.share_code) === currentRoomShareCode
        );
        if (!existingRoom) {
          return [...baseRooms, {
            id: anonymousRoomData.room.id,
            name: anonymousRoomData.room.name,
            shareCode: anonymousRoomData.room.shareCode,
            share_code: anonymousRoomData.room.shareCode,
            tier: 'free', // Default for anonymous users
            participantCount: 1,
            maxParticipants: 10,
            isCreator: false
          }];
        }
      }
      return baseRooms;
    }
  }, [userInfo, currentRooms, rooms, anonymousRoomData, currentRoomShareCode]);

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

  const toggleSidebar = () => toggleSidebarCtx();

  const handleRoomSelect = () => {
    // Room selection is handled by navigation
    handleChatSelect();
  };

  // Process room threads based on current context
  const processedThreads = React.useMemo(() => {
    // Use appropriate data source based on user authentication
    const availableRooms = (userInfo && userInfo.email) ? (currentRooms || []) : (rooms || []);
    const availableRoomChatsData = (userInfo && userInfo.email) ? (currentRoomChatsData || []) : (roomChatsData || []);

    if (!currentRoomShareCode) {
      // Home context: Show all room threads grouped by room
      const roomsLookup = new Map();
      availableRooms.forEach((room: any) => {
        roomsLookup.set(room.id, room);
      });

      const threadFirstMessages = new Map();
      const threadLatestTimes = new Map();

      // Group room messages by thread_id and find the first user message for each thread
      availableRoomChatsData.forEach((msg: any) => {
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

        if (roomData && (roomData.shareCode || roomData.share_code)) {
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
            shareCode: roomData.shareCode || roomData.share_code
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
      
      // For anonymous users, use the fetched thread data directly
      if (!userInfo?.email && anonymousRoomData?.threads) {
        return anonymousRoomData.threads.map((thread: any) => ({
          id: thread.threadId,
          firstMessage: thread.firstMessage,
          created_at: thread.createdAt,
          type: 'room' as const,
          roomName: anonymousRoomData.room?.name || 'Room',
          shareCode: currentRoomShareCode
        }));
      }

      // For authenticated users, process room chat data
      const roomThreads: any[] = [];
      const threadFirstMessages = new Map();
      const threadLatestTimes = new Map();

      const currentRoom = availableRooms.find((room: any) => 
        (room.shareCode || room.share_code) === currentRoomShareCode
      );

      if (currentRoom) {
        // Group room messages by thread_id for the current room
        availableRoomChatsData.forEach((msg: any) => {
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
            shareCode: currentRoom.shareCode || currentRoom.share_code
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
  }, [currentRoomShareCode, currentRoomChatsData, currentRooms, rooms, roomChatsData, userInfo, anonymousRoomData]);

  // On mobile, reuse the SAME sidebar as an overlay, controlled by the shared context
  // We render the sidebar only when open to avoid layout shift
  const mobileOverlay = isMobile ? (
    <div
      className={`fixed inset-0 z-[100] md:hidden transition-opacity duration-300 ease-out ${
        isMobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isMobileSidebarOpen}
    >
      <div 
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${
          isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'
        }`} 
        onClick={closeMobileSidebar} 
      />
    </div>
  ) : null;

  // Minimized sidebar - Only show on desktop when collapsed
  if (!open && !isMobile) {
    return (
      <div className="h-full border-r-0 shadow-elevation-1 w-[50px] flex-shrink-0 bg-sidebar flex flex-col items-center py-3 hidden md:flex transform transition-smooth">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                className="h-8 w-8 mb-3 rounded-full transition-smooth hover:scale-105 active:scale-95"
                aria-label="Open sidebar"
              >
                <Menu size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Open sidebar</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator className="w-6 my-2 opacity-30" />

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
                onClick={openCreateRoomModal}
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
                onClick={() => setOpen(true)}
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

  // Don't render anything on mobile when the mobile sidebar context is closed
  if (isMobile && !isMobileSidebarOpen) {
    return null;
  }

  return (
    <>
      {mobileOverlay}
      <Sidebar
        collapsible="none"
        className={`h-full border-r-0 shadow-elevation-2 w-0 md:w-[240px] lg:w-[280px] flex-shrink-0 flex flex-col bg-sidebar ${
          isMobile 
            ? `fixed left-0 top-0 bottom-0 w-[280px] z-[101] mobile-sidebar sidebar-slide sidebar-transition transition-transform duration-300 ease-out ${
                isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }` 
            : 'sidebar-slide'
        }`}
      >
        <SidebarHeader className="px-3 sm:px-4 lg:px-5 py-4 sm:py-5 border-b-0 bg-sidebar gap-0">
          {/* PatioAI Logo - Larger with more spacing */}
          <div className="flex items-center justify-between mb-4 sm:mb-5 mt-1 sm:mt-2">
            <div className="ml-1 sm:ml-2">
              <Image
                src="/logos/logo-horizontal.png"
                alt="PatioAI"
                width={100}
                height={24}
                priority
                className="opacity-90 dark:filter-none filter-[brightness(0.7)]"
                style={{ width: 'auto', height: 'auto' }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isMobile) {
                  setOpenMobile(false);
                } else {
                  toggleSidebar();
                }
              }}
              className="h-7 w-7 rounded-full text-muted-foreground/70 hover:text-foreground transition-smooth hover:scale-105 active:scale-95"
              aria-label="Close sidebar"
            >
              <PanelLeftIcon size={14} />
            </Button>
          </div>

          {/* Personal Chat Button - Modern floating style */}
          <Button
            asChild
            variant="ghost"
            className="w-full justify-start h-10 mb-4 sm:mb-6 ml-1 sm:ml-2 rounded-xl 
                       bg-[var(--elevation-1)] hover:bg-[var(--elevation-2)] 
                       transition-smooth text-body font-medium shadow-elevation-1 hover:shadow-elevation-2
                       border-0 text-gradient"
            size="sm"
          >
            <Link href="/chat">
              <MessageSquare size={16} className="mr-2" />
              Personal Chat
            </Link>
          </Button>

          {/* ROOMS Header - Modern styling */}
          <div className="mb-3 pb-3 ml-1 sm:ml-2 relative">
            <h2 className="text-caption font-semibold text-gradient opacity-90 flex items-center gap-2">
              <Users size={14} className="opacity-70" />
              Rooms
            </h2>
            <div className="absolute bottom-0 left-0 right-4 h-px bg-gradient-to-r from-[var(--elevation-3)] to-transparent opacity-50"></div>
          </div>

          {/* Room Action Buttons - Modern floating style */}
          <div className="flex gap-2 ml-1 sm:ml-2">
            <Button
              onClick={openCreateRoomModal}
              className="flex-1 h-8 text-small font-medium rounded-lg 
                         bg-[var(--elevation-1)] hover:bg-[var(--elevation-2)] 
                         transition-smooth shadow-elevation-1 hover:shadow-elevation-2 border-0
                         text-gradient"
              size="sm"
              variant="ghost"
            >
              <Users size={14} className="mr-1.5" />
              New
            </Button>
            <Button
              onClick={openJoinRoomModal}
              className="flex-1 h-8 text-small font-medium rounded-lg
                         bg-[var(--elevation-1)] hover:bg-[var(--elevation-2)] 
                         transition-smooth shadow-elevation-1 hover:shadow-elevation-2 border-0
                         text-gradient"
              size="sm"
              variant="outline"
            >
              <Users size={13} className="mr-1 sm:mr-1.5" />
              Join
            </Button>
          </div>
        </SidebarHeader>


        {/* Rooms List - Clean scrollable section */}
        <div className="border-b border-border">
          <div className="px-3 sm:px-4 py-2">
            {!userInfo?.email ? (
              // For anonymous users, show current room if in room context, otherwise show sign in prompt
              currentRoomShareCode ? (
                <div className="max-h-32 overflow-y-auto">
                  <div className="space-y-1">
                    {availableRooms.filter((room: any) => 
                      (room.shareCode || room.share_code) === currentRoomShareCode
                    ).map((room: any) => (
                      <div
                        key={room.id}
                        className="block w-full text-left p-2 sm:p-3 rounded-lg bg-primary/10 text-primary"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-medium text-sm truncate">
                            {room.name}
                          </span>
                          <span className="px-1.5 py-0.5 bg-muted/50 rounded text-xs font-medium ml-auto">
                            Current
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                          <span>Anonymous user</span>
                          <span className="px-1.5 py-0.5 bg-muted/50 rounded text-xs font-medium">
                            {room.tier}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 sm:py-6 space-y-2 sm:space-y-3">
                  <p className="text-sm text-muted-foreground/80">Sign in to view rooms</p>
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/signin">Sign in</Link>
                  </Button>
                </div>
              )
            ) : isLoadingRooms ? (
              <div className="text-center py-4 sm:py-6">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 sm:mb-3 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground/80">Loading rooms...</p>
              </div>
            ) : currentRooms.length === 0 ? (
              <div className="text-center py-4 sm:py-6">
                <p className="text-sm text-muted-foreground/80">No rooms yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Create your first room above</p>
              </div>
            ) : (
              <div className="max-h-32 overflow-y-auto">
                <div className="space-y-1">
                  {currentRooms.map((room: any) => {
                    const isExpired = new Date() > new Date(room.expiresAt);
                    const isExpiringSoon = !isExpired && (new Date(room.expiresAt).getTime() - Date.now()) < 24 * 60 * 60 * 1000;
                    
                    return (
                      <Link
                        key={room.id}
                        href={isExpired ? '#' : `/chat/room/${room.shareCode}?displayName=${encodedDisplayName}&sessionId=${encodedSessionId}&threadId=${crypto.randomUUID()}`}
                        onClick={(e) => {
                          if (isExpired) {
                            e.preventDefault();
                            return;
                          }
                          handleRoomSelect();
                        }}
                        className={`block w-full text-left p-2 sm:p-3 rounded-lg transition-colors ${
                          isExpired 
                            ? 'opacity-50 pointer-events-none' 
                            : currentRoomShareCode === room.shareCode
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/60'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${
                            isExpired 
                              ? 'bg-destructive' 
                              : isExpiringSoon 
                              ? 'bg-amber-500 animate-pulse' 
                              : 'bg-emerald-500 animate-pulse'
                          }`} />
                          <span className={`font-medium text-sm truncate ${isExpired ? 'line-through text-muted-foreground' : ''}`}>
                            {room.name}
                          </span>
                          <div className="flex items-center gap-1 ml-auto">
                            {room.isCreator && (
                              <Crown className="h-3 w-3 text-amber-500" />
                            )}
                            {isExpired && (
                              <span className="px-1.5 py-0.5 bg-destructive/20 text-destructive rounded text-xs font-medium">
                                Expired
                              </span>
                            )}
                            {isExpiringSoon && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded text-xs font-medium">
                                Soon
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                          <span>{room.participantCount} online</span>
                          <span className="px-1.5 py-0.5 bg-muted/50 rounded text-xs font-medium">
                            {room.tier}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Room Threads Section - Scrollable threads for the active room */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2">
          {/* Switch between Room Threads and Personal Chat History */}
          {currentRoomShareCode ? (
            <div>
              <div className="mb-1 border-b border-border/50 pb-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Room Threads
                </h4>
              </div>
              {processedThreads.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground/80">No chat threads yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Start a new conversation!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {processedThreads.map((thread: any) => (
                    <Link
                      key={thread.id}
                      href={`/chat/room/${currentRoomShareCode}?displayName=${encodedDisplayName}&sessionId=${encodedSessionId}&threadId=${thread.id}`}
                      onClick={handleChatSelect}
                      className="block p-2 rounded-lg hover:bg-muted/60 transition-colors"
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
            <div>
              {/* Personal Chats Header */}
              <div className="mb-1 border-b border-border/50 pb-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Personal Chat
                </h4>
              </div>
              
              {/* Personal Chats */}
              <ChatHistorySection
                initialChatPreviews={initialChatPreviews}
                categorizedChats={categorizedChats}
                currentChatId={currentChatId}
                searchParams={searchParams}
                onChatSelect={handleChatSelect}
                mutateChatPreviews={async () => { return; }}
              />

              {/* Room Threads */}
              {processedThreads.length > 0 && (
                <>
                  <div className="mt-6 mb-3 border-b border-border/50 pb-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Room Threads
                    </h4>
                  </div>
                  <div className="space-y-1">
                    {processedThreads.map((thread: any) => (
                      <Link
                        key={thread.id}
                        href={`/chat/room/${thread.roomShareCode}?displayName=${encodedDisplayName}&sessionId=${encodedSessionId}&threadId=${thread.id}`}
                        onClick={handleChatSelect}
                        className="block p-2 rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <div className="text-xs text-muted-foreground/70 mb-1">
                          {new Date(thread.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric'
                          })} • {thread.roomName}
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

        <ChatSidebarFooter userInfo={userInfo} />
      </Sidebar>


    </>
  );
};

// Mobile Sidebar Component
const MobileSidebar: FC<CombinedDrawerProps> = ({
  userInfo,
  initialChatPreviews,
  categorizedChats,
  documents,
  rooms = [],
  roomChatsData = []
}) => {
  const { setOpenMobile } = useSidebar();
  const { openCreateRoomModal, openJoinRoomModal } = useModalContext();

  const params = useParams();
  const searchParams = useSearchParams();
  const currentChatId = typeof params.id === 'string' ? params.id : undefined;
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;
  // Safe user params for links
  const safeUserId = userInfo?.id || 'anon';
  const safeUserDisplay = userInfo?.full_name || userInfo?.email?.split('@')[0] || 'User';
  const encodedDisplayName = encodeURIComponent(safeUserDisplay);
  const encodedSessionId = encodeURIComponent(`auth_${safeUserId}`);

  const handleChatSelect = useCallback(() => {
    close();
  }, [close]);

  const handleCloseSidebar = () => {
    setOpenMobile(false);
  };

  const handleRoomCreated = useCallback(() => {
    // Refresh the rooms list when a new room is created
    // This will be handled by the parent component
  }, []);

  const handleRoomSelect = () => {
    handleChatSelect();
  };

  // Process room threads based on current context (same logic as desktop)
  const processedThreads = React.useMemo(() => {
    if (!currentRoomShareCode) {
      // Home context: Show all room threads grouped by room
      const roomsLookup = new Map();
      (rooms || []).forEach((room: any) => {
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
      const currentRoom = (rooms || []).find((room: any) => room.shareCode === currentRoomShareCode);

      if (currentRoom) {
        // Group room messages by thread_id for the current room
        (roomChatsData || []).forEach((msg: any) => {
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
  }, [currentRoomShareCode, roomChatsData, rooms]);

  return (
    <>


      <Sheet open={true} onOpenChange={handleCloseSidebar}>
        <SheetContent side="left" className="w-[280px] p-0">
          <VisuallyHidden>
            <SheetTitle>Navigation Menu</SheetTitle>
          </VisuallyHidden>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b">
              <div className="flex items-center gap-2">
                <Image
                  src="/logos/logo-horizontal.png"
                  alt="PatioAI"
                  width={100}
                  height={24}
                  priority
                  className="opacity-90 dark:filter-none filter-[brightness(0.7)]"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseSidebar}
                className="h-8 w-8 text-muted-foreground/60 hover:text-foreground hover:bg-muted/70 transition-colors"
                aria-label="Close sidebar"
              >
                <X size={16} />
              </Button>
            </div>

            {/* Personal Chat Button */}
            <div className="px-4 py-3 border-b">
              <Button
                asChild
                variant="ghost"
                className="w-full justify-start h-8 hover:bg-muted/70 transition-colors text-sm font-medium"
                size="sm"
              >
                <Link href="/chat" onClick={handleChatSelect}>
                  Personal Chat
                </Link>
              </Button>
            </div>

            {/* Rooms Section */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-2 border-b">
                <h2 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide mb-2">Rooms</h2>
                <div className="flex gap-2">
                  <Button
                    onClick={openCreateRoomModal}
                    className="flex-1 h-7 text-xs font-medium"
                    size="sm"
                    variant="ghost"
                  >
                    <Users size={13} className="mr-1" />
                    New
                  </Button>
                  <Button
                    onClick={openJoinRoomModal}
                    className="flex-1 h-7 text-xs font-medium"
                    size="sm"
                    variant="outline"
                  >
                    <Users size={13} className="mr-1" />
                    Join
                  </Button>
                </div>
              </div>


              {/* Rooms List */}
              <div className="px-4 py-2 border-b border-border">
                {!userInfo?.email ? (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm text-muted-foreground/80">Sign in to view rooms</p>
                    <Button asChild size="sm" variant="outline" className="h-8">
                      <Link href="/signin">Sign in</Link>
                    </Button>
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground/80">No rooms yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Create your first room above</p>
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto">
                    <div className="space-y-1">
                      {rooms.map((room) => {
                      const isExpired = new Date() > new Date(room.expiresAt);
                      const isExpiringSoon = !isExpired && (new Date(room.expiresAt).getTime() - Date.now()) < 24 * 60 * 60 * 1000;
                      
                      return (
                        <Link
                          key={room.id}
                          href={isExpired ? '#' : `/chat/room/${room.shareCode}?displayName=${encodedDisplayName}&sessionId=${encodedSessionId}&threadId=${crypto.randomUUID()}`}
                          onClick={(e) => {
                            if (isExpired) {
                              e.preventDefault();
                              return;
                            }
                            handleRoomSelect();
                          }}
                          className={`block w-full text-left p-2 rounded-lg transition-colors ${
                            isExpired 
                              ? 'opacity-50 pointer-events-none' 
                              : currentRoomShareCode === room.shareCode
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted/60'
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2 h-2 rounded-full ${
                              isExpired 
                                ? 'bg-destructive' 
                                : isExpiringSoon 
                                ? 'bg-amber-500 animate-pulse' 
                                : 'bg-emerald-500 animate-pulse'
                            }`} />
                            <span className={`font-medium text-sm truncate ${isExpired ? 'line-through text-muted-foreground' : ''}`}>
                              {room.name}
                            </span>
                            <div className="flex items-center gap-1 ml-auto">
                              {room.isCreator && (
                                <Crown className="h-3 w-3 text-amber-500" />
                              )}
                              {isExpired && (
                                <span className="px-1 py-0.5 bg-destructive/20 text-destructive rounded text-xs font-medium">
                                  Expired
                                </span>
                              )}
                              {isExpiringSoon && (
                                <span className="px-1 py-0.5 bg-amber-100 text-amber-600 rounded text-xs font-medium">
                                  Soon
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                            <span>{room.participantCount} online</span>
                            <span className="px-1.5 py-0.5 bg-muted/50 rounded text-xs font-medium">
                              {room.tier}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>

              {/* Chat History */}
              <div className="px-4 py-2 border-t">
                <div className="mb-1 border-b border-border/50 pb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {currentRoomShareCode ? 'Room Threads' : 'Personal Chat'}
                  </h3>
                </div>
                
                {currentRoomShareCode ? (
                  <div>
                    {processedThreads.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground/80">No chat threads yet</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Start a new conversation!</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {processedThreads.map((thread: any) => (
                          <Link
                            key={thread.id}
                            href={`/chat/room/${currentRoomShareCode}?displayName=${encodedDisplayName}&sessionId=${encodedSessionId}&threadId=${thread.id}`}
                            onClick={handleChatSelect}
                            className="block p-2 rounded-lg hover:bg-muted/60 transition-colors"
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
                  <div>
                    {/* Personal Chats */}
                    <ChatHistorySection
                      initialChatPreviews={initialChatPreviews}
                      categorizedChats={categorizedChats}
                      currentChatId={currentChatId}
                      searchParams={searchParams}
                      onChatSelect={handleChatSelect}
                      mutateChatPreviews={async () => {}}
                    />

                    {/* Room Threads */}
                    {processedThreads.length > 0 && (
                      <>
                        <div className="mt-4 mb-2">
                          <h4 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
                            Room Threads
                          </h4>
                        </div>
                        <div className="space-y-1">
                          {processedThreads.map((thread: any) => (
                            <Link
                              key={thread.id}
                              href={`/chat/room/${thread.shareCode}?displayName=${encodedDisplayName}&sessionId=${encodedSessionId}&threadId=${thread.id}`}
                              onClick={handleChatSelect}
                              className="block p-2 rounded-lg hover:bg-muted/60 transition-colors"
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

            {/* Footer */}
            <div className="border-t p-4">
              <ChatSidebarFooter userInfo={userInfo} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default CombinedDrawer;
export { MobileSidebar };
