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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Users, Clock, RefreshCw, Eye, EyeOff, Share2 } from 'lucide-react';
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
        <DialogContent className="sm:max-w-md z-[200]">
          {!createdRoom ? (
            <>
              <DialogHeader>
                <DialogTitle>Create Room</DialogTitle>
                <DialogDescription>
                  Create a new secure chat room with auto-generated password protection.
                </DialogDescription>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <span className="text-lg">🔒</span>
                    <span>Your room will be automatically protected with a secure password that expires in 36 hours.</span>
                  </div>
                </div>
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
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Auto-Generated Password
                      <span className="text-xs text-muted-foreground ml-2">Secure 8-character password</span>
                    </Label>
                    <div className="text-xs text-green-600 font-medium">
                      🔐 Auto-Secured
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm text-green-800">
                      <div className="font-medium">Password will be automatically generated</div>
                      <div className="text-xs mt-1">• 8 characters with mixed case and numbers</div>
                      <div className="text-xs">• Expires in 36 hours for security</div>
                      <div className="text-xs">• Only visible to room admin</div>
                    </div>
                  </div>
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
            // Show Room Creation Success
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
                  
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Password Protection</Label>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-green-600 font-medium">🔐 Auto-Generated Secure Password</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPassword(!showPassword)}
                        className="h-6 px-2 text-xs"
                      >
                        {showPassword ? 'Hide' : 'View'} Password
                      </Button>
                    </div>
                    {showPassword && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                        <div className="font-mono text-green-800 font-medium">{createdRoom.room.password}</div>
                        <div className="text-green-600 mt-1">
                          Expires {createdRoom.room.passwordExpiresAt ? 
                            new Date(createdRoom.room.passwordExpiresAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 
                            'in 36 hours'
                          } • Only visible to you
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Max Participants</Label>
                      <p className="text-muted-foreground/80 font-medium">{createdRoom.room.maxParticipants}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Expires</Label>
                      <p className="text-sm text-muted-foreground/80 font-medium">
                        {formatExpirationDate(createdRoom.room.expiresAt)}
                      </p>
                    </div>
                  </div>
                </div>


              </div>

              <DialogFooter className="flex gap-2">
                <Button 
                  onClick={() => setShowShareModal(true)} 
                  size="sm" 
                  className="h-8 bg-blue-600 hover:bg-blue-700"
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Share Room
                </Button>
                <Button onClick={handleClose} size="sm" className="h-8">
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