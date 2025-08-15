'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Room {
  id: string;
  name: string;
  shareCode: string;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
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
  const [isCopied, setIsCopied] = useState(false);

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
        body: JSON.stringify({ name: roomName }),
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

  const handleCopyLink = async () => {
    if (!createdRoom) return;
    
    try {
      await navigator.clipboard.writeText(createdRoom.shareableLink);
      setIsCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleClose = () => {
    const wasRoomCreated = !!createdRoom;
    setRoomName('');
    setCreatedRoom(null);
    setIsCopied(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md z-[200]">
        {!createdRoom ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Room</DialogTitle>
              <DialogDescription>
                Create a new chat room and get a shareable link to invite others.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomName" className="text-sm font-medium">Room Name</Label>
                <Input
                  id="roomName"
                  placeholder="e.g., Family Vacation Planning"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isCreating) {
                      handleCreateRoom();
                    }
                  }}
                  className="h-9"
                />
              </div>
              
              <div className="bg-muted/30 p-3 rounded-lg space-y-2 border border-border/40">
                <div className="text-sm text-muted-foreground/80">
                  <span className="hidden sm:inline">Free tier: 5 participants max</span>
                  <span className="sm:hidden">5 participants max</span>
                </div>
                <div className="text-sm text-muted-foreground/80">
                  <span>Expires in 7 days</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreateRoom} disabled={isCreating || !roomName.trim()}>
                {isCreating ? 'Creating...' : 'Create Room'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">Room Created Successfully!</DialogTitle>
              <DialogDescription className="text-muted-foreground/80">
                <span className="hidden sm:inline">Share this link with others to invite them to your room.</span>
                <span className="sm:hidden">Share this link to invite others.</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-muted/30 p-4 rounded-lg space-y-3 border border-border/40">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Room Name</Label>
                  <p className="text-sm font-medium">{createdRoom.room.name}</p>
                </div>
                
                <div>
                  <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Share Code</Label>
                  <p className="text-sm font-mono text-muted-foreground/80">{createdRoom.room.shareCode}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Max Participants</Label>
                    <p className="text-muted-foreground/80 font-medium">{createdRoom.room.maxParticipants}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Expires</Label>
                    <p className="text-muted-foreground/80 font-medium">{formatExpirationDate(createdRoom.room.expiresAt)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Shareable Link</Label>
                <div className="flex gap-2">
                  <Input 
                    value={createdRoom.shareableLink} 
                    readOnly 
                    className="font-mono text-sm h-9"
                  />
                  <Button 
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyLink}
                    className="shrink-0 h-9 w-9 p-0 hover:bg-muted/70 transition-colors"
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} size="sm" className="h-8">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}