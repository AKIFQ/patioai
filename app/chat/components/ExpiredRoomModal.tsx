'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Crown, Trash2, Clock, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface ExpiredRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  shareCode: string;
  isCreator?: boolean;
}

export default function ExpiredRoomModal({
  isOpen,
  onClose,
  roomName,
  shareCode,
  isCreator = false
}: ExpiredRoomModalProps) {
  const router = useRouter();

  const handleUpgradeToPro = () => {
    toast.success('Redirecting to upgrade...');
    // TODO: Implement upgrade logic - for now just close modal
    onClose();
    // router.push('/upgrade');
  };

  const handleDeleteRoom = async () => {
    if (!isCreator) {
      toast.error('Only room creators can delete rooms');
      return;
    }

    try {
      const response = await fetch(`/api/rooms/${shareCode}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete room');
      }

      toast.success('Room deleted successfully');
      onClose();
      router.push('/chat');
      
      // Trigger a refresh of the rooms list
      window.location.reload();
    } catch (error) {
      console.error('Error deleting room:', error);
      toast.error('Failed to delete room. Please try again.');
    }
  };

  const handleGoBack = () => {
    onClose();
    router.push('/chat');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-muted-foreground font-medium">
            <Clock className="h-4 w-4" />
            Room Expired
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert className="border-border/40 bg-muted/30">
            <AlertDescription className="text-muted-foreground/80">
              <span className="font-medium">"{roomName}"</span> has expired and is no longer accessible.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground/80">
              Choose an option to continue:
            </div>

            {/* Upgrade to Pro Option */}
            <Button 
              onClick={handleUpgradeToPro}
              className="w-full justify-start gap-3 h-10 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all duration-200"
            >
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <Crown className="h-3 w-3 text-white" />
              </div>
              <div className="text-left">
                <div className="font-medium text-sm">Upgrade to Pro</div>
                <div className="text-xs text-white/80 hidden sm:block">Extend room lifetime & unlock premium features</div>
              </div>
              <Zap className="h-3 w-3 ml-auto" />
            </Button>

            {/* Delete Room Option - Only for creators */}
            {isCreator && (
              <Button 
                onClick={handleDeleteRoom}
                variant="outline"
                className="w-full justify-start gap-3 h-10 border-border/40 hover:bg-destructive/5 hover:border-destructive/30 transition-all duration-200"
              >
                <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-sm text-destructive">Delete Room</div>
                  <div className="text-xs text-muted-foreground/80 hidden sm:block">Permanently remove this expired room</div>
                </div>
              </Button>
            )}

            {/* Go Back Option */}
            <Button 
              onClick={handleGoBack}
              variant="ghost"
              className="w-full h-10 text-muted-foreground hover:text-foreground transition-colors"
            >
              Go Back to Chat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 