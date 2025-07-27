'use client';
import React, { type FC, useState, useCallback } from 'react';
import { fetchMoreChatPreviews } from '../../actions';
import { useParams, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
}

const CombinedDrawer: FC<CombinedDrawerProps> = ({
  userInfo,
  initialChatPreviews,
  categorizedChats,
  documents,
  rooms = []
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [roomChatHistory, setRoomChatHistory] = useState<any[]>([]);
  const [isLoadingRoomHistory, setIsLoadingRoomHistory] = useState(false);

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

  // Fetch room chat history when room is selected
  const fetchRoomChatHistory = useCallback(async (shareCode: string) => {
    setIsLoadingRoomHistory(true);
    try {
      const response = await fetch(`/api/rooms/${shareCode}/messages`);
      if (response.ok) {
        const messages = await response.json();
        setRoomChatHistory(messages);
      } else {
        setRoomChatHistory([]);
      }
    } catch (error) {
      console.error('Error fetching room chat history:', error);
      setRoomChatHistory([]);
    } finally {
      setIsLoadingRoomHistory(false);
    }
  }, []);

  // Fetch room history when room changes
  React.useEffect(() => {
    if (currentRoomShareCode) {
      fetchRoomChatHistory(currentRoomShareCode);
    } else {
      setRoomChatHistory([]);
    }
  }, [currentRoomShareCode, fetchRoomChatHistory]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
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

  const handleRoomSelect = () => {
    // Room selection is handled by navigation
    handleChatSelect();
  };

  return (
    <>
      <CreateRoomModal 
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
      />
      <Sidebar
        collapsible="none"
        className="h-full border-r border-border w-0 md:w-[240px] lg:w-[280px] flex-shrink-0 flex flex-col"
      >
        <SidebarHeader className="p-4 border-b">
          {/* Home Chat Button - At the very top */}
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
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-muted-foreground hover:text-foreground hidden sm:block"
              aria-label="Close sidebar"
            >
              <PanelLeftIcon size={16} />
            </Button>
          </div>
          
          {/* New Room Button - Below ROOMS header */}
          <Button 
            onClick={() => setIsCreateGroupModalOpen(true)}
            className="w-full"
            size="sm"
          >
            <Users size={16} className="mr-2" />
            New Room
          </Button>
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
            ) : rooms.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-sm text-muted-foreground">No rooms yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first room above</p>
              </div>
            ) : (
              <div className="space-y-1">
                {rooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/room/${room.shareCode}`}
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
        <div className="h-1/2 flex flex-col">
          <div className="p-2 border-b bg-muted/30">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {currentRoomShareCode ? 'ROOM CHATS' : 'CHATS'}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {currentRoomShareCode ? (
              <div className="p-2">
                {isLoadingRoomHistory ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Loading messages...</span>
                  </div>
                ) : roomChatHistory.length === 0 ? (
                  <div className="text-center p-4">
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Start chatting in the room!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {roomChatHistory.slice(-10).map((message: any) => (
                      <div
                        key={message.id}
                        className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-xs text-muted-foreground mb-1">
                          {new Date(message.created_at).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                        <div className="text-sm">
                          {message.isAI ? (
                            <div className="text-blue-600 dark:text-blue-400">
                              <span className="font-medium">AI:</span> {message.content.substring(0, 100)}
                              {message.content.length > 100 && '...'}
                            </div>
                          ) : (
                            <div>
                              <span className="font-medium text-green-600 dark:text-green-400">
                                {message.senderName}:
                              </span>{' '}
                              <span className="text-muted-foreground">
                                {message.content.replace(`${message.senderName}: `, '').substring(0, 80)}
                                {message.content.length > 80 && '...'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2">
                <ChatHistorySection
                  initialChatPreviews={initialChatPreviews}
                  categorizedChats={categorizedChats}
                  currentChatId={currentChatId}
                  searchParams={searchParams}
                  onChatSelect={handleChatSelect}
                  mutateChatPreviews={mutateChatPreviews}
                />
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
