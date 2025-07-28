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
import { Users, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  const [roomLink, setRoomLink] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const router = useRouter();

  const extractShareCodeFromLink = (link: string): string | null => {
    try {
      // Handle various link formats:
      // - http://localhost:3000/room/FAMILY-VACATION-2024
      // - https://yourapp.com/room/STUDY-GROUP-2025
      // - /room/PROJECT-ALPHA-2024
      // - FAMILY-VACATION-2024 (just the share code)
      
      const trimmedLink = link.trim();
      
      // If it's just a share code (no slashes and looks like a share code)
      if (!trimmedLink.includes('/') && /^[A-Z0-9-]+$/i.test(trimmedLink)) {
        return trimmedLink.toUpperCase();
      }
      
      // Extract from URL - more flexible regex
      const urlMatch = trimmedLink.match(/\/room\/([A-Z0-9-]+)/i);
      if (urlMatch) {
        return urlMatch[1].toUpperCase();
      }
      
      // Try to extract from end of URL if it ends with the share code
      const endMatch = trimmedLink.match(/([A-Z0-9-]+)$/i);
      if (endMatch && endMatch[1].length > 5) { // Reasonable share code length
        return endMatch[1].toUpperCase();
      }
      
      return null;
    } catch (error) {
      return null;
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
      
      // Show success message
      toast.success(`Joining "${roomData.room.name}"...`);
      
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
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRoomLink(text);
      toast.success('Link pasted!');
    } catch (error) {
      toast.error('Failed to paste from clipboard');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Room</DialogTitle>
          <DialogDescription>
            Enter a room link or share code to join an existing chat room.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomLink">Room Link or Share Code</Label>
            <div className="flex gap-2">
              <Input
                id="roomLink"
                placeholder="e.g., FAMILY-VACATION-2024 or https://yourapp.com/room/STUDY-GROUP-2025"
                value={roomLink}
                onChange={(e) => setRoomLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isJoining) {
                    handleJoinRoom();
                  }
                }}
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handlePaste}
                className="shrink-0"
              >
                Paste
              </Button>
            </div>
            
            {/* Show extracted share code preview */}
            {roomLink.trim() && (
              <div className="text-xs text-muted-foreground">
                {extractShareCodeFromLink(roomLink) ? (
                  <span className="text-green-600">
                    ✓ Share code: {extractShareCodeFromLink(roomLink)}
                  </span>
                ) : (
                  <span className="text-red-600">
                    ✗ Invalid format - please check the link
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="bg-muted/50 p-3 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              <span>You can paste the full room link or just the share code</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>You'll be asked for a display name when joining</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleJoinRoom} disabled={isJoining || !roomLink.trim()}>
            {isJoining ? 'Joining...' : 'Join Room'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}