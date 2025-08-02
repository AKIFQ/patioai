import { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthenticatedSocket } from '../../types/socket';

export interface SocketHandlers {
  handleConnection: (socket: AuthenticatedSocket) => void;
  handleDisconnection: (socket: AuthenticatedSocket, reason: string) => void;
  handleRoomEvents: (socket: AuthenticatedSocket) => void;
  handleChatEvents: (socket: AuthenticatedSocket) => void;
  handleSidebarEvents: (socket: AuthenticatedSocket) => void;
}

export function createSocketHandlers(io: SocketIOServer): SocketHandlers {
  const handleConnection = (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userId})`);
    
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

  const handleDisconnection = (socket: AuthenticatedSocket, reason: string) => {
    console.log(`Socket disconnected: ${socket.id} (User: ${socket.userId}) - Reason: ${reason}`);
    
    // TODO: Cleanup user from rooms and sessions
    // This will be implemented in later slices
  };

  const handleRoomEvents = (socket: AuthenticatedSocket) => {
    socket.on('join-room', (shareCode: string) => {
      try {
        // Join room by share code (this matches the hook expectation)
        socket.join(`room:${shareCode}`);
        console.log(`User ${socket.userId} joined room ${shareCode}`);
        
        // Confirm join to user first
        socket.emit('room-joined', { shareCode });
        
        // Notify other room members
        socket.to(`room:${shareCode}`).emit('user-joined-room', {
          userId: socket.userId,
          shareCode,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('room-error', { error: 'Failed to join room' });
      }
    });

    socket.on('leave-room', (shareCode: string) => {
      try {
        socket.leave(`room:${shareCode}`);
        console.log(`User ${socket.userId} left room ${shareCode}`);
        
        // Confirm leave to user first
        socket.emit('room-left', { shareCode });
        
        // Notify other room members
        socket.to(`room:${shareCode}`).emit('user-left-room', {
          userId: socket.userId,
          shareCode,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error leaving room:', error);
        socket.emit('room-error', { error: 'Failed to leave room' });
      }
    });
  };

  const handleChatEvents = (socket: AuthenticatedSocket) => {
    // These handlers will be called by API routes when database changes occur
    // For now, we'll set up the basic structure
    
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
    socket.on('request-sidebar-refresh', () => {
      try {
        // Emit to user's personal channel
        socket.emit('sidebar-refresh-requested', {
          timestamp: new Date().toISOString()
        });
        console.log(`Sidebar refresh requested by user ${socket.userId}`);
      } catch (error) {
        console.error('Error handling sidebar refresh request:', error);
        socket.emit('sidebar-error', { error: 'Failed to refresh sidebar' });
      }
    });

    socket.on('join-user-channel', () => {
      try {
        // Join user's personal channel for sidebar updates
        socket.join(`user:${socket.userId}`);
        console.log(`User ${socket.userId} joined personal channel`);
      } catch (error) {
        console.error('Error joining user channel:', error);
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