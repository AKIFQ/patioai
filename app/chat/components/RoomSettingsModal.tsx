'use client';

import React, { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// UI Components
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

// Icons
import {
  Settings,
  Crown,
  Users,
  Link as LinkIcon,
  Trash2,
  Check,
  X,
  Copy,
  Loader2,
  User,
  ExternalLink
} from 'lucide-react';

interface RoomParticipant {
  sessionId: string;
  displayName: string;
  joinedAt: string;
  userId?: string;
}

interface RoomSettingsModalProps {
  roomContext: {
    shareCode: string;
    roomName: string;
    displayName: string;
    sessionId: string;
    participants: RoomParticipant[];
    maxParticipants: number;
    tier: 'free' | 'pro';
  };
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
  
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Copy share link to clipboard
  const handleCopyShareLink = async () => {
    try {
      const baseUrl = window.location.origin;
      const shareableLink = `${baseUrl}/room/${roomContext.shareCode}`;
      await navigator.clipboard.writeText(shareableLink);
      setIsCopied(true);
      toast.success('Share link copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
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

        if (!response.ok) {
          throw new Error('Failed to update room name');
        }

        toast.success('Room name updated successfully');
        setEditingName(false);
        onRoomUpdate?.();
        router.refresh();
      } catch (error) {
        toast.error('Failed to update room name');
        setNewRoomName(roomContext.roomName);
      }
    });
  };

  // Remove user from room
  const handleRemoveUser = async (sessionId: string, displayName: string) => {
    if (sessionId === roomContext.sessionId) {
      toast.error("You can't remove yourself from the room");
      return;
    }

    setRemovingUser(sessionId);
    
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomContext.shareCode}/participants`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });

        if (!response.ok) {
          throw new Error('Failed to remove user');
        }

        toast.success(`${displayName} has been removed from the room`);
        onRoomUpdate?.();
        router.refresh();
      } catch (error) {
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
        const response = await fetch(`/api/rooms/${roomContext.shareCode}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          throw new Error('Failed to delete room');
        }

        toast.success('Room deleted successfully');
        
        // Force a hard refresh to clear all cached data
        window.location.href = '/chat';
      } catch (error) {
        toast.error('Failed to delete room');
      }
    });
  };

  // Leave room (for non-creators)
  const handleLeaveRoom = async () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomContext.shareCode}/participants`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: roomContext.sessionId })
        });

        if (!response.ok) {
          throw new Error('Failed to leave room');
        }

        toast.success('You have left the room');
        router.push('/chat');
      } catch (error) {
        toast.error('Failed to leave room');
      }
    });
  };

  const formatExpiryDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const isExpiringSoon = (dateString?: string) => {
    if (!dateString) return false;
    const expiryDate = new Date(dateString);
    const now = new Date();
    const hoursUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry < 24;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={isMobile ? "sm" : "icon"}
          className={`${isMobile 
            ? 'h-8 w-8 px-1 hover:bg-muted/50 transition-colors' 
            : 'h-7 sm:h-8 w-7 sm:w-8 hover:bg-muted/50 transition-colors flex-shrink-0'
          }`}
          aria-label="Room settings"
        >
          <Settings className={`${isMobile ? 'h-4 w-4' : 'h-3 w-3 sm:h-4 sm:w-4'}`} />
        </Button>
      </DialogTrigger>

      <DialogContent 
        className={`${isMobile 
          ? 'w-[95vw] max-w-[350px] h-[85vh] max-h-[600px] p-0 gap-0' 
          : 'sm:max-w-[600px] max-h-[80vh]'
        } overflow-hidden`}
        onPointerDownOutside={() => setIsOpen(false)}
        onEscapeKeyDown={() => setIsOpen(false)}
      >
        <DialogHeader className={`${isMobile ? 'p-4 pb-2' : 'p-6 pb-4'} border-b border-border/40`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
              <DialogTitle className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold`}>
                Room Settings
              </DialogTitle>
            </div>
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 hover:bg-muted/50"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <DialogDescription className={`${isMobile ? 'text-sm' : ''} text-muted-foreground`}>
            Manage your room settings, participants, and preferences.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className={`${isMobile ? 'flex-1' : 'max-h-[60vh]'}`}>
          <div className={`${isMobile ? 'p-4 space-y-4' : 'p-6 space-y-6'}`}>
            {/* Room Information */}
            <Card className={isMobile ? 'shadow-none border-border/30' : ''}>
              <CardHeader className={isMobile ? 'p-3 pb-2' : ''}>
                <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'} flex items-center gap-2`}>
                  <Crown className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                  Room Information
                </CardTitle>
              </CardHeader>
              <CardContent className={`${isMobile ? 'p-3 pt-0 space-y-3' : 'space-y-4'}`}>
                {/* Room Name */}
                <div className="space-y-2">
                  <Label htmlFor="room-name" className={isMobile ? 'text-sm' : ''}>Room Name</Label>
                  <div className="flex items-center gap-2">
                    {editingName ? (
                      <>
                        <Input
                          id="room-name"
                          value={newRoomName}
                          onChange={(e) => setNewRoomName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateRoomName();
                            if (e.key === 'Escape') {
                              setEditingName(false);
                              setNewRoomName(roomContext.roomName);
                            }
                          }}
                          disabled={!isCreator || isPending}
                          className={`flex-1 ${isMobile ? 'h-8 text-sm' : ''}`}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={handleUpdateRoomName}
                          disabled={isPending}
                          className={isMobile ? 'h-8 px-3 text-xs' : ''}
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
                          className={isMobile ? 'h-8 px-3 text-xs' : ''}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className={`flex-1 ${isMobile ? 'text-sm' : ''} font-medium bg-muted/30 rounded px-3 py-2`}>
                          {roomContext.roomName}
                        </div>
                        {isCreator && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingName(true)}
                            className={isMobile ? 'h-8 px-3 text-xs' : ''}
                          >
                            Edit
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Share Link */}
                <div className="space-y-2">
                  <Label className={isMobile ? 'text-sm' : ''}>Share Link</Label>
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 ${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground bg-muted/30 rounded px-3 py-2 font-mono break-all`}>
                      {`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${roomContext.shareCode}`}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyShareLink}
                      className={`${isMobile ? 'h-8 px-3' : ''} ${isCopied ? 'text-green-600' : ''}`}
                    >
                      {isCopied ? (
                        <Check className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                      ) : (
                        <Copy className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Room Info */}
                <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-2 gap-4'}`}>
                  <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
                    <span className="font-medium">Participants:</span> {roomContext.participants.length}/{roomContext.maxParticipants}
                  </div>
                  <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
                    <span className="font-medium">Tier:</span> <Badge variant="secondary" className={isMobile ? 'text-xs' : ''}>{roomContext.tier}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Participants */}
            <Card className={isMobile ? 'shadow-none border-border/30' : ''}>
              <CardHeader className={isMobile ? 'p-3 pb-2' : ''}>
                <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'} flex items-center gap-2`}>
                  <Users className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                  Participants ({roomContext.participants.length})
                </CardTitle>
              </CardHeader>
              <CardContent className={`${isMobile ? 'p-3 pt-0' : ''}`}>
                <div className={`space-y-${isMobile ? '2' : '3'}`}>
                  {roomContext.participants.map((participant, index) => (
                    <div key={index} className={`flex items-center justify-between ${isMobile ? 'py-2' : 'py-3'} ${index !== roomContext.participants.length - 1 ? 'border-b border-border/20' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center ${isMobile ? 'w-7 h-7' : 'w-8 h-8'} rounded-full bg-primary/10 text-primary font-semibold ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          {participant.charAt(0).toUpperCase()}
                        </div>
                        <span className={`${isMobile ? 'text-sm' : ''} font-medium`}>{participant}</span>
                        {participant === roomContext.createdBy && (
                          <Crown className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-yellow-500`} />
                        )}
                      </div>
                      {isCreator && participant !== roomContext.createdBy && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveUser(roomContext.sessionId || '', participant)}
                          disabled={removingUser === participant}
                          className={`${isMobile ? 'h-7 w-7 p-0' : ''} text-red-600 hover:text-red-700 hover:bg-red-50`}
                        >
                          {removingUser === participant ? (
                            <Loader2 className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} animate-spin`} />
                          ) : (
                            <X className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            {isCreator && (
              <Card className={`border-red-200 ${isMobile ? 'shadow-none border-border/30' : ''}`}>
                <CardHeader className={isMobile ? 'p-3 pb-2' : ''}>
                  <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'} text-red-600 flex items-center gap-2`}>
                    <Trash2 className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                    Danger Zone
                  </CardTitle>
                </CardHeader>
                <CardContent className={`${isMobile ? 'p-3 pt-0' : ''}`}>
                  {!showDeleteConfirm ? (
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteConfirm(true)}
                      className={`w-full ${isMobile ? 'h-9 text-sm' : ''}`}
                    >
                      <Trash2 className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} mr-2`} />
                      Delete Room
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-red-600 font-medium`}>
                        Are you sure? This action cannot be undone.
                      </p>
                      <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteRoom}
                          disabled={isPending}
                          className={`${isMobile ? 'w-full h-9 text-sm' : 'flex-1'}`}
                        >
                          {isPending ? (
                            <Loader2 className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} mr-2 animate-spin`} />
                          ) : (
                            <Trash2 className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} mr-2`} />
                          )}
                          {isPending ? 'Deleting...' : 'Yes, Delete'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowDeleteConfirm(false)}
                          className={`${isMobile ? 'w-full h-9 text-sm' : 'flex-1'}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default RoomSettingsModal;