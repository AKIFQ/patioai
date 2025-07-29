import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Message } from 'ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface RoomRealtimeHookProps {
  shareCode: string;
  displayName: string;
  chatSessionId?: string; // Add chat session filtering
  onNewMessage: (message: Message) => void;
  onTypingUpdate: (users: string[]) => void;
  onParticipantChange?: (participants: any[]) => void;
}

export function useRoomRealtime({
  shareCode,
  displayName,
  chatSessionId,
  onNewMessage,
  onTypingUpdate,
  onParticipantChange
}: RoomRealtimeHookProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const messageChannelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const participantChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
    if (participantChannelRef.current) {
      supabase.removeChannel(participantChannelRef.current);
      participantChannelRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!shareCode || !displayName) return;

    let roomUuid: string | null = null;

    // First get the room UUID from share code
    const initializeRealtime = async () => {
      try {
        const { data: room } = await supabase
          .from('rooms')
          .select('id')
          .eq('share_code', shareCode)
          .single();

        if (!room) {
          console.error('Room not found for share code:', shareCode);
          return;
        }

        roomUuid = room.id;

        cleanup(); // Clean up any existing connections

        // Subscribe to new messages for this specific room
        messageChannelRef.current = supabase
          .channel(`room_messages_${shareCode}`, {
            config: {
              broadcast: { self: false },
              presence: { key: displayName }
            }
          })
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'room_messages',
              filter: `room_id=eq.${roomUuid}`
            },
            (payload) => {
              const newMessage = payload.new as any;

              console.log('Real-time message received:', newMessage);
              console.log('Current chatSessionId:', chatSessionId);
              console.log('Message chatSessionId:', newMessage.room_chat_session_id);

              // Filter by chat session if specified
              if (chatSessionId && newMessage.room_chat_session_id !== chatSessionId) {
                console.log('Skipping message - different chat session');
                return;
              }

              // For legacy messages (no chatSessionId), only show if we're in legacy mode
              if (!chatSessionId && newMessage.room_chat_session_id) {
                console.log('Skipping message - has session ID but we\'re in legacy mode');
                return;
              }

              // Don't show own messages via realtime (they're already in the chat)
              if (newMessage.sender_name === displayName && !newMessage.is_ai_response) {
                console.log('Skipping own message');
                return;
              }

              // Convert to Message format
              const message: Message = {
                id: newMessage.id,
                role: newMessage.is_ai_response ? 'assistant' : 'user',
                content: newMessage.is_ai_response
                  ? newMessage.content
                  : `${newMessage.sender_name}: ${newMessage.content}`,
                createdAt: new Date(newMessage.created_at)
              };

              console.log('Calling onNewMessage with:', message);
              onNewMessage(message);
            }
          )
          .subscribe((status, err) => {
            console.log('Message channel status:', status);
            setConnectionStatus(status);
            setIsConnected(status === 'SUBSCRIBED');

            if (err) {
              console.error('Real-time subscription error:', err);
            }
          });

        // Subscribe to typing indicators using presence
        typingChannelRef.current = supabase
          .channel(`room_typing_${shareCode}`, {
            config: {
              presence: { key: displayName }
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const state = typingChannelRef.current?.presenceState() || {};
            const typingUsers = Object.values(state)
              .flat()
              .map((user: any) => user.displayName)
              .filter((name: string) => name && name !== displayName);

            console.log('Typing users updated:', typingUsers);
            onTypingUpdate(typingUsers);
          })
          .subscribe((status) => {
            console.log('Typing channel status:', status);
          });

        // Subscribe to participant changes (optional)
        if (onParticipantChange) {
          participantChannelRef.current = supabase
            .channel(`room_participants_${shareCode}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'room_participants',
                filter: `room_id=eq.${roomUuid}`
              },
              (payload) => {
                console.log('Participant change:', payload);
                onParticipantChange([]);
              }
            )
            .subscribe();
        }

      } catch (error) {
        console.error('Error initializing realtime:', error);
      }
    };

    initializeRealtime();

    return cleanup;
  }, [shareCode, displayName, onNewMessage, onTypingUpdate, onParticipantChange, cleanup, chatSessionId]);

  // Function to broadcast typing status
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!typingChannelRef.current || !displayName) return;

    if (isTyping) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Track typing
      typingChannelRef.current.track({
        displayName,
        isTyping: true,
        timestamp: Date.now()
      });

      // Auto-stop typing after 3 seconds
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, 3000);
    } else {
      stopTyping();
    }
  }, [displayName]);

  const stopTyping = useCallback(() => {
    if (typingChannelRef.current) {
      typingChannelRef.current.untrack();
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  return {
    isConnected,
    connectionStatus,
    broadcastTyping,
    stopTyping
  };
}