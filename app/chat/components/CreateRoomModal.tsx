'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Share2, Plus, Sparkles, Users, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import ShareRoomModal from './ShareRoomModal';
import { useIsMobile } from '@/hooks/use-mobile';

interface Room {
  id: string;
  name: string;
  shareCode: string;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
  password?: string | null;
  passwordExpiresAt?: string | null;
}

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomCreated?: () => void;
}

export default function CreateRoomModal({ isOpen, onClose, onRoomCreated }: CreateRoomModalProps) {
  const router = useRouter();
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<{ room: Room; shareableLink: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const isMobile = useIsMobile();

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      toast.error('Please enter a room name');
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roomName
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create room');
      }

      const data = await response.json();
      setCreatedRoom(data);

    } catch (error) {
      console.error('Error creating room:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (room: Room) => {
    try {
      // Join the room by navigating to it
      // Generate a random display name or use stored user info
      const storedDisplayName = localStorage.getItem('displayName');
      const displayName = storedDisplayName || 'Anonymous';
      const sessionId = `auth_${Date.now()}`;
      
      // Navigate to the room
      router.push(`/chat/room/${room.shareCode}?displayName=${encodeURIComponent(displayName)}&sessionId=${encodeURIComponent(sessionId)}`);
      
      // Close modal and notify parent
      handleClose();
      
      toast.success('Joined room successfully!');
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error('Failed to join room');
    }
  };

  const handleClose = () => {
    const wasRoomCreated = !!createdRoom;
    setRoomName('');
    setCreatedRoom(null);
    setShowShareModal(false);
    onClose();

    // Notify parent that a room was created so it can refresh the room list
    if (wasRoomCreated && onRoomCreated) {
      onRoomCreated();
    }
  };

  const formatExpirationDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Mobile-optimized bottom sheet design
  if (isMobile) {
    return (
      <>
        {/* Mobile Create Room Modal - Bottom Sheet */}
        <Sheet open={isOpen && !showShareModal} onOpenChange={handleClose}>
          <SheetContent
            side="bottom"
            className="h-auto max-h-[85vh] p-0 gap-0 flex flex-col rounded-t-xl border-t-2 bg-background shadow-2xl"
            style={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y'
            }}
          >
            <VisuallyHidden>
              <SheetTitle>Create Room</SheetTitle>
            </VisuallyHidden>
            {/* Drag handle */}
            <div className="w-12 h-1.5 rounded-full bg-muted mx-auto mt-3 mb-4" />

            {/* Header */}
            <SheetHeader className="px-6 pb-4 text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  {!createdRoom ? (
                    <Plus className="h-5 w-5 text-primary" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-primary" />
                  )}
                </div>
              </div>
              <SheetTitle className="text-xl font-medium text-foreground">
                {!createdRoom ? 'Create Room' : 'Room Ready'}
              </SheetTitle>
              <p className="text-muted-foreground text-sm">
                {!createdRoom
                  ? 'Start a collaborative workspace'
                  : 'Your workspace is ready for collaboration'}
              </p>
            </SheetHeader>

            {!createdRoom ? (
              <div className="flex-1 px-6 pb-6 space-y-6">
                {/* Room Name Input */}
                <div className="space-y-2">
                  <Label htmlFor="roomName" className="text-sm font-medium">
                    Room Name
                  </Label>
                  <Input
                    id="roomName"
                    placeholder="Product Planning"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isCreating) {
                        handleCreateRoom();
                      }
                    }}
                    className="text-base h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Room Features */}
                <div className="bg-muted/20 p-4 rounded-lg border border-border/30">
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 opacity-60" />
                      <span>5 participants max</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 opacity-60" />
                      <span>Expires in 7 days</span>
                    </div>
                    <div>
                      <span>Auto-generated password</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={handleCreateRoom}
                    disabled={isCreating || !roomName.trim()}
                    className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {isCreating ? 'Creating...' : 'Create Room'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 px-6 pb-6 space-y-6">
                {/* Room Details */}
                <div className="bg-muted/20 p-5 rounded-lg border border-border/30">
                  <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Room Code
                      </Label>
                      <p className="font-mono text-lg font-medium mt-2 text-foreground">
                        {createdRoom.room.shareCode}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Password
                      </Label>
                      <div className="flex items-center gap-2 mt-2">
                        <p className="font-mono text-lg font-medium text-foreground">
                          {showPassword ? createdRoom.room.password : '•••••••'}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          className="h-7 px-2 text-xs"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={() => setShowShareModal(true)}
                    className="w-full bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share Room
                  </Button>
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Share Room Modal */}
        {showShareModal && createdRoom && (
          <ShareRoomModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            room={createdRoom.room}
            shareableLink={createdRoom.shareableLink}
          />
        )}
      </>
    );
  }


  // Desktop version - keep existing design
  return (
    <>
      {/* Main Create Room Modal */}
      <Dialog open={isOpen && !showShareModal} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg backdrop-blur-md bg-background/95 border-border/30 shadow-xl">
          {!createdRoom ? (
            <>
              <DialogHeader className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-medium text-foreground">Create Room</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Start a collaborative workspace
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="roomName" className="text-sm font-medium">Room Name</Label>
                  <Input
                    id="roomName"
                    placeholder="Product Planning"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isCreating) {
                        handleCreateRoom();
                      }
                    }}
                    className="text-base h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="bg-muted/20 p-4 rounded-lg border border-border/30">
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 opacity-60" />
                      <span>5 participants max</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 opacity-60" />
                      <span>Expires in 7 days</span>
                    </div>
                    <div>
                      <span>Auto-generated password</span>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateRoom} 
                  disabled={isCreating || !roomName.trim()}
                  className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isCreating ? 'Creating...' : 'Create Room'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            // Show Room Creation Success
            <>
              <DialogHeader className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-medium text-foreground">Room Ready</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Your workspace is ready for collaboration
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                <div className="bg-muted/20 p-5 rounded-lg border border-border/30">
                  <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Code</Label>
                      <p className="font-mono text-lg font-medium mt-2 text-foreground">{createdRoom.room.shareCode}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <p className="font-mono text-lg font-medium text-foreground">
                          {showPassword ? createdRoom.room.password : '•••••••'}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          className="h-7 px-2 text-xs"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button 
                  onClick={() => handleJoinRoom(createdRoom.room)}
                  className="flex-1 bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Join Room
                </Button>
                <Button
                  onClick={() => setShowShareModal(true)}
                  className="flex-1 bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
                <Button onClick={handleClose} variant="outline">
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Separate Share Room Modal */}
      {showShareModal && createdRoom && (
        <ShareRoomModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          room={createdRoom.room}
          shareableLink={createdRoom.shareableLink}
        />
      )}
    </>
  );
}