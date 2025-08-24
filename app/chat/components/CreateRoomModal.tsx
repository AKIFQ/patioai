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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Share2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import ShareRoomModal from './ShareRoomModal';


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
                  onClick={() => handleJoinRoom(createdRoom.room)}
                  className="flex-1 bg-green-500 hover:bg-green-600"
                >
                  Join Room
                </Button>
                <Button 
                  onClick={() => setShowShareModal(true)} 
                  variant="outline"
                  className="flex-1"
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