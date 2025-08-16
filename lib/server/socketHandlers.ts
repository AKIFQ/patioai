import { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthenticatedSocket } from '../../types/socket';
import { createAIResponseHandler, AIResponseHandler } from './aiResponseHandler';
import { SocketDatabaseService } from '../database/socketQueries';
import { PerformanceMonitor, measurePerformance } from '../monitoring/performanceMonitor';
import { SocketMonitor } from '../monitoring/socketMonitor';

export interface SocketHandlers {
  handleConnection: (socket: AuthenticatedSocket) => void;
  handleDisconnection: (socket: AuthenticatedSocket, reason: string) => void;
  handleRoomEvents: (socket: AuthenticatedSocket) => void;
  handleChatEvents: (socket: AuthenticatedSocket) => void;
  handleSidebarEvents: (socket: AuthenticatedSocket) => void;
}

export function createSocketHandlers(io: SocketIOServer): SocketHandlers {
  // Initialize AI response handler
  const aiHandler = createAIResponseHandler(io);
  const performanceMonitor = PerformanceMonitor.getInstance();

  const handleConnection = (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userId})`);
    performanceMonitor.updateConnectionMetrics('connect');
    // Track with SocketMonitor
    try {
      SocketMonitor.getInstance().onConnect(socket.userId, socket.id);
    } catch (e) {
      console.warn('SocketMonitor onConnect error:', e);
    }

    // Set up event handlers
    handleRoomEvents(socket);
    handleChatEvents(socket);
    handleSidebarEvents(socket);

    // Send connection confirmation
    socket.emit('connection-confirmed', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    // Set up health monitoring
    socket.on('health-ping', (data: { id: string; timestamp: number }, callback: (response: any) => void) => {
      // Respond immediately to health pings
      const responseTime = Date.now();
      callback({
        id: data.id,
        serverTimestamp: responseTime,
        clientTimestamp: data.timestamp,
        roundTripTime: responseTime - data.timestamp
      });
    });
  };

  const handleDisconnection = async (socket: AuthenticatedSocket, reason: string) => {
    console.log(`Socket disconnected: ${socket.id} (User: ${socket.userId}) - Reason: ${reason}`);
    performanceMonitor.updateConnectionMetrics('disconnect');
    // Track with SocketMonitor
    try {
      SocketMonitor.getInstance().onDisconnect(socket.userId, socket.id, reason);
    } catch (e) {
      console.warn('SocketMonitor onDisconnect error:', e);
    }

    try {
      // Snapshot room names without mutating the socket
      const userRooms = Array.from(socket.rooms || new Set<string>()).filter((room) => room.startsWith('room:'));

      // Notify rooms about user disconnection and stop typing
      for (const roomChannel of userRooms) {
        const shareCode = roomChannel.replace('room:', '');

        socket.to(roomChannel).emit('user-disconnected', {
          userId: socket.userId,
          shareCode,
          reason,
          timestamp: new Date().toISOString()
        });

        // CRITICAL: Clear typing indicators for disconnected user across all threads
        socket.to(roomChannel).emit('user-typing', {
          users: [],
          roomId: shareCode,
          timestamp: new Date().toISOString()
        });
        
        // Also clear cross-thread activity for this user
        socket.to(roomChannel).emit('cross-thread-activity', {
          roomId: shareCode,
          activities: [], // Empty activities to clear disconnected user
          timestamp: new Date().toISOString()
        });
      }

      // Leave personal channel if present (do not mutate rooms set)
      const userChannel = `user:${socket.userId}`;
      if ((socket as any).rooms?.has?.(userChannel)) {
        socket.leave(userChannel);
      }

      // Remove listeners safely
      try {
        const names = (socket as any).eventNames?.() || [];
        names.forEach((n: string) => socket.removeAllListeners(n));
        if (names.length > 0) {
          console.log(`🧹 Removed ${names.length} event listeners for socket ${socket.id}`);
        }
      } catch (error) {
        console.warn('Error removing event listeners:', error);
      }

      // CRITICAL: Clean up socket.currentThread memory leak
      if ((socket as any).currentThread) {
        const threadCount = Object.keys((socket as any).currentThread).length;
        console.log(`🧹 Clearing ${threadCount} thread references for socket ${socket.id}`);
        delete (socket as any).currentThread;
      }
      
      // Clear other socket-specific properties to prevent memory leaks
      if ((socket as any).isTyping !== undefined) {
        delete (socket as any).isTyping;
      }

      // Clear pending cleanup timeout
      if ((socket as any).cleanupTimeout) {
        clearTimeout((socket as any).cleanupTimeout);
        (socket as any).cleanupTimeout = null;
      }

      // Optional deferred cleanup
      if (reason === 'transport close' || reason === 'client namespace disconnect') {
        const cleanupTimeout = setTimeout(async () => {
          try {
            await cleanupAbandonedSessions(socket.userId);
          } catch (error) {
            console.error('Error in cleanup timeout:', error);
          }
        }, 15000);
        (socket as any).cleanupTimeout = cleanupTimeout;
      }

      console.log(`Cleanup completed for user ${socket.userId}`);
    } catch (error) {
      console.error(`Error during disconnect cleanup for user ${socket.userId}:`, error);
    }
  };

  // Helper function to clean up abandoned sessions
  async function cleanupAbandonedSessions(userId: string) {
    try {
      const { SocketDatabaseService } = await import('../database/socketQueries');
      const result = await SocketDatabaseService.cleanupAbandonedSessions(userId);
      
      if (!result.success) {
        console.error(`Error cleaning up abandoned sessions for user ${userId}:`, result.error);
        return;
      }
      
      console.log(`Cleaned up ${result.cleanedCount || 0} abandoned sessions for user ${userId}`);
    } catch (error) {
      console.error(`Error cleaning up abandoned sessions for user ${userId}:`, error);
    }
  }

  const handleRoomEvents = (socket: AuthenticatedSocket) => {
    socket.on('join-room', async (shareCode: string) => {
      await measurePerformance('room.join', async () => {
        console.log(`🔗 SOCKET: User ${socket.userId} attempting to join room ${shareCode}`);
        
        // Use optimized room validation
        const validation = await SocketDatabaseService.validateRoomAccess(shareCode);

        if (!validation.valid) {
          console.log(`❌ SOCKET: Room join failed for ${shareCode}: ${validation.error}`);
          socket.emit('room-error', { error: validation.error });
          return;
        }

        const room = validation.room!;

        // Check if user was removed from the room
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          const { data: removedUser } = await supabase
            .from('removed_room_participants')
            .select('*')
            .eq('room_id', room.id)
            .eq('removed_user_id', socket.userId)
            .single();

          if (removedUser) {
            console.log(`❌ SOCKET: User ${socket.userId} was removed from room ${shareCode}`);
            socket.emit('room-error', { 
              error: 'REMOVED_FROM_ROOM',
              roomName: room.name 
            });
            return;
          }
        } catch (error) {
          console.warn('Error checking user removal status:', error);
          // Continue with join if check fails (to avoid blocking legitimate users)
        }

        // Join room by share code
        socket.join(`room:${shareCode}`);
        console.log(`✅ SOCKET: User ${socket.userId} joined room ${shareCode} (${room.name})`);

        // Add participant to database
        await SocketDatabaseService.addRoomParticipant({
          roomId: room.id,
          userId: socket.userId,
          displayName: socket.userId, // Will be enhanced with actual display name
          sessionId: socket.id
        });

        // Confirm join to user first
        socket.emit('room-joined', {
          shareCode,
          roomName: room.name,
          participantCount: room.active_participants,
          maxParticipants: room.max_participants
        });

        // Notify other room members
        socket.to(`room:${shareCode}`).emit('user-joined-room', {
          userId: socket.userId,
          shareCode,
          roomName: room.name,
          timestamp: new Date().toISOString()
        });

        console.log(`📢 SOCKET: Notified other users about ${socket.userId} joining room ${shareCode}`);
      }).catch(error => {
        console.error('Error joining room:', error);
        socket.emit('room-error', { error: 'Failed to join room' });
        throw error;
      });
    });

    // Handle thread switching within a room
    socket.on('switch-thread', (data: { roomId: string; threadId: string; displayName: string }) => {
      try {
        const { roomId, threadId, displayName } = data;

        // Update user's current thread
        if (!socket.currentThread) socket.currentThread = {};
        const previousThread = socket.currentThread[roomId];
        socket.currentThread[roomId] = threadId;

        // Notify room about thread switch
        if (previousThread && previousThread !== threadId) {
          socket.to(`room:${roomId}`).emit('user-thread-switch', {
            displayName,
            fromThread: previousThread,
            toThread: threadId,
            roomId,
            timestamp: new Date().toISOString()
          });
        }

        // Update cross-thread activity
        socket.to(`room:${roomId}`).emit('cross-thread-activity', {
          roomId,
          activities: [{
            threadId,
            threadName: 'other thread',
            activeUsers: [displayName],
            typingUsers: []
          }],
          timestamp: new Date().toISOString()
        });

        console.log(`User ${displayName} switched to thread ${threadId} in room ${roomId}`);
      } catch (error) {
        console.error('Error handling thread switch:', error);
      }
    });

    socket.on('leave-room', async (shareCode: string) => {
      try {
        socket.leave(`room:${shareCode}`);
        console.log(`User ${socket.userId} left room ${shareCode}`);

        // Get room info for notification using optimized database service
        const { SocketDatabaseService } = await import('../database/socketQueries');
        const roomValidation = await SocketDatabaseService.validateRoomAccess(shareCode);
        const roomName = roomValidation.valid ? roomValidation.room?.name : 'Unknown Room';

        // Confirm leave to user first
        socket.emit('room-left', { shareCode });

        // Notify other room members
        socket.to(`room:${shareCode}`).emit('user-left-room', {
          userId: socket.userId,
          shareCode,
          roomName,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error leaving room:', error);
        socket.emit('room-error', { error: 'Failed to leave room' });
      }
    });

    socket.on('get-room-participants', async (shareCode: string) => {
      try {
        const { SocketDatabaseService } = await import('../database/socketQueries');
        const result = await SocketDatabaseService.getRoomParticipants(shareCode);

        if (!result.success) {
          socket.emit('room-error', { error: result.error });
          return;
        }

        socket.emit('room-participants', {
          shareCode,
          participants: result.participants || []
        });
      } catch (error) {
        console.error('Error getting room participants:', error);
        socket.emit('room-error', { error: 'Failed to get participants' });
      }
    });
  };

  const handleChatEvents = (socket: AuthenticatedSocket) => {
    // Removed legacy non-streaming AI path (trigger-ai-response). Streaming is handled via invoke-ai.

    // NEW: Streaming AI via Socket.IO with acknowledgment
    socket.on('invoke-ai', async (data: {
      shareCode: string;
      threadId: string;
      prompt: string;
      roomName: string;
      participants: string[];
      modelId?: string;
      chatHistory?: Array<{ role: 'user' | 'assistant', content: string }>;
      reasoningMode?: boolean;
    }, callback: (response: any) => void) => {
      try {
        const { shareCode, threadId, prompt, roomName, participants, modelId, chatHistory, reasoningMode } = data;
        console.log(`🔍 Socket invoke-ai received:`, { modelId, reasoningMode, shareCode });

        // Acknowledge receipt immediately
        callback({ success: true, message: 'AI invocation started' });

        // Cast to any to avoid potential type mismatches if typings lag behind implementation
        (aiHandler as any).streamAIResponse(shareCode, threadId, prompt, roomName, participants, modelId || 'gpt-4o', chatHistory || [], reasoningMode || false);
      } catch (error) {
        console.error('Error invoking AI stream:', error);

        // Send error acknowledgment
        callback({ success: false, error: 'Failed to invoke AI stream' });

        socket.emit('ai-error', { error: 'Failed to invoke AI stream' });
      }
    });

    // Handle AI configuration updates
    socket.on('update-ai-config', (config: any) => {
      try {
        // Only allow authorized users to update AI config
        // For now, we'll allow any authenticated user
        aiHandler.updateConfig(config);
        socket.emit('ai-config-updated', { success: true });
      } catch (error) {
        console.error('Error updating AI config:', error);
        socket.emit('ai-error', { error: 'Failed to update AI configuration' });
      }
    });

    // Handle AI enable/disable
    socket.on('toggle-ai', (enabled: boolean) => {
      try {
        aiHandler.setEnabled(enabled);
        socket.emit('ai-toggled', { enabled });
      } catch (error) {
        console.error('Error toggling AI:', error);
        socket.emit('ai-error', { error: 'Failed to toggle AI' });
      }
    });

    // Handle chat session creation
    socket.on('chat-session-created', async (data: { sessionId: string; title?: string }) => {
      try {
        const { sessionId, title } = data;

        // Emit to user's personal channel for sidebar updates
        socket.to(`user:${socket.userId}`).emit('chat-session-created', {
          new: {
            id: sessionId,
            user_id: socket.userId,
            chat_title: title || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          eventType: 'INSERT',
          table: 'chat_sessions',
          schema: 'public'
        });

        console.log(`Chat session created: ${sessionId} for user ${socket.userId}`);
      } catch (error) {
        console.error('Error handling chat session creation:', error);
        socket.emit('chat-error', { error: 'Failed to create chat session' });
      }
    });

    // Handle chat message sent
    socket.on('chat-message-sent', async (data: {
      sessionId: string;
      content: string;
      isUserMessage: boolean;
      attachments?: any[];
    }) => {
      try {
        const { sessionId, content, isUserMessage, attachments } = data;

        // Emit to user's personal channel for sidebar updates
        socket.to(`user:${socket.userId}`).emit('chat-message-created', {
          new: {
            id: `msg-${Date.now()}`,
            chat_session_id: sessionId,
            content,
            is_user_message: isUserMessage,
            attachments: attachments ? JSON.stringify(attachments) : null,
            created_at: new Date().toISOString()
          },
          eventType: 'INSERT',
          table: 'chat_messages',
          schema: 'public'
        });

        console.log(`Chat message sent in session ${sessionId} by user ${socket.userId}`);
      } catch (error) {
        console.error('Error handling chat message:', error);
        socket.emit('chat-error', { error: 'Failed to send chat message' });
      }
    });

    // Handle document upload
    socket.on('document-uploaded', async (data: {
      documentId: string;
      title: string;
      totalPages: number;
      filterTags: string;
    }) => {
      try {
        const { documentId, title, totalPages, filterTags } = data;

        // Emit to user's personal channel for sidebar updates
        socket.to(`user:${socket.userId}`).emit('document-uploaded', {
          new: {
            id: documentId,
            user_id: socket.userId,
            title,
            total_pages: totalPages,
            filter_tags: filterTags,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          eventType: 'INSERT',
          table: 'user_documents',
          schema: 'public'
        });

        console.log(`Document uploaded: ${title} for user ${socket.userId}`);
      } catch (error) {
        console.error('Error handling document upload:', error);
        socket.emit('document-error', { error: 'Failed to process document upload' });
      }
    });

    // Handle request for missed messages when user returns from background
    socket.on('request-missed-messages', (data: { timestamp: number; lastActiveTime: number }) => {
      try {
        console.log(`📬 User ${socket.userId} requesting missed messages since ${new Date(data.lastActiveTime).toISOString()}`);

        // For now, just acknowledge - in a full implementation, you'd query recent messages
        // and re-emit any that the client might have missed
        socket.emit('missed-messages-response', {
          success: true,
          timestamp: Date.now(),
          message: 'Connection verified, no missed messages'
        });
      } catch (error) {
        console.error('Error handling missed messages request:', error);
      }
    });

    // Thread-aware typing system
    socket.on('typing-start', (data: { roomId?: string; displayName?: string; threadId?: string }) => {
      try {
        const { roomId, displayName, threadId } = data;

        if (roomId && displayName && threadId) {
          // Store user's current thread and typing status
          if (!socket.currentThread) socket.currentThread = {};
          socket.currentThread[roomId] = threadId;
          socket.isTyping = true;

          console.log(`👤 ${displayName} started typing in thread ${threadId} of room ${roomId}`);

          // Emit ONLY to users in the SAME thread
          socket.to(`room:${roomId}`).emit('user-typing', {
            users: [displayName],
            roomId,
            threadId, // Include threadId so clients can filter
            timestamp: new Date().toISOString()
          });

          // Emit cross-thread activity to ALL room participants (they'll filter by thread)
          socket.to(`room:${roomId}`).emit('cross-thread-activity', {
            roomId,
            activities: [{
              threadId,
              threadName: 'other thread',
              activeUsers: [],
              typingUsers: [displayName]
            }],
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    socket.on('typing-stop', (data: { roomId?: string; displayName?: string; threadId?: string }) => {
      try {
        const { roomId, displayName, threadId } = data;

        if (roomId && threadId) {
          socket.isTyping = false;

          console.log(`👤 ${displayName} stopped typing in thread ${threadId} of room ${roomId}`);

          // Emit ONLY to users in the SAME thread
          socket.to(`room:${roomId}`).emit('user-typing', {
            users: [], // Empty array when user stops typing
            roomId,
            threadId,
            timestamp: new Date().toISOString()
          });

          // Update cross-thread activity (user still active, just not typing)
          socket.to(`room:${roomId}`).emit('cross-thread-activity', {
            roomId,
            activities: [{
              threadId,
              threadName: 'other thread',
              activeUsers: [displayName],
              typingUsers: []
            }],
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling typing stop:', error);
      }
    });
  };

  const handleSidebarEvents = (socket: AuthenticatedSocket) => {
    socket.on('request-sidebar-refresh', async () => {
      try {
        // Emit to user's personal channel
        socket.emit('sidebar-refresh-requested', {
          timestamp: new Date().toISOString(),
          userId: socket.userId
        });
        console.log(`Sidebar refresh requested by user ${socket.userId}`);
      } catch (error) {
        console.error('Error handling sidebar refresh request:', error);
        socket.emit('sidebar-error', { error: 'Failed to refresh sidebar' });
      }
    });

    socket.on('notify-sidebar-change', async (data: {
      changeType: 'chat_created' | 'room_joined' | 'document_uploaded' | 'message_sent';
      entityId: string;
      metadata?: any;
    }) => {
      try {
        const { changeType, entityId, metadata } = data;

        // Broadcast to user's personal channel with timestamp
        socket.to(`user:${socket.userId}`).emit('sidebar-change-notification', {
          changeType,
          entityId,
          metadata,
          timestamp: new Date().toISOString(),
          userId: socket.userId
        });

        console.log(`Sidebar change notification: ${changeType} for user ${socket.userId}`);
      } catch (error) {
        console.error('Error handling sidebar change notification:', error);
        socket.emit('sidebar-error', { error: 'Failed to notify sidebar change' });
      }
    });

    socket.on('get-sidebar-data', async () => {
      await measurePerformance('sidebar.getData', async () => {
        // Use optimized sidebar data retrieval
        const result = await SocketDatabaseService.getSidebarData(socket.userId);

        if (!result.success) {
          socket.emit('sidebar-error', { error: result.error });
          return;
        }

        socket.emit('sidebar-data', {
          ...result.data,
          timestamp: new Date().toISOString()
        });

        console.log(`Optimized sidebar data sent to user ${socket.userId}`);
      }).catch(error => {
        console.error('Error getting sidebar data:', error);
        socket.emit('sidebar-error', { error: 'Failed to get sidebar data' });
        throw error;
      });
    });

    socket.on('join-user-channel', () => {
      try {
        // Join user's personal channel for sidebar updates
        socket.join(`user:${socket.userId}`);
        console.log(`User ${socket.userId} joined personal channel`);

        // Confirm channel join
        socket.emit('user-channel-joined', {
          userId: socket.userId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error joining user channel:', error);
        socket.emit('sidebar-error', { error: 'Failed to join user channel' });
      }
    });

    socket.on('leave-user-channel', () => {
      try {
        // Leave user's personal channel
        socket.leave(`user:${socket.userId}`);
        console.log(`User ${socket.userId} left personal channel`);

        // Confirm channel leave
        socket.emit('user-channel-left', {
          userId: socket.userId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error leaving user channel:', error);
        socket.emit('sidebar-error', { error: 'Failed to leave user channel' });
      }
    });
  };

  return {
    handleConnection,
    handleDisconnection,
    handleRoomEvents,
    handleChatEvents,
    handleSidebarEvents
  };
}