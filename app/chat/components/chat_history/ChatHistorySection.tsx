import React, { FC, useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MoreHorizontal, Trash, Edit, ExternalLink, Share, Users } from 'lucide-react';
import { deleteChatData, updateChatTitle } from '../../actions';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction
} from '@/components/ui/sidebar';

interface ChatPreview {
  id: string;
  firstMessage: string;
  created_at: string;
  type?: 'regular' | 'room';
  roomName?: string;
  shareCode?: string;
}

interface ChatHistorySectionProps {
  initialChatPreviews: ChatPreview[];
  categorizedChats: {
    today: ChatPreview[];
    yesterday: ChatPreview[];
    last7Days: ChatPreview[];
    last30Days: ChatPreview[];
    last2Months: ChatPreview[];
    older: ChatPreview[];
  };
  currentChatId?: string;
  searchParams: URLSearchParams;
  onChatSelect: () => void;
  mutateChatPreviews: () => Promise<any>;
}

// Mobile swipe-to-delete component
const SwipeableChat: FC<{
  chat: ChatPreview;
  currentChatId?: string;
  searchParams: URLSearchParams;
  onChatSelect: () => void;
  onDelete: (chatId: string) => void;
  children: React.ReactNode;
}> = ({ chat, currentChatId, searchParams, onChatSelect, onDelete, children }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setIsDragging(false);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    
    // Only allow horizontal swipe if it's primarily horizontal movement
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > deltaY) {
      setIsDragging(true);
      e.preventDefault(); // Prevent scrolling
      
      // Only allow left swipe (negative deltaX) and limit to -80px
      const swipeDistance = Math.max(Math.min(deltaX, 0), -80);
      setSwipeX(swipeDistance);
    }
  };
  
  const handleTouchEnd = () => {
    setTouchStart(null);
    
    if (swipeX < -40) {
      // Show delete button
      setSwipeX(-80);
    } else {
      // Snap back
      setSwipeX(0);
    }
    
    setTimeout(() => setIsDragging(false), 100);
  };
  
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(chat.id);
      // Slide out animation before removal
      setSwipeX(-300);
      setTimeout(() => {
        setIsDeleting(false);
      }, 300);
    } catch (error) {
      setIsDeleting(false);
      setSwipeX(0);
    }
  };
  
  return (
    <div className="relative overflow-hidden">
      {/* Delete button background */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-20 bg-red-500 flex items-center justify-center transition-all duration-200"
        style={{
          transform: `translateX(${swipeX < -40 ? '0px' : '20px'})`,
          opacity: swipeX < -40 ? 1 : 0
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-white hover:text-white hover:bg-red-600 h-full w-full"
        >
          <Trash className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Chat item */}
      <div
        className="transition-transform duration-200 ease-out bg-background"
        style={{
          transform: `translateX(${swipeX}px)`,
          opacity: isDeleting ? 0 : 1
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

const ChatHistorySection: FC<ChatHistorySectionProps> = ({
  initialChatPreviews,
  categorizedChats,
  currentChatId,
  searchParams,
  onChatSelect,
  mutateChatPreviews
}) => {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<{ id: string; currentName: string } | null>(null);
  const [newChatName, setNewChatName] = useState('');

  const handleDeleteClick = useCallback((chatId: string) => {
    if (isMobile) {
      // On mobile, direct delete after swipe gesture
      handleDeleteConfirmation(chatId);
    } else {
      // On desktop, show confirmation dialog
      setChatToDelete(chatId);
      setDeleteConfirmationOpen(true);
    }
  }, []);

  const handleOpenRename = (chatId: string) => {
    setChatToRename({ id: chatId, currentName: '' }); // Placeholder, will be updated with actual name
    setNewChatName('');
    setRenameDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setRenameDialogOpen(false);
    setChatToRename(null);
    setNewChatName('');
  };

  const handleDeleteConfirmation = async (chatId?: string) => {
    const idToDelete = chatId || chatToDelete;
    if (!idToDelete) return;

    startTransition(async () => {
      try {
        await deleteChatData(idToDelete);
        await mutateChatPreviews();
        toast.success('Chat deleted successfully');
      } catch (error) {
        console.error('Failed to delete chat:', error);
        toast.error('Failed to delete chat');
      } finally {
        setDeleteConfirmationOpen(false);
        setChatToDelete(null);
      }
    });
  };

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <RenderChatSectionWithSidebar
        title="Today"
        chats={categorizedChats.today}
        currentChatId={currentChatId}
        handleDeleteClick={handleDeleteClick}
        handleOpenRename={handleOpenRename}
        onChatSelect={onChatSelect}
        searchParams={searchParams}
      />
      <RenderChatSectionWithSidebar
        title="Yesterday"
        chats={categorizedChats.yesterday}
        currentChatId={currentChatId}
        handleDeleteClick={handleDeleteClick}
        handleOpenRename={handleOpenRename}
        onChatSelect={onChatSelect}
        searchParams={searchParams}
      />
      <RenderChatSectionWithSidebar
        title="Last 7 days"
        chats={categorizedChats.last7Days}
        currentChatId={currentChatId}
        handleDeleteClick={handleDeleteClick}
        handleOpenRename={handleOpenRename}
        onChatSelect={onChatSelect}
        searchParams={searchParams}
      />
      <RenderChatSectionWithSidebar
        title="Last 30 days"
        chats={categorizedChats.last30Days}
        currentChatId={currentChatId}
        handleDeleteClick={handleDeleteClick}
        handleOpenRename={handleOpenRename}
        onChatSelect={onChatSelect}
        searchParams={searchParams}
      />
      <RenderChatSectionWithSidebar
        title="Last 2 months"
        chats={categorizedChats.last2Months}
        currentChatId={currentChatId}
        handleDeleteClick={handleDeleteClick}
        handleOpenRename={handleOpenRename}
        onChatSelect={onChatSelect}
        searchParams={searchParams}
      />
      <RenderChatSectionWithSidebar
        title="Older"
        chats={categorizedChats.older}
        currentChatId={currentChatId}
        handleDeleteClick={handleDeleteClick}
        handleOpenRename={handleOpenRename}
        onChatSelect={onChatSelect}
        searchParams={searchParams}
      />

      {/* Dialogs */}
      <Dialog
        open={deleteConfirmationOpen}
        onOpenChange={setDeleteConfirmationOpen}
      >
        <DialogContent>
          <DialogTitle className="sr-only">Confirm Deletion</DialogTitle>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-around">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmationOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => chatToDelete && handleDeleteConfirmation(chatToDelete)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => !open && handleCloseDialog()}
      >
        <DialogContent className="p-3 max-w-[90vw] sm:max-w-[350px]">
          <DialogTitle className="text-center">Rename Chat</DialogTitle>
          <form
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);

              startTransition(async () => {
                await updateChatTitle(formData);
                await mutateChatPreviews();
              });

              handleCloseDialog();
            }}
          >
            <input type="hidden" name="chatId" value={chatToRename?.id || ''} />

            <div className="space-y-2 py-2">
              <Input
                autoFocus
                name="title"
                placeholder="New title"
                type="text"
                required
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                className="w-full"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseDialog}
                className="mr-1 text-destructive"
              >
                Cancel
              </Button>
              <Button variant="outline" type="submit">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
};

interface RenderChatSectionProps {
  title: string;
  chats: ChatPreview[];
  currentChatId: string | undefined;
  handleDeleteClick: (id: string) => void;
  handleOpenRename: (id: string) => void;
  onChatSelect: () => void;
  searchParams: URLSearchParams;
}

const RenderChatSectionWithSidebar: FC<RenderChatSectionProps> = ({
  title,
  chats,
  currentChatId,
  handleDeleteClick,
  handleOpenRename,
  onChatSelect,
  searchParams
}) => {
  const isMobile = useIsMobile();
  
  if (chats.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map(({ id, firstMessage, type, roomName, shareCode }) => {
            const currentParams = new URLSearchParams(searchParams.toString());
            
            // For room chats, link to the room page
            const href = type === 'room' && shareCode 
              ? `/room/${shareCode}`
              : `/chat/${id}${currentParams.toString() ? '?' + currentParams.toString() : ''}`;

            const chatContent = (
              <>
                <SidebarMenuButton
                  asChild
                  isActive={type !== 'room' && currentChatId === id}
                  onClick={() => onChatSelect()}
                >
                  <a href={href}>
                    <div className="flex items-start gap-2 w-full">
                      {type === 'room' && (
                        <Users className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex flex-col items-start w-full min-w-0">
                        <span className="truncate">{firstMessage}</span>
                        {type === 'room' && roomName && (
                          <span className="text-xs text-muted-foreground truncate">
                            Room: {roomName}
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                </SidebarMenuButton>

                {type !== 'room' && !isMobile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction>
                        <MoreHorizontal size={16} />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="rounded-lg">
                      <DropdownMenuItem
                        disabled
                        className="text-sm cursor-not-allowed"
                      >
                        <Share className="mr-2 h-4 w-4" />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenRename(id)}
                        className="text-sm"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(id)}
                        className="text-destructive text-sm"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            );

            return (
              <SidebarMenuItem key={id}>
                {isMobile && type !== 'room' ? (
                  <SwipeableChat
                    chat={{ id, firstMessage, created_at: '', type, roomName, shareCode }}
                    currentChatId={currentChatId}
                    searchParams={searchParams}
                    onChatSelect={onChatSelect}
                    onDelete={handleDeleteClick}
                  >
                    {chatContent}
                  </SwipeableChat>
                ) : (
                  chatContent
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default ChatHistorySection;
