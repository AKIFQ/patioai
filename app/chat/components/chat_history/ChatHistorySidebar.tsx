'use client';
import React, { type FC, useState, useCallback, useEffect, createContext, useContext } from 'react';
import { fetchMoreChatPreviews } from '../../actions';
import { useParams, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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
import CreateRoomModal from '../CreateRoomModal';
import JoinRoomModal from '../JoinRoomModal';
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

  // Get mobile state and sidebar context
  const isMobile = useIsMobile();
  const { setOpen } = useSidebar();
  // Mobile sidebar visibility (shared with hamburger button)
  const { isOpen: isMobileSidebarOpen, close: closeMobileSidebar } = useMobileSidebar();
  const router = useRouter();

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
      setOpen(false);
    } else {
      setSidebarOpen(true);
      setOpen(true);
    }
  }, [isMobile, setOpen]);

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
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    setOpen(newState);
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

  // On mobile, reuse the SAME sidebar as an overlay, controlled by the shared context
  // We render the sidebar only when open to avoid layout shift
  const mobileOverlay = isMobile ? (
    <div
      className={`${isMobileSidebarOpen ? 'fixed' : 'hidden'} inset-0 z-[100] md:hidden`}
      aria-hidden={!isMobileSidebarOpen}
    >
      <div className="absolute inset-0 bg-black/40" onClick={closeMobileSidebar} />
    </div>
  ) : null;

  // Minimized sidebar - Only show on desktop when collapsed
  if (!sidebarOpen && !isMobile) {
    return (
      <div className="h-full border-r border-border w-[50px] flex-shrink-0 bg-background flex flex-col items-center py-2 hidden md:flex">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                className="h-8 w-8 mb-2 hover:bg-muted/70 transition-colors"
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

  // Don't render anything on mobile when the mobile sidebar context is closed
  if (isMobile && !isMobileSidebarOpen) {
    return null;
  }

  return (
    <>
      {mobileOverlay}
      <Sidebar
        collapsible="none"
        className={`h-full border-r border-border w-0 md:w-[240px] lg:w-[280px] flex-shrink-0 flex flex-col bg-background ${isMobile ? (isMobileSidebarOpen ? 'fixed left-0 top-0 bottom-0 w-[280px] z-[101]' : 'hidden') : ''}`}
      >
        <SidebarHeader className="px-3 sm:px-4 lg:px-5 py-3 sm:py-4 border-b border-border gap-0">
          {/* PatioAI Logo - Larger with more spacing */}
          <div className="flex items-center justify-between mb-4 sm:mb-5 mt-1 sm:mt-2">
            <div className="ml-1 sm:ml-2">
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
            className="w-full justify-start h-8 mb-4 sm:mb-6 ml-1 sm:ml-2 hover:bg-muted/70 transition-colors text-sm font-medium"
            size="sm"
          >
            <Link href="/chat">
              Personal Chat
            </Link>
          </Button>

          {/* ROOMS Header - Compact */}
          <div className="flex items-center justify-between mb-1 ml-1 sm:ml-2">
            <h2 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Rooms</h2>
          </div>

          {/* Room Action Buttons - Compact */}
          <div className="flex gap-1 sm:gap-2 ml-1 sm:ml-2">
            <Button
              onClick={() => {
                setIsCreateGroupModalOpen(true);
              }}
              className="flex-1 h-7 text-xs font-medium"
              size="sm"
              variant="ghost"
            >
              <Users size={13} className="mr-1 sm:mr-1.5" />
              New
            </Button>
            <Button
              onClick={() => {
                setIsJoinRoomModalOpen(true);
              }}
              className="flex-1 h-7 text-xs font-medium"
              size="sm"
              variant="outline"
            >
              <Users size={13} className="mr-1 sm:mr-1.5" />
              Join
            </Button>
          </div>
        </SidebarHeader>

        {/* Rooms List - Clean scrollable section */}
        <div className="flex-1 overflow-y-auto border-b border-border">
          <div className="px-3 sm:px-4 py-2">
            {!userInfo.email ? (
              <div className="text-center py-4 sm:py-6 space-y-2 sm:space-y-3">
                <p className="text-sm text-muted-foreground/80">Sign in to view rooms</p>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="/signin">Sign in</Link>
                </Button>
              </div>
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
              <div className="space-y-1">
                {currentRooms.map((room: any) => (
                  <Link
                    key={room.id}
                    href={`/chat/room/${room.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${crypto.randomUUID()}`}
                    onClick={handleRoomSelect}
                    className={`block w-full text-left p-2 sm:p-3 rounded-lg transition-colors ${currentRoomShareCode === room.shareCode
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

        {/* Room Threads Section - Scrollable threads for the active room */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2">
          {/* Switch between Room Threads and Personal Chat History */}
          {currentRoomShareCode ? (
            <div>
              <div className="mb-2">
                <h4 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
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
                      href={`/chat/room/${currentRoomShareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.id}`}
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
                mutateChatPreviews={async () => { return; }}
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
                        href={`/chat/room/${thread.roomShareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.id}`}
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

      {/* Modals outside sidebar so they stay visible when sidebar closes */}
      <CreateRoomModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => {
          setIsCreateGroupModalOpen(false);
          if (isMobile) {
            closeMobileSidebar();
          }
        }}
        onRoomCreated={handleRoomCreated}
      />

      <JoinRoomModal
        isOpen={isJoinRoomModalOpen}
        onClose={() => {
          setIsJoinRoomModalOpen(false);
          if (isMobile) {
            closeMobileSidebar();
          }
        }}
      />
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
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [isJoinRoomModalOpen, setIsJoinRoomModalOpen] = useState(false);
  const { isOpen, close } = useMobileSidebar();

  const params = useParams();
  const searchParams = useSearchParams();
  const currentChatId = typeof params.id === 'string' ? params.id : undefined;
  const currentRoomShareCode = typeof params.shareCode === 'string' ? params.shareCode : undefined;

  const handleChatSelect = useCallback(() => {
    close();
  }, [close]);

  const handleCloseSidebar = () => {
    close();
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
      <CreateRoomModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onRoomCreated={handleRoomCreated}
      />

      <JoinRoomModal
        isOpen={isJoinRoomModalOpen}
        onClose={() => setIsJoinRoomModalOpen(false)}
      />

      <Sheet open={isOpen} onOpenChange={handleCloseSidebar}>
        <SheetContent side="left" className="w-[280px] p-0">
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
                  className="opacity-90"
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
                    onClick={() => setIsCreateGroupModalOpen(true)}
                    className="flex-1 h-7 text-xs font-medium"
                    size="sm"
                    variant="ghost"
                  >
                    <Users size={13} className="mr-1" />
                    New
                  </Button>
                  <Button
                    onClick={() => setIsJoinRoomModalOpen(true)}
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
              <div className="px-4 py-2">
                {!userInfo.email ? (
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
                  <div className="space-y-1">
                    {rooms.map((room) => (
                      <Link
                        key={room.id}
                        href={`/chat/room/${room.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${crypto.randomUUID()}`}
                        onClick={handleRoomSelect}
                        className={`block w-full text-left p-2 rounded-lg transition-colors ${currentRoomShareCode === room.shareCode
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

              {/* Chat History */}
              <div className="px-4 py-2 border-t">
                <h3 className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide mb-2">
                  {currentRoomShareCode ? 'Room Threads' : 'Recent Chats'}
                </h3>
                
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
                            href={`/chat/room/${currentRoomShareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.id}`}
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
                              href={`/chat/room/${thread.shareCode}?displayName=${encodeURIComponent(userInfo.full_name || userInfo.email?.split('@')[0] || 'User')}&sessionId=${encodeURIComponent(`auth_${userInfo.id}`)}&threadId=${thread.id}`}
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
