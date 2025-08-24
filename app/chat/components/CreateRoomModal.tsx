'use client';

import React, { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Share2, Plus, Sparkles, Users, Clock, Shield, X } from 'lucide-react';
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
            className="h-auto max-h-[85vh] p-0 gap-0 flex flex-col rounded-t-xl border-t-2 bg-background"
            style={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y'
            }}
          >
            {/* Drag handle */}
            <div className="w-12 h-1.5 rounded-full bg-muted mx-auto mt-3 mb-4" />

            {/* Header */}
            <SheetHeader className="px-6 pb-4 text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-amber-600" />
                </div>
              </div>
              <SheetTitle className="text-xl font-medium text-foreground">
                {!createdRoom ? 'Create Room' : 'Room Created'}
              </SheetTitle>
              <p className="text-muted-foreground text-sm">
                {!createdRoom
                  ? 'Create a secure chat room for your team'
                  : 'Share with others to start collaborating'}
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
                    placeholder="Team Planning"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isCreating) {
                        handleCreateRoom();
                      }
                    }}
                  />
                </div>

                {/* Room Features */}
                <div className="bg-muted/30 p-4 rounded-lg border border-border/40">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>5 participants maximum</div>
                    <div>Expires in 7 days</div>
                    <div>Password protected automatically</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={handleCreateRoom}
                    disabled={isCreating || !roomName.trim()}
                    className="w-full"
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
                <div className="bg-muted/30 p-4 rounded-lg border border-border/40">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Code
                      </Label>
                      <p className="font-mono text-base mt-1">
                        {createdRoom.room.shareCode}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Password
                      </Label>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="font-mono text-base">
                          {showPassword ? createdRoom.room.password : '•••••••'}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          className="h-6 w-6 p-0"
                        >
                          <span className="text-xs">
                            {showPassword ? 'Hide' : 'Show'}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={() => setShowShareModal(true)}
                    className="w-full bg-amber-500 hover:bg-amber-600"
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
        <DialogContent className="sm:max-w-md backdrop-blur-md bg-background/95 border-border/40">
          {!createdRoom ? (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-medium">Create Room</DialogTitle>
                    <DialogDescription className="text-muted-foreground/80">
                      Create a secure chat room for your team
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="roomName" className="text-sm font-medium">Room Name</Label>
                  <Input
                    id="roomName"
                    placeholder="Team Planning"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isCreating) {
                        handleCreateRoom();
                      }
                    }}
                  />
                </div>

                <div className="bg-muted/30 p-4 rounded-lg border border-border/40">
                  <div className="text-sm text-muted-foreground/80 space-y-1">
                    <div>5 participants maximum</div>
                    <div>Expires in 7 days</div>
                    <div>Password protected automatically</div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRoom} disabled={isCreating || !roomName.trim()}>
                  {isCreating ? 'Creating...' : 'Create Room'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            // Show Room Creation Success
            <>
              <DialogHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-medium">Room Created</DialogTitle>
                    <DialogDescription className="text-muted-foreground/80">
                      Share with others to start collaborating
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                <div className="bg-muted/30 p-4 rounded-lg border border-border/40">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Code</Label>
                      <p className="font-mono text-base mt-1">{createdRoom.room.shareCode}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="font-mono text-base">
                          {showPassword ? createdRoom.room.password : '•••••••'}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          className="h-6 w-6 p-0"
                        >
                          <span className="text-xs">{showPassword ? 'Hide' : 'Show'}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  onClick={() => setShowShareModal(true)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Room
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