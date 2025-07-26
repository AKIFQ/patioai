'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getOrCreateSessionId, getStoredDisplayName, storeDisplayName } from '@/lib/utils/session';

interface Room {
  id: string;
  name: string;
  shareCode: string;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
}

interface Participant {
  displayName: string;
  joinedAt: string;
}

interface RoomInfo {
  room: Room;
  participants: Participant[];
  participantCount: number;
}

interface JoinRoomFormProps {
  shareCode: string;
}

export default function JoinRoomForm({ shareCode }: JoinRoomFormProps) {
  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);

  // Generate a session ID for this browser session
  const [sessionId] = useState(() => getOrCreateSessionId());

  // Fetch room info on component mount and load stored display name
  useEffect(() => {
    fetchRoomInfo();
    
    // Load stored display name if available
    const storedName = getStoredDisplayName(shareCode);
    if (storedName) {
      setDisplayName(storedName);
    }
  }, [shareCode]);

  const fetchRoomInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/rooms/${shareCode}/join`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch room info');
      }

      const data = await response.json();
      setRoomInfo(data);
    } catch (error) {
      console.error('Error fetching room info:', error);
      setError(error instanceof Error ? error.message : 'Failed to load room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!displayName.trim()) {
      toast.error('Please enter a display name');
      return;
    }

    if (!roomInfo) {
      toast.error('Room information not loaded');
      return;
    }

    setIsJoining(true);
    
    try {
      const response = await fetch(`/api/rooms/${shareCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          displayName: displayName.trim(),
          sessionId
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join room');
      }

      const data = await response.json();
      setRoomInfo(data);
      setHasJoined(true);
      toast.success('Successfully joined the room!');
      
      // Store display name for this session
      storeDisplayName(shareCode, displayName.trim());
      
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

  const formatExpirationDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 24) {
      return `${diffHours} hours`;
    } else {
      const diffDays = Math.ceil(diffHours / 24);
      return `${diffDays} days`;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Room Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button onClick={fetchRoomInfo} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!roomInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Room not found</p>
      </div>
    );
  }

  if (hasJoined) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Welcome to the Room!</CardTitle>
            <CardDescription className="text-center">
              You've successfully joined "{roomInfo.room.name}"
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Your Name:</span>
                <span className="text-sm text-muted-foreground">{displayName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Participants:</span>
                <span className="text-sm text-muted-foreground">
                  {roomInfo.participantCount}/{roomInfo.room.maxParticipants}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Expires in:</span>
                <span className="text-sm text-muted-foreground">
                  {formatExpirationDate(roomInfo.room.expiresAt)}
                </span>
              </div>
            </div>
            
            {roomInfo.participants.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Current Participants:</Label>
                <div className="mt-2 space-y-1">
                  {roomInfo.participants.map((participant, index) => (
                    <div key={index} className="text-sm text-muted-foreground">
                      {participant.displayName}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="text-center text-sm text-muted-foreground">
              Room chat functionality will be available in Task 3
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join Room</CardTitle>
          <CardDescription>
            You've been invited to join "{roomInfo.room.name}"
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              <span>
                {roomInfo.participantCount}/{roomInfo.room.maxParticipants} participants
              </span>
              <span className="text-muted-foreground">
                ({roomInfo.room.tier} tier)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expires in {formatExpirationDate(roomInfo.room.expiresAt)}</span>
            </div>
          </div>
          
          {roomInfo.participantCount >= roomInfo.room.maxParticipants ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This room is full ({roomInfo.room.maxParticipants} participants maximum)
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="displayName">Your Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="e.g., Alice"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isJoining) {
                      handleJoinRoom();
                    }
                  }}
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  This is how others will see you in the chat
                </p>
              </div>
              
              {roomInfo.participants.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Already in the room:</Label>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {roomInfo.participants.map((p, i) => p.displayName).join(', ')}
                  </div>
                </div>
              )}
              
              <Button 
                onClick={handleJoinRoom} 
                disabled={isJoining || !displayName.trim()}
                className="w-full"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Room'
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}