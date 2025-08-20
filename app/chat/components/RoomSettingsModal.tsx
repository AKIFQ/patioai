'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// Shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Icons
import {
  Settings,
  Crown,
  Users,
  Trash2,
  Check,
  X,
  Copy,
  Loader2,
  Share2
} from 'lucide-react';

// Import ShareRoomModal
import ShareRoomModal from './ShareRoomModal';

interface RoomContext {
  shareCode: string;
  roomName: string;
  displayName: string;
  sessionId: string;
  participants: Array<{ displayName: string; joinedAt: string; sessionId: string; userId?: string }>;
  maxParticipants: number;
  tier: 'free' | 'pro';
  createdBy?: string;
  expiresAt?: string;
  chatSessionId?: string;
}

interface RoomSettingsModalProps {
  roomContext: RoomContext;
  isCreator?: boolean;
  expiresAt?: string;
  onRoomUpdate?: () => void;
}

const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  roomContext,
  isCreator = false,
  expiresAt,
  onRoomUpdate
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  // State management
  const [isOpen, setIsOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState(roomContext.roomName);
  const [isCopied, setIsCopied] = useState(false);
  const [removingUser, setRemovingUser] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [roomPassword, setRoomPassword] = useState<string | null>(null);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  
  // Mobile detection - use more reliable method
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      // Use multiple indicators for mobile detection
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      setIsMobile(isTouchDevice && (isSmallScreen || isMobileUserAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch password when modal opens
  useEffect(() => {
    if (isOpen && isCreator) {
      fetchRoomPassword();
    }
  }, [isOpen, isCreator]);

  // Fetch room password for admin
  const fetchRoomPassword = async () => {
    if (!isCreator) return; // Only creator can see password
    
    setIsLoadingPassword(true);
    try {
      const response = await fetch(`/api/rooms/${roomContext.shareCode}/password`);
      if (response.ok) {
        const data = await response.json();
        setRoomPassword(data.password);
      } else {
        console.error('Failed to fetch room password');
        setRoomPassword('Password unavailable');
      }
    } catch (error) {
      console.error('Error fetching room password:', error);
      setRoomPassword('Password unavailable');
    } finally {
      setIsLoadingPassword(false);
    }
  };

  // Copy share link to clipboard
  const handleCopyShareLink = async () => {
    try {
      const baseUrl = window.location.origin;
      const shareableLink = `${baseUrl}/room/${roomContext.shareCode}`;
      await navigator.clipboard.writeText(shareableLink);
      setIsCopied(true);
      toast.success('Share link copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy share link');
    }
  };

  // Update room name
  const handleUpdateRoomName = async () => {
    if (!newRoomName.trim() || newRoomName === roomContext.roomName) {
      setEditingName(false);
      setNewRoomName(roomContext.roomName);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomContext.shareCode}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newRoomName.trim() })
        });

        if (!response.ok) throw new Error('Failed to update room name');

        toast.success('Room name updated successfully');
        setEditingName(false);
        onRoomUpdate?.();
        router.refresh();
      } catch {
        toast.error('Failed to update room name');
        setNewRoomName(roomContext.roomName);
      }
    });
  };

  // Remove user from room
  const handleRemoveUser = async (sessionId: string, displayName: string) => {
    setRemovingUser(displayName);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomContext.shareCode}/participants`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });

        if (!response.ok) throw new Error('Failed to remove user');

        toast.success(`${displayName} removed from room`);
        onRoomUpdate?.();
        router.refresh();
      } catch {
        toast.error('Failed to remove user');
      } finally {
        setRemovingUser(null);
      }
    });
  };

  // Delete room
  const handleDeleteRoom = async () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomContext.shareCode}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete room');
        toast.success('Room deleted successfully');
        router.push('/chat');
      } catch {
        toast.error('Failed to delete room');
      }
    });
  };

  // Shared header
  const SettingsHeader = (
    <div className="flex-shrink-0 px-6 py-4 border-b border-border/40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
          <Settings className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <DialogTitle className="text-xl font-medium">Room Settings</DialogTitle>
          <p className="text-sm text-muted-foreground/80">Manage your room configuration</p>
        </div>
      </div>
    </div>
  );

  // Shared content
  const SettingsContent = (
    <div 
      className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0"
      style={{ 
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y'
      }}
    >
      <div className="space-y-6">
        {/* Room Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Room Information</h3>
          
          {/* Room Name */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</div>
            {editingName ? (
              <div className="flex gap-2">
                <Input
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateRoomName();
                    if (e.key === 'Escape') {
                      setEditingName(false);
                      setNewRoomName(roomContext.roomName);
                    }
                  }}
                  className="flex-1"
                  autoFocus
                />
                <Button 
                  size="sm" 
                  onClick={handleUpdateRoomName} 
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    setEditingName(false);
                    setNewRoomName(roomContext.roomName);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                  <div className="text-sm font-medium">{roomContext.roomName}</div>
                </div>
                {isCreator && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setEditingName(true)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Share Link */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Share Link</div>
            <div className="flex gap-2">
              <div className="flex-1 text-sm px-3 py-2 bg-amber-30 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg font-mono break-all">
                {`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${roomContext.shareCode}`}
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleCopyShareLink}
                className={`h-9 w-9 p-0 touch-manipulation ${isCopied ? 'text-green-600' : ''}`}
                style={{ minHeight: '36px', minWidth: '36px' }}
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Share Button */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Share Room</div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                if (!roomPassword && isCreator) {
                  fetchRoomPassword();
                }
                setShowShareModal(true);
              }}
              className="w-full h-9 touch-manipulation flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600 border-amber-500"
              style={{ minHeight: '36px' }}
            >
              <Share2 className="h-4 w-4" />
              {isLoadingPassword ? 'Loading...' : 'Share to Social Platforms'}
            </Button>
          </div>

          {/* Room Password (Admin Only) */}
          {isCreator && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Password</div>
              <div className="flex gap-2">
                <div className="flex-1 text-sm px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg font-mono break-all">
                  {isLoadingPassword ? (
                    <span className="text-muted-foreground/60">Loading password...</span>
                  ) : roomPassword ? (
                    roomPassword
                  ) : (
                    <span className="text-muted-foreground/60">Click share to load password</span>
                  )}
                </div>
                {roomPassword && roomPassword !== 'Password unavailable' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      navigator.clipboard.writeText(roomPassword);
                      toast.success('Password copied to clipboard');
                    }}
                    className="h-9 w-9 p-0 touch-manipulation"
                    style={{ minHeight: '36px', minWidth: '36px' }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Room Stats */}
          <div className="flex justify-between text-sm text-muted-foreground/80">
            <span><span className="font-medium">Participants:</span> {roomContext.participants.length}/{roomContext.maxParticipants}</span>
            <span><span className="font-medium">Tier:</span> {roomContext.tier}</span>
          </div>
        </div>

        {/* Participants */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Participants ({roomContext.participants.length})</h3>
          
          <div className="space-y-3">
            {roomContext.participants.map((participant, index) => (
              <div key={index} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 font-medium text-sm flex items-center justify-center border border-amber-200 dark:border-amber-800/50">
                    {participant.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{participant.displayName}</span>
                    {participant.displayName === roomContext.createdBy && (
                      <div className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-amber-500" title="Room Creator" />
                      </div>
                    )}
                  </div>
                </div>
                {isCreator && participant.displayName !== roomContext.createdBy && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveUser(participant.sessionId || '', participant.displayName)}
                    disabled={removingUser === participant.displayName}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 touch-manipulation"
                    style={{ minHeight: '32px', minWidth: '32px' }}
                  >
                    {removingUser === participant.displayName ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        {isCreator && (
          <div className="space-y-4 pb-4">
            <h3 className="text-sm font-medium text-red-600">Danger Zone</h3>
            
            {!showDeleteConfirm ? (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full h-11 touch-manipulation"
                style={{ minHeight: '44px' }}
              >
                Delete Room
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600 font-medium">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteRoom}
                    disabled={isPending}
                    className="flex-1 h-11 touch-manipulation"
                    style={{ minHeight: '44px' }}
                  >
                    {isPending ? 'Deleting...' : 'Yes, Delete'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 h-11 touch-manipulation"
                    style={{ minHeight: '44px' }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 hover:bg-muted/50 transition-colors touch-manipulation"
              aria-label="Room settings"
              style={{ minHeight: '44px', minWidth: '44px' }} // iOS touch target minimum
            >
              <Settings className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent 
            side="bottom" 
            className="h-[80vh] max-h-[600px] p-0 gap-0 flex flex-col rounded-t-xl border-t-2"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y'
            }}
          >
            {/* Drag handle - make it more prominent */}
            <div className="w-16 h-2 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-2" />
            {SettingsHeader}
            {SettingsContent}
          </SheetContent>
        </Sheet>

        {/* Share Room Modal */}
        <ShareRoomModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          room={{
            id: 'temp-id',
            name: roomContext.roomName,
            shareCode: roomContext.shareCode,
            password: roomPassword || 'Password loading...',
            passwordExpiresAt: expiresAt || new Date().toISOString()
          }}
          shareableLink={`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${roomContext.shareCode}`}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-muted/50 transition-colors flex-shrink-0 touch-manipulation"
            aria-label="Room settings"
            style={{ minHeight: '44px', minWidth: '44px' }} // iOS touch target minimum
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>

        <DialogContent 
          className="sm:max-w-[500px] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
          onPointerDownOutside={() => setIsOpen(false)}
          onEscapeKeyDown={() => setIsOpen(false)}
        >
          {SettingsHeader}
          {SettingsContent}
        </DialogContent>
      </Dialog>

      {/* Share Room Modal */}
      <ShareRoomModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        room={{
          id: 'temp-id',
          name: roomContext.roomName,
          shareCode: roomContext.shareCode,
          password: roomPassword || 'Password loading...',
          passwordExpiresAt: expiresAt || new Date().toISOString()
        }}
        shareableLink={`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${roomContext.shareCode}`}
      />
    </>
  );
};

export default RoomSettingsModal;