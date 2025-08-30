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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, UserPlus, Clipboard, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  const [roomLink, setRoomLink] = useState('');
  const router = useRouter();
  const isMobile = useIsMobile();

  const extractShareCodeFromLink = (link: string): string | null => {
    try {
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

  const handleNext = () => {
    if (!roomLink.trim()) {
      toast.error('Please enter a room link or share code');
      return;
    }

    const shareCode = extractShareCodeFromLink(roomLink);
    if (!shareCode) {
      toast.error('Invalid room link format. Please check the link and try again.');
      return;
    }

    // Navigate directly to the join form for password verification
    router.push(`/room/${shareCode}`);
    handleClose();
  };

  const handleClose = () => {
    setRoomLink('');
    onClose();
  };

  // Mobile-optimized bottom sheet design
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={handleClose}>
        <SheetContent
          side="bottom"
          className="h-auto max-h-[85vh] p-0 gap-0 flex flex-col rounded-t-xl border-t-2 bg-background"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y'
          }}
        >
          <VisuallyHidden>
            <SheetTitle>Join Room</SheetTitle>
          </VisuallyHidden>
          {/* Drag handle */}
          <div className="w-12 h-1.5 rounded-full bg-muted mx-auto mt-3 mb-4" />

          {/* Header */}
          <SheetHeader className="px-6 pb-4 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-forest-faint flex items-center justify-center">
                <UserPlus className="h-4 w-4 text-forest-base" />
              </div>
            </div>
            <SheetTitle className="text-xl font-medium text-foreground">
              Join Room
            </SheetTitle>
            <p className="text-muted-foreground text-sm">
              Enter a room link or share code to continue
            </p>
          </SheetHeader>

          <div className="flex-1 px-6 pb-6 space-y-6">
            {/* Input Field */}
            <div className="space-y-3">
              <Label htmlFor="roomLink" className="text-sm font-medium">
                Room Link or Share Code
              </Label>
              <div className="flex gap-2">
                <Input
                  id="roomLink"
                  placeholder="A1B2C3D4E5F6 or full room link"
                  value={roomLink}
                  onChange={(e) => setRoomLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleNext();
                    }
                  }}
                  className="font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePaste}
                  className="shrink-0 hover:bg-muted/70 transition-colors"
                >
                  Paste
                </Button>
              </div>

              {/* Validation Status */}
              {roomLink.trim() && (
                <div className="text-xs">
                  {extractShareCodeFromLink(roomLink) ? (
                    <span className="text-forest-600 font-medium">
                      Valid format: {extractShareCodeFromLink(roomLink)}
                    </span>
                  ) : (
                    <span className="text-forest-700 font-medium">
                      Invalid format - check the link
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
              <div className="flex items-center gap-2 text-sm text-muted-foreground/80">
                <ExternalLink className="h-4 w-4" />
                <span>Paste the full room link or just the share code</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleNext}
                disabled={!roomLink.trim() || !extractShareCodeFromLink(roomLink)}
                className="w-full bg-forest-base hover:bg-forest-600"
              >
                Next
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
        </SheetContent>
      </Sheet>
    );
  }


  // Desktop version - keep existing design
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md backdrop-blur-md bg-background/95 border-border/40">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-forest-faint flex items-center justify-center">
              <UserPlus className="h-4 w-4 text-forest-base" />
            </div>
            <div>
              <DialogTitle className="text-xl font-medium">Join Room</DialogTitle>
              <DialogDescription className="text-muted-foreground/80">
                Enter a room link or share code to continue
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="roomLink" className="text-sm font-medium">
              Room Link or Share Code
            </Label>
            <div className="flex gap-2">
              <Input
                id="roomLink"
                placeholder="A1B2C3D4E5F6 or full room link"
                value={roomLink}
                onChange={(e) => setRoomLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNext();
                  }
                }}
                className="font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePaste}
                className="shrink-0 hover:bg-muted/70 transition-colors"
              >
                Paste
              </Button>
            </div>

            {roomLink.trim() && (
              <div className="text-xs">
                {extractShareCodeFromLink(roomLink) ? (
                  <span className="text-forest-600 font-medium">
                    Valid format: {extractShareCodeFromLink(roomLink)}
                  </span>
                ) : (
                  <span className="text-forest-700 font-medium">
                    Invalid format - check the link
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
            <div className="flex items-center gap-2 text-sm text-muted-foreground/80">
              <ExternalLink className="h-4 w-4" />
              <span>Paste the full room link or just the share code</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>

          <Button
            onClick={handleNext}
            disabled={!roomLink.trim() || !extractShareCodeFromLink(roomLink)}
            className="bg-forest-base hover:bg-forest-600"
          >
            Next
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}