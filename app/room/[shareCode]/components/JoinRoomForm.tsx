'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { AlertCircle, Loader2, Share2, UserPlus, Info } from 'lucide-react';
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
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <div className="w-full max-w-md">
        <Card className="backdrop-blur-md bg-background/95 border-border/40 shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                <UserPlus className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl font-medium">Join Room</CardTitle>
                <CardDescription className="text-muted-foreground/80">
                  You've been invited to join "{roomInfo.room.name}"
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShareModal(true)}
                className="hover:bg-muted/50"
                title="Share this room"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="bg-muted/30 p-4 rounded-lg border border-border/40">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground/80">Participants</span>
                  <div className="font-medium">
                    {roomInfo.participantCount}/{roomInfo.room.maxParticipants}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground/80">Expires</span>
                  <div className="font-medium">{formatExpirationDate(roomInfo.room.expiresAt)}</div>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {roomInfo.participantCount >= roomInfo.room.maxParticipants ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This room is full ({roomInfo.room.maxParticipants} participants maximum)
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="displayName" className="text-sm font-medium">Display Name</Label>
                    <Input
                      id="displayName"
                      placeholder="How others will see you"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isJoining) {
                          handleJoinRoom();
                        }
                      }}
                      maxLength={50}
                      disabled={isAuthenticated}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {isAuthenticated 
                        ? "Using your account name" 
                        : "This is how others will see you"
                      }
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Room Password <span className="text-red-500">*</span>
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs p-3">
                            <div className="space-y-1 text-xs">
                              <p className="font-medium">Auto-Generated Security</p>
                              <p>Passwords are automatically generated and refreshed every 36 hours to ensure maximum room security.</p>
                              <p className="text-muted-foreground">Each room gets a new secure password every 36 hours.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
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
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      All rooms are password protected for security
                    </p>
                  </div>
                </div>
                
                <Button 
                  onClick={handleJoinRoom} 
                  disabled={isJoining || !displayName.trim() || !password.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-600"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
      </div>

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