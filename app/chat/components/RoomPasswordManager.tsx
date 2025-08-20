'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, RefreshCw, Copy, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface RoomPasswordInfo {
  password: string;
  expiresAt: string;
  generatedAt: string;
  isExpired: boolean;
  timeUntilExpiry?: number;
  message?: string;
}

interface RoomPasswordManagerProps {
  shareCode: string;
  roomName: string;
}

export default function RoomPasswordManager({ shareCode, roomName }: RoomPasswordManagerProps) {
  const [passwordInfo, setPasswordInfo] = useState<RoomPasswordInfo | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPasswordInfo = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/rooms/${shareCode}/password`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch password info');
      }

      const data = await response.json();
      setPasswordInfo(data);
    } catch (error) {
      console.error('Error fetching password info:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch password info');
    } finally {
      setIsLoading(false);
    }
  };

  const regeneratePassword = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/rooms/${shareCode}/password`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to regenerate password');
      }

      const data = await response.json();
      setPasswordInfo(data);
      setShowPassword(true);
      toast.success('Password regenerated successfully!');
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

  const formatTimeRemaining = (milliseconds: number) => {
    if (milliseconds <= 0) return 'Expired';
    
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    fetchPasswordInfo();
  }, [shareCode]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading password info...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!passwordInfo) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Failed to load password information
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>🔐 Room Password</span>
          {passwordInfo.isExpired && (
            <Badge variant="destructive" className="text-xs">
              Expired
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Manage the password for <span className="font-medium">{roomName}</span>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Password Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Current Password</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
                className="h-8 px-3"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    Show
                  </>
                )}
              </Button>
              {showPassword && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyPassword}
                  className="h-8 px-3 text-blue-600 hover:text-blue-700"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              )}
            </div>
          </div>
          
          {showPassword ? (
            <div className="p-3 bg-muted rounded-lg border">
              <div className="font-mono text-lg font-medium text-center tracking-wider">
                {passwordInfo.password}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-muted rounded-lg border text-center text-muted-foreground">
              ••••••••
            </div>
          )}
        </div>

        {/* Password Status */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Generated
            </Label>
            <p className="font-medium">{formatDate(passwordInfo.generatedAt)}</p>
          </div>
          
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Expires
            </Label>
            <p className="font-medium">{formatDate(passwordInfo.expiresAt)}</p>
          </div>
        </div>

        {/* Time Remaining */}
        {passwordInfo.timeUntilExpiry !== undefined && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800">
              {formatTimeRemaining(passwordInfo.timeUntilExpiry)}
            </span>
          </div>
        )}

        {/* Expired Warning */}
        {passwordInfo.isExpired && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-800">
              Password has expired. Users cannot join until you regenerate it.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={regeneratePassword}
            disabled={isRefreshing}
            variant="outline"
            className="flex-1"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate Password
              </>
            )}
          </Button>
          
          <Button
            onClick={fetchPasswordInfo}
            disabled={isLoading}
            variant="ghost"
            size="sm"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Passwords automatically expire after 36 hours for security</div>
          <div>• Only you can view and manage this password</div>
          <div>• Share the password with users who need to join</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Add missing Label component
const Label = ({ children, className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={className} {...props}>
    {children}
  </label>
); 