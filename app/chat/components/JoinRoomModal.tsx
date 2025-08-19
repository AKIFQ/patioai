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
import { Users, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';


interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  const [roomLink, setRoomLink] = useState('');
  const [password, setPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const router = useRouter();

  const extractShareCodeFromLink = (link: string): string | null => {
    try {
      // Handle various link formats:
      // - http://localhost:3000/room/A1B2C3D4E5F6
      // - https://yourapp.com/room/123456789ABC
      // - /room/ABCDEF123456
      // - A1B2C3D4E5F6 (just the share code)
      
      const trimmedLink = link.trim();
      
      // If it's just a share code (12-character hex format)
      if (!trimmedLink.includes('/') && /^[A-F0-9]{12}$/i.test(trimmedLink)) {
        return trimmedLink.toUpperCase();
      }
      
      // Extract from URL - 12-character hex format
      const urlMatch = trimmedLink.match(/\/room\/([A-F0-9]{12})/i);
      if (urlMatch) {
        return urlMatch[1].toUpperCase();
      }
      
      // Try to extract from end of URL if it ends with the share code
      const segments = trimmedLink.split('/');
      const lastSegment = segments[segments.length - 1];
      if (/^[A-F0-9]{12}$/i.test(lastSegment)) {
        return lastSegment.toUpperCase();
      }
      
      return null;
    } catch {
      return null;
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRoomLink(text);
    } catch (error) {
      toast.error('Failed to paste from clipboard');
    }
  };

  const handleJoinRoom = async () => {
    if (!roomLink.trim()) {
      toast.error('Please enter a room link or share code');
      return;
    }

    const shareCode = extractShareCodeFromLink(roomLink);
    if (!shareCode) {
      toast.error('Invalid room link format. Please check the link and try again.');
      return;
    }

    setIsJoining(true);
    
    try {
      // First, check if the room exists and get room info
      const response = await fetch(`/api/rooms/${shareCode}/join`, {
        method: 'GET',
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 404) {
          throw new Error('Room not found. Please check the link and try again.');
        } else if (response.status === 410) {
          throw new Error('This room has expired.');
        } else {
          throw new Error(error.error || 'Failed to access room');
        }
      }

      const roomData = await response.json();
      setRoomInfo(roomData);
      
      // All rooms now require passwords
      setShowPasswordInput(true);
      setIsJoining(false);
      
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join room');
      setIsJoining(false);
    }
  };

  const joinRoomWithPassword = async (shareCode: string, password: string | null) => {
    setIsJoining(true);
    
    try {
      // Generate a session ID for anonymous users
      const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      // Join the room with password
      const response = await fetch(`/api/rooms/${shareCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: `Guest_${Math.random().toString(36).substring(2, 6)}`,
          sessionId,
          password
        }),
      });

      if (!response.ok) {
        const error = await response.json();
              if (error.error === 'Incorrect password') {
        toast.error('Incorrect password. Please check the password and try again.');
        return;
      }
        throw new Error(error.error || 'Failed to join room');
      }

      const joinData = await response.json();
      
      // Show success message
      toast.success(`Joined "${joinData.room.name}" successfully!`);
      
      // Navigate to the room
      router.push(`/room/${shareCode}`);
      
      // Close modal
      handleClose();
      
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    setRoomLink('');
    setPassword('');
    setRoomInfo(null);
    setShowPasswordInput(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md z-[200]">
        <DialogHeader>
          <DialogTitle>Join Room</DialogTitle>
          <DialogDescription>
            Enter a room link or share code to join an existing chat room.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomLink" className="text-sm font-medium">
              <span className="hidden sm:inline">Room Link or Share Code</span>
              <span className="sm:hidden">Room Link</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="roomLink"
                placeholder="e.g., A1B2C3D4E5F6 or https://yourapp.com/room/123456789ABC"
                value={roomLink}
                onChange={(e) => setRoomLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isJoining) {
                    handleJoinRoom();
                  }
                }}
                className="font-mono text-sm h-9"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePaste}
                className="shrink-0 h-9 hover:bg-muted/70 transition-colors"
              >
                Paste
              </Button>
            </div>
            
            {/* Show extracted share code preview */}
            {roomLink.trim() && (
              <div className="text-xs text-muted-foreground/80">
                {extractShareCodeFromLink(roomLink) ? (
                  <span className="text-green-600 font-medium">
                    ✓ Share code: {extractShareCodeFromLink(roomLink)}
                  </span>
                ) : (
                  <span className="text-red-600 font-medium">
                    ✗ Invalid format - please check the link
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Password input - shown when room requires password */}
          {showPasswordInput && roomInfo && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Room Password <span className="text-red-500">*</span>
                <span className="text-xs text-muted-foreground ml-2">
                  Required to join this room
                </span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter room password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isJoining) {
                    joinRoomWithPassword(roomInfo.room.shareCode, password);
                  }
                }}
                className="h-9"
              />
              <div className="text-xs text-muted-foreground/80">
                Room: <span className="font-medium">{roomInfo.room.name}</span>
              </div>
              <div className="text-xs text-muted-foreground/80">
                <span className="text-blue-600 font-medium">🔒</span> All rooms are password protected for security
              </div>
            </div>
          )}
          
          <div className="bg-muted/30 p-3 rounded-lg space-y-2 border border-border/40">
            <div className="flex items-center gap-2 text-sm text-muted-foreground/80">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">You can paste the full room link or just the share code</span>
              <span className="sm:hidden">Paste full link or share code</span>
            </div>
            <div className="text-sm text-muted-foreground/80">
              <span className="hidden sm:inline">You'll be asked for a display name when joining</span>
              <span className="sm:hidden">Display name required</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {showPasswordInput ? (
            <Button 
              onClick={() => joinRoomWithPassword(roomInfo.room.shareCode, password)} 
              disabled={isJoining || !password.trim()}
            >
              {isJoining ? 'Joining...' : !password.trim() ? 'Enter Password' : 'Join Room'}
            </Button>
          ) : (
            <Button onClick={handleJoinRoom} disabled={isJoining || !roomLink.trim()}>
              {isJoining ? 'Checking...' : 'Check Room'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}