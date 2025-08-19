'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Clock, AlertCircle, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { getOrCreateSessionId, getStoredDisplayName, storeDisplayName } from '@/lib/utils/session';
import { useRouter } from 'next/navigation';
import ShareRoomModal from '@/app/chat/components/ShareRoomModal';
import { useSiteUrl } from '@/hooks/useSiteUrl';

interface Room {
  id: string;
  name: string;
  shareCode: string;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
  password: string;
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
  const [password, setPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const router = useRouter();
  const siteUrl = useSiteUrl();

  // Generate a session ID for this browser session
  const [sessionId] = useState(() => getOrCreateSessionId());

  // Check if user is authenticated and get their info
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/user');
        if (response.ok) {
          const userData = await response.json();
          if (userData.user) {
            setIsAuthenticated(true);
            const authDisplayName = userData.user.user_metadata?.full_name || 
                                  userData.user.email?.split('@')[0] || 
                                  'User';
            setDisplayName(authDisplayName);
          }
        }
      } catch (error) {
        console.log('User not authenticated');
      }
    };

    checkAuthStatus();
  }, []);

  // Fetch room info on component mount and load stored display name
  useEffect(() => {
    fetchRoomInfo();
    
    // Only check stored display name if user is not authenticated
    if (!isAuthenticated) {
      const storedName = getStoredDisplayName(shareCode);
      if (storedName) {
        setDisplayName(storedName);
        
        // If user has a stored session, try to auto-join them
        const storedSessionId = getOrCreateSessionId();
        if (storedSessionId) {
          // Auto-redirect to chat if they have a stored session (with a small delay to avoid UI jumping)
          setTimeout(() => {
            router.push(`/chat/room/${shareCode}?displayName=${encodeURIComponent(storedName)}&sessionId=${encodeURIComponent(storedSessionId)}`);
          }, 100);
          return;
        }
      }
    }
  }, [shareCode, router, isAuthenticated]);

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

    // Password is always required
    if (!password.trim()) {
      toast.error('Please enter the room password to join this secure room');
      return;
    }

    setIsJoining(true);
    
    try {
      // Use authenticated session ID if user is authenticated
      const finalSessionId = isAuthenticated ? `auth_${sessionId}` : sessionId;
      
      const response = await fetch(`/api/rooms/${shareCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          displayName: displayName.trim(),
          sessionId: finalSessionId,
          password: password.trim() || null
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.error === 'Incorrect password') {
          toast.error('Incorrect password. Please try again.');
          setShowPasswordInput(true);
          return;
        }
        throw new Error(error.error || 'Failed to join room');
      }

      const data = await response.json();
      setRoomInfo(data);
      setHasJoined(true);
      toast.success('Successfully joined the room!');
      
      // Store display name for this session (only for non-authenticated users)
      if (!isAuthenticated) {
        storeDisplayName(shareCode, displayName.trim());
      }
      
      // Redirect to chat interface with room context
      router.push(`/chat/room/${shareCode}?displayName=${encodeURIComponent(displayName.trim())}&sessionId=${encodeURIComponent(finalSessionId)}`);
      
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
      <div className="flex items-center justify-center min-h-screen bg-background">
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

  if (isJoining || hasJoined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Joining room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>Join Room</CardTitle>
              <CardDescription>
                You've been invited to join "{roomInfo.room.name}"
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowShareModal(true)}
              className="ml-4 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
              title="Share this room"
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          </div>
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <span className="text-lg">🔒</span>
              <span>This room is password protected. You'll need the password to join.</span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-lg space-y-2">
            <div className="text-sm">
              <span>
                {roomInfo.participantCount}/{roomInfo.room.maxParticipants} participants
              </span>
              <span className="text-muted-foreground">
                ({roomInfo.room.tier} tier)
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
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
                  disabled={isAuthenticated}
                />
                <p className="text-xs text-muted-foreground">
                  {isAuthenticated 
                    ? "Using your account name" 
                    : "This is how others will see you in the chat"
                  }
                </p>
              </div>

              {/* Password input - always shown since all rooms require passwords */}
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
                      handleJoinRoom();
                    }
                  }}
                  className="h-9"
                />
                <div className="text-xs text-muted-foreground">
                  <span className="text-blue-600 font-medium">🔒</span> All rooms are password protected for security
                </div>
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
                disabled={isJoining || !displayName.trim() || !password.trim()}
                className="w-full"
              >
                {isJoining ? (
                  <>
                    Joining...
                  </>
                ) : !password.trim() ? (
                  'Enter Password'
                ) : (
                  'Join Room'
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Share Room Modal */}
      {showShareModal && roomInfo && (
        <ShareRoomModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          room={{
            id: roomInfo.room.id,
            name: roomInfo.room.name,
            shareCode: roomInfo.room.shareCode,
            maxParticipants: roomInfo.room.maxParticipants,
            tier: roomInfo.room.tier,
            expiresAt: roomInfo.room.expiresAt,
            createdAt: roomInfo.room.createdAt,
            password: roomInfo.room.password
          }}
          shareableLink={`${siteUrl}/room/${shareCode}`}
        />
      )}
    </div>
  );
}