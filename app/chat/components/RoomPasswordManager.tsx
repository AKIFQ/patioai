'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface RoomPasswordInfo {
  password: string;
  message?: string;
}

interface RoomPasswordManagerProps {
  shareCode: string;
  roomName: string;
}

export default function RoomPasswordManager({ shareCode, roomName }: RoomPasswordManagerProps) {
  const [passwordInfo, setPasswordInfo] = useState<RoomPasswordInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPasswordInfo = async () => {
    try {
      const response = await fetch(`/api/rooms/${shareCode}/password`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch password info');
      }

      const data = await response.json();
      setPasswordInfo(data);
    } catch (error) {
      console.error('Error fetching password info:', error);
      toast.error('Failed to load password info');
    }
  };

  const regeneratePassword = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/rooms/${shareCode}/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to regenerate password');
      }

      const data = await response.json();
      setPasswordInfo(data);
      toast.success(data.message || 'Password regenerated successfully!');
    } catch (error) {
      console.error('Error regenerating password:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate password');
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyPassword = async () => {
    if (!passwordInfo?.password) return;
    
    try {
      await navigator.clipboard.writeText(passwordInfo.password);
      toast.success('Password copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy password');
    }
  };

  useEffect(() => {
    fetchPasswordInfo();
  }, [shareCode]);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Password</div>
      <div className="flex gap-2 items-center">
        <div className="flex-1 text-sm px-3 py-2 bg-muted/30 border border-border/40 rounded-lg font-mono">
          {passwordInfo?.password || 'Loading...'}
        </div>
        <Button
          onClick={copyPassword}
          disabled={!passwordInfo?.password || passwordInfo.password === 'Loading...'}
          size="sm"
          variant="outline"
          className="px-3"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          onClick={regeneratePassword}
          disabled={isRefreshing}
          size="sm"
          className="bg-forest-base hover:bg-forest-600 text-white px-3"
        >
          {isRefreshing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}