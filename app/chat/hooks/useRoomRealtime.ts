import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/client/client';
import type { Message } from 'ai';

const supabase = createClient();

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
          .channel(`room_messages_${roomUuid}`, {
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

              console.log('🔔 RT MSG received:', {
                sender: newMessage.sender_name,
                isAI: newMessage.is_ai_response,
                content: newMessage.content?.substring(0, 50) + '...',
                roomId: newMessage.room_id,
                currentUser: displayName
              });

              // Skip own user messages to avoid duplicates with optimistic updates
              if (newMessage.sender_name === displayName && !newMessage.is_ai_response) {
                console.log('⏭️ SKIPPING: Own user message to avoid duplicate');
                return;
              }
              
              console.log('✅ ACCEPTING RT MSG from:', newMessage.sender_name);

              // Convert to Message format
              const message: Message = {
                id: newMessage.id,
                role: newMessage.is_ai_response ? 'assistant' : 'user',
                content: newMessage.is_ai_response
                  ? newMessage.content
                  : `${newMessage.sender_name}: ${newMessage.content}`,
                createdAt: new Date(newMessage.created_at)
              };

              onNewMessage(message);
            }
          )
          .subscribe((status, err) => {
            console.log('📡 Message channel status:', status, 'for room:', roomUuid);
            setConnectionStatus(status);
            setIsConnected(status === 'SUBSCRIBED');

            if (err) {
              console.error('❌ Real-time subscription error:', err);
            }
          });

        // Subscribe to typing indicators using presence
        typingChannelRef.current = supabase
          .channel(`room_typing_${roomUuid}`, {
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

            console.log('👥 Typing users updated:', typingUsers);
            onTypingUpdate(typingUsers);
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
            console.log('👋 User joined typing:', key, newPresences);
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
            console.log('👋 User left typing:', key, leftPresences);
          })
          .subscribe((status) => {
            console.log('💬 Typing channel status:', status, 'for room:', roomUuid);
          });

        // Subscribe to participant changes (optional)
        if (onParticipantChange) {
          participantChannelRef.current = supabase
            .channel(`room_participants_${roomUuid}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'room_participants',
                filter: `room_id=eq.${roomUuid}`
              },
              (payload) => {
                console.log('👥 Participant change:', payload);
                onParticipantChange([]);
              }
            )
            .subscribe((status) => {
              console.log('👥 Participants channel status:', status, 'for room:', roomUuid);
            });
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
    console.log('broadcastTyping called:', isTyping, 'displayName:', displayName);
    if (!typingChannelRef.current || !displayName) {
      console.log('No typing channel or displayName, skipping broadcast');
      return;
    }

    if (isTyping) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Track typing
      console.log('Broadcasting typing start for:', displayName);
      typingChannelRef.current.track({
        displayName,
        isTyping: true,
        timestamp: Date.now()
      });

      // Auto-stop typing after 3 seconds
      typingTimeoutRef.current = setTimeout(() => {
        console.log('Auto-stopping typing for:', displayName);
        stopTyping();
      }, 3000);
    } else {
      console.log('Broadcasting typing stop for:', displayName);
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