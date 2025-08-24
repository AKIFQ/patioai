'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface RoomRateLimitHandlerProps {
  shareCode: string;
  roomName: string;
  onAIError?: (error: AIErrorPayload) => void;
  onRoomLimitReached?: (limitType: 'messages' | 'ai_responses' | 'threads', details: RoomLimitDetails) => void;
}

interface AIErrorPayload {
  threadId?: string;
  error: string;
  details?: string;
  timestamp?: number;
  roomLimitExceeded?: boolean;
  limitType?: 'room' | 'user';
  currentUsage?: number;
  limit?: number;
  resetTime?: Date;
}

interface RoomLimitDetails {
  currentUsage: number;
  limit: number;
  resetTime?: Date;
  reason?: string;
}

export function RoomRateLimitHandler({ 
  shareCode, 
  roomName,
  onAIError,
  onRoomLimitReached 
}: RoomRateLimitHandlerProps) {
  const router = useRouter();

  // Handle AI errors with proper room limit notifications
  const handleAIError = (error: AIErrorPayload) => {
    console.log('🚨 Room AI Error:', error);
    
    if (error.roomLimitExceeded) {
      const resetTime = error.resetTime ? new Date(error.resetTime).toLocaleTimeString() : 'soon';
      
      if (error.error.includes('reasoning')) {
        toast.error(`Room reasoning limit reached (${error.currentUsage}/${error.limit}). Resets at ${resetTime}.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
      } else {
        toast.error(`Room AI response limit reached (${error.currentUsage}/${error.limit}). Resets at ${resetTime}.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
      }
    } else {
      // Handle other AI errors
      toast.error(error.error || 'AI response failed. Please try again.');
    }
    
    if (onAIError) {
      onAIError(error);
    }
  };

  // Handle room limit reached notifications
  const handleRoomLimitReached = (limitType: 'messages' | 'ai_responses' | 'threads', details: RoomLimitDetails) => {
    console.log('🚨 Room Limit Reached:', limitType, details);
    
    const resetTime = details.resetTime ? new Date(details.resetTime).toLocaleTimeString() : 'soon';
    
    switch (limitType) {
      case 'messages':
        toast.error(`Room message limit reached (${details.currentUsage}/${details.limit}). Resets at ${resetTime}.`, {
          duration: 6000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
        break;
        
      case 'ai_responses':
        toast.error(`Room AI response limit reached (${details.currentUsage}/${details.limit}). Resets at ${resetTime}.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
        break;
        
      case 'threads':
        toast.warning(`Room thread limit reached (${details.currentUsage}/${details.limit}). Consider upgrading for more threads.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
        break;
    }
    
    if (onRoomLimitReached) {
      onRoomLimitReached(limitType, details);
    }
  };

  // Handle message rate limit errors from fetch responses
  const handleFetchError = async (response: Response) => {
    if (response.status === 429) {
      try {
        const errorData = await response.json();
        
        if (errorData.error === 'ROOM_MESSAGE_LIMIT_EXCEEDED') {
          const resetTime = errorData.resetTime ? new Date(errorData.resetTime).toLocaleTimeString() : 'soon';
          toast.error(`Room message limit reached (${errorData.currentUsage}/${errorData.limit}). Resets at ${resetTime}.`, {
            duration: 6000,
            action: {
              label: 'Upgrade Room',
              onClick: () => router.push('/account')
            }
          });
          return true; // Handled
        }
        
        if (errorData.error === 'THREAD_MESSAGE_LIMIT_EXCEEDED') {
          toast.warning(`Thread limit reached (${errorData.messageCount}/${errorData.limit} messages). Consider starting a new thread for better AI responses.`, {
            duration: 8000,
            action: {
              label: 'New Thread',
              onClick: () => {
                // Create new thread within the same room (same logic as handleNewChat)
                const newThreadId = crypto.randomUUID();
                const currentParams = new URLSearchParams(window.location.search);
                currentParams.set('threadId', newThreadId);
                currentParams.delete('chatSession');
                const newUrl = `/chat/room/${shareCode}?${currentParams.toString()}`;
                router.replace(newUrl);
              }
            }
          });
          return true; // Handled
        }
      } catch (parseError) {
        console.warn('Could not parse rate limit error response:', parseError);
      }
    }
    
    return false; // Not handled
  };

  // Export handlers for use in parent components
  useEffect(() => {
    (window as any).roomRateLimitHandler = {
      handleAIError,
      handleRoomLimitReached,
      handleFetchError
    };
    
    return () => {
      delete (window as any).roomRateLimitHandler;
    };
  }, [shareCode, roomName]);

  return null; // This is a utility component with no UI
}

export default RoomRateLimitHandler;