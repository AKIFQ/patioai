'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// UI Components
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Users,
  Edit3,
  Trash2,
  UserPlus,
  UserMinus,
  Copy,
  CheckCircle,
  Crown,
  Clock,
  Shield,
  AlertTriangle,
  Loader2
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
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted/70 transition-colors">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Room Settings
          </DialogTitle>
          <DialogDescription>
            Manage your room settings, participants, and preferences.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Room Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  Room Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Room Name */}
                <div className="space-y-2">
                  <Label htmlFor="room-name">Room Name</Label>
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
                          className="flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={handleUpdateRoomName}
                          disabled={isPending}
                        >
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingName(false);
                            setNewRoomName(roomContext.roomName);
                          }}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Input
                          value={roomContext.roomName}
                          disabled
                          className="flex-1"
                        />
                        {isCreator && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingName(true)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Share Link */}
                <div className="space-y-2">
                  <Label>Share Link</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${roomContext.shareCode}`}
                      disabled
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyShareLink}
                    >
                      {isCopied ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Room Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground/80 uppercase tracking-wide">Tier</Label>
                    <Badge variant={roomContext.tier === 'pro' ? 'default' : 'secondary'} className="text-xs">
                      {roomContext.tier === 'pro' ? (
                        <>
                          <Shield className="h-3 w-3 mr-1" />
                          Pro
                        </>
                      ) : (
                        'Free'
                      )}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground/80 uppercase tracking-wide">Participants</Label>
                    <div className="text-sm font-medium">
                      {roomContext.participants.length} / {roomContext.maxParticipants}
                    </div>
                  </div>
                </div>

                {/* Expiry Warning */}
                {expiresAt && (
                  <div className={`p-3 rounded-lg border-border/40 ${
                    isExpiringSoon(expiresAt) 
                      ? 'bg-yellow-50/50 border-yellow-200/40 dark:bg-yellow-950/20 dark:border-yellow-800/40' 
                      : 'bg-muted/50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Clock className={`h-4 w-4 ${
                        isExpiringSoon(expiresAt) ? 'text-yellow-600' : 'text-muted-foreground/80'
                      }`} />
                      <span className="text-sm font-medium">
                        {isExpiringSoon(expiresAt) ? 'Expires Soon' : 'Expires'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {formatExpiryDate(expiresAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Participants Management */}
            <Card className="border-border/40 bg-background/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Participants ({roomContext.participants.length})</span>
                  <span className="sm:hidden">Users ({roomContext.participants.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {roomContext.participants.map((participant) => (
                    <div
                      key={participant.sessionId}
                      className="flex items-center justify-between p-3 rounded-lg border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-3 w-3 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2 text-sm">
                            {participant.displayName}
                            {participant.sessionId === roomContext.sessionId && (
                              <Badge variant="outline" className="text-xs h-5">You</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground/80 hidden sm:block">
                            Joined {new Date(participant.joinedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      
                      {isCreator && participant.sessionId !== roomContext.sessionId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveUser(participant.sessionId, participant.displayName)}
                          disabled={removingUser === participant.sessionId}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50/50 transition-colors"
                        >
                          {removingUser === participant.sessionId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserMinus className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Participant Instructions */}
                <div className="mt-3 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/40 dark:border-blue-800/40">
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      <span className="hidden sm:inline">Invite More People</span>
                      <span className="sm:hidden">Invite Others</span>
                    </span>
                  </div>
                  <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
                    <span className="hidden sm:inline">Share the room link with others to invite them to this room.</span>
                    <span className="sm:hidden">Share the room link to invite others.</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-200/40 dark:border-red-800/40 bg-red-50/20 dark:bg-red-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline">Danger Zone</span>
                  <span className="sm:hidden">Actions</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isCreator ? (
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-red-900 dark:text-red-100 text-sm">Delete Room</h4>
                      <p className="text-xs text-red-700/80 dark:text-red-300/80 mb-3">
                        <span className="hidden sm:inline">This will permanently delete the room and all its messages. This action cannot be undone.</span>
                        <span className="sm:hidden">Permanently delete room and messages.</span>
                      </p>
                      {!showDeleteConfirm ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="h-8 border-red-200/40 text-red-600 hover:bg-red-50/50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          <span className="hidden sm:inline">Delete Room</span>
                          <span className="sm:hidden">Delete</span>
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-red-900 dark:text-red-100">
                            Are you sure? This action cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={handleDeleteRoom}
                              disabled={isPending}
                              className="h-8"
                            >
                              {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                              )}
                              <span className="hidden sm:inline">Yes, Delete Room</span>
                              <span className="sm:hidden">Delete</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowDeleteConfirm(false)}
                              disabled={isPending}
                              className="h-8"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium text-red-900 dark:text-red-100 text-sm">Leave Room</h4>
                    <p className="text-xs text-red-700/80 dark:text-red-300/80 mb-3">
                      <span className="hidden sm:inline">You will be removed from this room and won't be able to see new messages.</span>
                      <span className="sm:hidden">Leave this room permanently.</span>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLeaveRoom}
                      disabled={isPending}
                      className="h-8 border-red-200/40 text-red-600 hover:bg-red-50/50 transition-colors"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <UserMinus className="h-4 w-4 mr-2" />
                      )}
                      <span className="hidden sm:inline">Leave Room</span>
                      <span className="sm:hidden">Leave</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default RoomSettingsModal;