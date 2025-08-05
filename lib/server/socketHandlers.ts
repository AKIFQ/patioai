import { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthenticatedSocket } from '../../types/socket';
import { createAIResponseHandler, AIResponseHandler } from './aiResponseHandler';
import { SocketDatabaseService } from '../database/socketQueries';
import { PerformanceMonitor, measurePerformance } from '../monitoring/performanceMonitor';

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
    
    // Set up event handlers
    handleRoomEvents(socket);
    handleChatEvents(socket);
    handleSidebarEvents(socket);
    
    // Send connection confirmation
    socket.emit('connection-confirmed', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  };

  const handleDisconnection = async (socket: AuthenticatedSocket, reason: string) => {
    console.log(`Socket disconnected: ${socket.id} (User: ${socket.userId}) - Reason: ${reason}`);
    performanceMonitor.updateConnectionMetrics('disconnect');
    
    try {
      // Get all rooms the user was in
      const userRooms = Array.from(socket.rooms).filter(room => room.startsWith('room:'));
      
      // Notify rooms about user disconnection
      for (const roomChannel of userRooms) {
        const shareCode = roomChannel.replace('room:', '');
        
        // Notify other participants about disconnection
        socket.to(roomChannel).emit('user-disconnected', {
          userId: socket.userId,
          shareCode,
          reason,
          timestamp: new Date().toISOString()
        });
        
        console.log(`Notified room ${shareCode} about user ${socket.userId} disconnection`);
      }

      // Clean up typing indicators
      for (const roomChannel of userRooms) {
        const shareCode = roomChannel.replace('room:', '');
        
        // Stop any typing indicators for this user
        socket.to(roomChannel).emit('user-typing', {
          users: [], // Remove this user from typing
          roomId: shareCode,
          timestamp: new Date().toISOString()
        });
      }

      // Clean up user channel
      const userChannel = `user:${socket.userId}`;
      if (socket.rooms.has(userChannel)) {
        socket.leave(userChannel);
        console.log(`User ${socket.userId} left personal channel on disconnect`);
      }

      // Mark disconnection time for safe cleanup
      (socket as any).disconnectedAt = Date.now();

      // Remove all event listeners to prevent memory leaks
      try {
        const eventNames = (socket as any).eventNames?.() || [];
        eventNames.forEach((eventName: string) => {
          socket.removeAllListeners(eventName);
        });
        if (eventNames.length > 0) {
          console.log(`🧹 Removed ${eventNames.length} event listeners for socket ${socket.id}`);
        }
      } catch (error) {
        console.warn('Error removing event listeners:', error);
      }

      // Clear any existing cleanup timeout
      if ((socket as any).cleanupTimeout) {
        clearTimeout((socket as any).cleanupTimeout);
        (socket as any).cleanupTimeout = null;
      }

      // Optional: Clean up abandoned sessions after a delay
      if (reason === 'transport close' || reason === 'client namespace disconnect') {
        const cleanupTimeout = setTimeout(async () => {
          try {
            await cleanupAbandonedSessions(socket.userId);
            
            // Log memory usage for monitoring
            const memUsage = process.memoryUsage().heapUsed;
            if (memUsage > 800 * 1024 * 1024) { // > 800MB
              console.warn(`⚠️ High memory usage: ${Math.round(memUsage / 1024 / 1024)}MB`);
            }
          } catch (error) {
            console.error('Error in cleanup timeout:', error);
          }
        }, 30000); // 30 second delay to allow for reconnection
        
        // Store timeout reference for potential cleanup
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
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Check if user has reconnected (by checking if they have active sockets)
      const userSockets = Array.from(io.sockets.sockets.values())
        .filter(s => (s as any).userId === userId);

      if (userSockets.length === 0) {
        console.log(`Cleaning up abandoned sessions for user ${userId}`);
        
        // Clean up empty room chat sessions
        const { data: emptySessions } = await supabase
          .from('room_chat_sessions')
          .select('id, room_id')
          .eq('session_id', userId);

        if (emptySessions && emptySessions.length > 0) {
          for (const session of emptySessions) {
            // Check if session has any messages
            const { data: messages } = await supabase
              .from('room_messages')
              .select('id')
              .eq('room_chat_session_id', session.id)
              .limit(1);

            if (!messages || messages.length === 0) {
              // Delete empty session
              await supabase
                .from('room_chat_sessions')
                .delete()
                .eq('id', session.id);
              
              console.log(`Deleted empty room chat session ${session.id}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error cleaning up abandoned sessions for user ${userId}:`, error);
    }
  }

  const handleRoomEvents = (socket: AuthenticatedSocket) => {
    socket.on('join-room', async (shareCode: string) => {
      await measurePerformance('room.join', async () => {
        // Use optimized room validation
        const validation = await SocketDatabaseService.validateRoomAccess(shareCode);
        
        if (!validation.valid) {
          socket.emit('room-error', { error: validation.error });
          return;
        }

        const room = validation.room!;

        // Join room by share code
        socket.join(`room:${shareCode}`);
        console.log(`User ${socket.userId} joined room ${shareCode} (${room.name})`);
        
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
      }).catch(error => {
        console.error('Error joining room:', error);
        socket.emit('room-error', { error: 'Failed to join room' });
        throw error;
      });
    });

    socket.on('leave-room', async (shareCode: string) => {
      try {
        socket.leave(`room:${shareCode}`);
        console.log(`User ${socket.userId} left room ${shareCode}`);
        
        // Get room info for notification
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('share_code', shareCode)
          .single();
        
        // Confirm leave to user first
        socket.emit('room-left', { shareCode });
        
        // Notify other room members
        socket.to(`room:${shareCode}`).emit('user-left-room', {
          userId: socket.userId,
          shareCode,
          roomName: room?.name || 'Unknown Room',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error leaving room:', error);
        socket.emit('room-error', { error: 'Failed to leave room' });
      }
    });

    socket.on('get-room-participants', async (shareCode: string) => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Get room and participants
        const { data: room } = await supabase
          .from('rooms')
          .select('id, name')
          .eq('share_code', shareCode)
          .single();

        if (!room) {
          socket.emit('room-error', { error: 'Room not found' });
          return;
        }

        const { data: participants } = await supabase
          .from('room_participants')
          .select('display_name, joined_at, user_id')
          .eq('room_id', room.id)
          .order('joined_at', { ascending: true });

        socket.emit('room-participants', {
          shareCode,
          participants: participants || []
        });
      } catch (error) {
        console.error('Error getting room participants:', error);
        socket.emit('room-error', { error: 'Failed to get participants' });
      }
    });
  };

  const handleChatEvents = (socket: AuthenticatedSocket) => {
    // Handle AI response triggers
    socket.on('trigger-ai-response', async (data: { 
      shareCode: string; 
      threadId: string; 
      message: string; 
      senderName: string;
      roomName: string;
      participants: string[];
    }) => {
      try {
        const { shareCode, threadId, message, senderName, roomName, participants } = data;
        
        await aiHandler.handleAIResponse(
          shareCode,
          threadId,
          message,
          senderName,
          roomName,
          participants
        );
      } catch (error) {
        console.error('Error triggering AI response:', error);
        socket.emit('ai-error', { error: 'Failed to generate AI response' });
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
    
    socket.on('send-message', (data: { roomId?: string; message: string; threadId?: string }) => {
      try {
        const { roomId, message, threadId } = data;
        
        if (roomId) {
          // Room message - emit to all room participants
          socket.to(`room:${roomId}`).emit('room-message-created', {
            new: {
              id: `temp-${Date.now()}`,
              room_id: roomId,
              thread_id: threadId,
              sender_name: socket.userId, // Will be replaced with actual display name
              content: message,
              is_ai_response: false,
              created_at: new Date().toISOString()
            },
            eventType: 'INSERT',
            table: 'room_messages',
            schema: 'public'
          });
        } else {
          // Regular chat message - emit to user's personal channel
          socket.to(`user:${socket.userId}`).emit('chat-message-created', {
            new: {
              id: `temp-${Date.now()}`,
              chat_session_id: threadId,
              content: message,
              is_user_message: true,
              created_at: new Date().toISOString()
            },
            eventType: 'INSERT',
            table: 'chat_messages',
            schema: 'public'
          });
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    socket.on('typing-start', (data: { roomId?: string; displayName?: string }) => {
      try {
        const { roomId, displayName } = data;
        
        if (roomId && displayName) {
          // Emit to all room members with current typing users (roomId is actually shareCode)
          socket.to(`room:${roomId}`).emit('user-typing', {
            users: [displayName], // Simple array of typing users
            roomId,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    socket.on('typing-stop', (data: { roomId?: string; displayName?: string }) => {
      try {
        const { roomId, displayName } = data;
        
        if (roomId) {
          // Emit empty typing users array when user stops typing (roomId is actually shareCode)
          socket.to(`room:${roomId}`).emit('user-typing', {
            users: [], // Empty array when user stops typing
            roomId,
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