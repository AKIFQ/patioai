import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/client/client';
import type { Message } from 'ai';

// Create client with proper error handling
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
    try {
      if (messageChannelRef.current) {
        console.log('🧹 Cleaning up message channel');
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }
      if (typingChannelRef.current) {
        console.log('🧹 Cleaning up typing channel');
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
      if (participantChannelRef.current) {
        console.log('🧹 Cleaning up participant channel');
        supabase.removeChannel(participantChannelRef.current);
        participantChannelRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }, []);

  useEffect(() => {
    if (!shareCode || !displayName) return;

    let roomUuid: string | null = null;
    let mounted = true; // Track if component is still mounted
    let reconnectInterval: NodeJS.Timeout | null = null;
    let hasMessages = false; // Track if any messages were sent in this thread

    // Handle visibility changes to maintain connection in background
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('🌙 Tab went to background - maintaining connection');
        // Don't disconnect, just log the state change
      } else {
        console.log('☀️ Tab became visible - ensuring connection');
        // Force reconnection check when tab becomes visible
        if (messageChannelRef.current && connectionStatus !== 'SUBSCRIBED') {
          console.log('🔄 Forcing reconnection on tab focus');
          initializeRealtime();
        }
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic connection health check - DISABLED to prevent re-render loops
    const startHealthCheck = () => {
      // Temporarily disabled to fix re-rendering loop
      // reconnectInterval = setInterval(() => {
      //   if (mounted && connectionStatus !== 'SUBSCRIBED') {
      //     console.log('🏥 Health check: Connection not healthy, attempting reconnect');
      //     initializeRealtime();
      //   }
      // }, 30000); // Check every 30 seconds
    };

    // First get the room UUID from share code
    const initializeRealtime = async () => {
      try {
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select('id')
          .eq('share_code', shareCode)
          .single();

        if (roomError || !room) {
          console.error('Room not found for share code:', shareCode, roomError);
          return;
        }

        if (!mounted) return; // Don't continue if component unmounted

        roomUuid = room.id;

        cleanup(); // Clean up any existing connections

        // Subscribe to new messages for this specific room
        // Use a unique channel name to avoid conflicts
        const channelName = `room_messages_${roomUuid}_${Date.now()}`;
        console.log('🔌 Creating message channel:', channelName);

        messageChannelRef.current = supabase
          .channel(channelName, {
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
              console.log('🚨 RAW POSTGRES EVENT RECEIVED:', payload);
              console.log('🚨 EVENT TYPE:', payload.eventType);
              console.log('🚨 TABLE:', payload.table);
              console.log('🚨 SCHEMA:', payload.schema);
              const newMessage = payload.new as any;

              console.log('🔔 RT MSG received:', {
                sender: newMessage.sender_name,
                isAI: newMessage.is_ai_response,
                content: newMessage.content?.substring(0, 50) + '...',
                roomId: newMessage.room_id,
                threadId: newMessage.thread_id,
                currentUser: displayName,
                currentThread: chatSessionId
              });

              // Filter by thread ID if specified
              if (chatSessionId && newMessage.thread_id !== chatSessionId) {
                console.log('⏭️ SKIPPING: Message from different thread');
                return;
              }

              // Debug: Log all message details
              console.log('🔍 DETAILED MESSAGE DEBUG:', {
                messageId: newMessage.id,
                sender: newMessage.sender_name,
                currentUser: displayName,
                isAI: newMessage.is_ai_response,
                content: newMessage.content,
                threadId: newMessage.thread_id,
                currentThread: chatSessionId
              });

              // Track that this thread has messages
              hasMessages = true;

              // NOTE: We no longer skip own user messages because room chats 
              // don't use optimistic updates - real-time is the single source of truth
              // All users (including sender) should see messages via real-time only

              console.log('✅ PROCESSING RT MSG from:', newMessage.sender_name, 'for user:', displayName);

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

            if (status === 'SUBSCRIBED') {
              console.log('✅ Message subscription ready - should receive INSERT events');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Channel error - will retry in 10 seconds');
              setIsConnected(false);
              // Retry after 10 seconds (increased delay)
              setTimeout(() => {
                if (mounted) {
                  console.log('🔄 Retrying connection after channel error');
                  initializeRealtime();
                }
              }, 10000);
            } else if (status === 'TIMED_OUT') {
              console.error('⏰ Subscription timed out - will retry in 8 seconds');
              setIsConnected(false);
              // Retry after 8 seconds (increased delay)
              setTimeout(() => {
                if (mounted) {
                  console.log('🔄 Retrying connection after timeout');
                  initializeRealtime();
                }
              }, 8000);
            } else if (status === 'CLOSED') {
              console.log('🔒 Channel closed - will retry in 5 seconds');
              setIsConnected(false);
              // Retry after 5 seconds (increased delay)
              setTimeout(() => {
                if (mounted) {
                  console.log('🔄 Retrying connection after close');
                  initializeRealtime();
                }
              }, 5000);
            }

            if (err) {
              console.error('❌ Real-time subscription error:', err);
              // Don't throw the error, just log it
            }
          });

        // Subscribe to typing indicators using presence
        // Use a simpler channel name for typing
        const typingChannelName = `typing_${roomUuid}`;
        console.log('💬 Creating typing channel:', typingChannelName);

        typingChannelRef.current = supabase
          .channel(typingChannelName, {
            config: {
              presence: { key: displayName },
              broadcast: { self: false }
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const state = typingChannelRef.current?.presenceState() || {};
            console.log('💬 Raw presence state:', state);
            
            const typingUsers = Object.values(state)
              .flat()
              .map((user: any) => user.displayName)
              .filter((name: string) => name && name !== displayName);

            console.log('👥 Typing users updated:', typingUsers);
            onTypingUpdate(typingUsers);
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
            console.log('👋 User joined typing:', key, newPresences);
            const state = typingChannelRef.current?.presenceState() || {};
            const typingUsers = Object.values(state)
              .flat()
              .map((user: any) => user.displayName)
              .filter((name: string) => name && name !== displayName);
            onTypingUpdate(typingUsers);
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
            console.log('👋 User left typing:', key, leftPresences);
            const state = typingChannelRef.current?.presenceState() || {};
            const typingUsers = Object.values(state)
              .flat()
              .map((user: any) => user.displayName)
              .filter((name: string) => name && name !== displayName);
            onTypingUpdate(typingUsers);
          })
          .subscribe((status, err) => {
            console.log('💬 Typing channel status:', status, 'for room:', roomUuid);
            if (status === 'SUBSCRIBED') {
              console.log('✅ Typing channel ready');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Typing channel error - will retry automatically');
            } else if (status === 'TIMED_OUT') {
              console.error('⏰ Typing channel timed out - will retry automatically');
            } else if (status === 'CLOSED') {
              console.log('🔒 Typing channel closed');
            }

            if (err) {
              console.error('❌ Typing channel error:', err);
              // Don't throw the error, just log it
            }
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

    // Start initialization and health check
    initializeRealtime().then(() => {
      if (mounted) {
        startHealthCheck();
      }
    });

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
      }
      
      // Clean up empty thread if no messages were sent
      if (!hasMessages && chatSessionId) {
        console.log('🧹 Cleaning up empty thread on unmount:', chatSessionId);
        // Note: In a real implementation, you might want to call an API endpoint
        // to clean up the empty thread from the database
        fetch('/api/cleanup/empty-threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId: chatSessionId })
        }).catch(error => {
          console.warn('Failed to cleanup empty thread:', error);
        });
      }
      
      cleanup();
    };
  }, [shareCode, displayName, chatSessionId]);

  // Function to broadcast typing status
  const broadcastTyping = useCallback((isTyping: boolean) => {
    console.log('🔥 broadcastTyping called:', isTyping, 'displayName:', displayName);
    console.log('🔥 typingChannelRef.current:', !!typingChannelRef.current);
    
    if (!typingChannelRef.current || !displayName) {
      console.log('❌ No typing channel or displayName, skipping broadcast');
      return;
    }

    try {
      if (isTyping) {
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Track typing with presence
        console.log('🚀 Broadcasting typing START for:', displayName);
        const trackResult = typingChannelRef.current.track({
          displayName,
          isTyping: true,
          timestamp: Date.now()
        });
        console.log('🚀 Track result:', trackResult);

        // Auto-stop typing after 3 seconds
        typingTimeoutRef.current = setTimeout(() => {
          console.log('⏰ Auto-stopping typing for:', displayName);
          stopTyping();
        }, 3000);
      } else {
        console.log('🛑 Broadcasting typing STOP for:', displayName);
        stopTyping();
      }
    } catch (error) {
      console.error('❌ Error broadcasting typing status:', error);
    }
  }, [displayName]);

  const stopTyping = useCallback(() => {
    console.log('🛑 stopTyping called');
    try {
      if (typingChannelRef.current) {
        console.log('🛑 Untracking from typing channel');
        const untrackResult = typingChannelRef.current.untrack();
        console.log('🛑 Untrack result:', untrackResult);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    } catch (error) {
      console.error('❌ Error stopping typing:', error);
    }
  }, []);

  return {
    isConnected,
    connectionStatus,
    broadcastTyping,
    stopTyping
  };
}