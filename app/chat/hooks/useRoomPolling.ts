import { useEffect, useState, useCallback } from 'react';
import type { Message } from 'ai';

interface RoomPollingHookProps {
  roomId: string;
  shareCode: string;
  onNewMessages: (messages: Message[]) => void;
  enabled: boolean;
}

export function useRoomPolling({ roomId, shareCode, onNewMessages, enabled }: RoomPollingHookProps) {
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const pollForNewMessages = useCallback(async () => {
    if (!enabled || isPolling) return;
    
    setIsPolling(true);
    
    try {
      const url = new URL(`/api/rooms/${shareCode}/messages`, window.location.origin);
      if (lastMessageId) {
        url.searchParams.set('after', lastMessageId);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) return;
      
      const data = await response.json();
      
      if (data.messages && data.messages.length > 0) {
        // Convert to Message format
        const newMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.is_ai_response ? 'assistant' : 'user',
          content: msg.is_ai_response 
            ? msg.content 
            : `${msg.sender_name}: ${msg.content}`,
          createdAt: new Date(msg.created_at)
        }));
        
        // Update last message ID
        const latestMessage = newMessages[newMessages.length - 1];
        setLastMessageId(latestMessage.id);
        
        onNewMessages(newMessages);
      }
    } catch (error) {
      console.error('Error polling for messages:', error);
    } finally {
      setIsPolling(false);
    }
  }, [shareCode, lastMessageId, enabled, isPolling, onNewMessages]);

  useEffect(() => {
    if (!enabled) return;

    // Poll every 2 seconds
    const interval = setInterval(pollForNewMessages, 2000);
    
    // Initial poll
    pollForNewMessages();

    return () => clearInterval(interval);
  }, [pollForNewMessages, enabled]);

  return {
    isPolling,
    pollNow: pollForNewMessages
  };
}