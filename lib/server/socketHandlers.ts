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
    socket.on('join-room', (roomId: string) => {
      try {
        socket.join(`room:${roomId}`);
        console.log(`User ${socket.userId} joined room ${roomId}`);
        
        // Notify other room members
        socket.to(`room:${roomId}`).emit('user-joined-room', {
          userId: socket.userId,
          roomId,
          timestamp: new Date().toISOString()
        });
        
        // Confirm join to user
        socket.emit('room-joined', { roomId });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('room-error', { error: 'Failed to join room' });
      }
    });

    socket.on('leave-room', (roomId: string) => {
      try {
        socket.leave(`room:${roomId}`);
        console.log(`User ${socket.userId} left room ${roomId}`);
        
        // Notify other room members
        socket.to(`room:${roomId}`).emit('user-left-room', {
          userId: socket.userId,
          roomId,
          timestamp: new Date().toISOString()
        });
        
        // Confirm leave to user
        socket.emit('room-left', { roomId });
      } catch (error) {
        console.error('Error leaving room:', error);
        socket.emit('room-error', { error: 'Failed to leave room' });
      }
    });
  };

  const handleChatEvents = (socket: AuthenticatedSocket) => {
    socket.on('send-message', (data: { roomId?: string; message: string; threadId?: string }) => {
      try {
        const { roomId, message, threadId } = data;
        
        if (roomId) {
          // Room message
          socket.to(`room:${roomId}`).emit('new-room-message', {
            message,
            userId: socket.userId,
            roomId,
            threadId,
            timestamp: new Date().toISOString()
          });
        } else {
          // Regular chat message - will be handled in later slices
          console.log('Regular chat message received');
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    socket.on('typing-start', (data: { roomId?: string }) => {
      try {
        const { roomId } = data;
        
        if (roomId) {
          socket.to(`room:${roomId}`).emit('user-typing', {
            userId: socket.userId,
            roomId,
            isTyping: true
          });
        }
      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    socket.on('typing-stop', (data: { roomId?: string }) => {
      try {
        const { roomId } = data;
        
        if (roomId) {
          socket.to(`room:${roomId}`).emit('user-typing', {
            userId: socket.userId,
            roomId,
            isTyping: false
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