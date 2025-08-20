import React, { type FC, useState, startTransition } from 'react';
import { deleteChatData, updateChatTitle } from '../../actions';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Share, Edit, Trash, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction
} from '@/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface ChatHistorySectionProps {
  initialChatPreviews: ChatPreview[];
  categorizedChats: CategorizedChats;
  currentChatId: string | undefined;
  searchParams: URLSearchParams;
  onChatSelect: () => void;
  mutateChatPreviews: () => Promise<any>;
}

const ChatHistorySection: FC<ChatHistorySectionProps> = ({
  initialChatPreviews,
  categorizedChats,
  currentChatId,
  searchParams,
  onChatSelect,
  mutateChatPreviews
}) => {
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const router = useRouter();

  const handleDeleteClick = (id: string) => {
    setChatToDelete(id);
    setDeleteConfirmationOpen(true);
  };

  const handleOpenRename = (chatId: string) => {
    setEditingChatId(chatId);
    const chat = initialChatPreviews.find((chat) => chat.id === chatId);
    if (chat) setNewTitle(chat.firstMessage);
    setEditDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setEditDialogOpen(false);
    setEditingChatId(null);
    setNewTitle('');
  };

  const handleDeleteConfirmation = async () => {
    if (chatToDelete) {
      try {
        await deleteChatData(chatToDelete);
        await mutateChatPreviews();

        if (chatToDelete === currentChatId) {
          router.push('/chat');
        }
      } catch (error) {
        console.error('Failed to delete the chat:', error);
      }
    }
    setDeleteConfirmationOpen(false);
    setChatToDelete(null);
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
            <Button variant="destructive" onClick={handleDeleteConfirmation}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
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
            <input type="hidden" name="chatId" value={editingChatId || ''} />

            <div className="space-y-2 py-2">
              <Input
                autoFocus
                name="title"
                placeholder="New title"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
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

            return (
              <SidebarMenuItem key={id}>
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

                {type !== 'room' && (
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
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenRename(id)}
                        className="text-sm"
                      >
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(id)}
                        className="text-destructive text-sm"
                      >
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
