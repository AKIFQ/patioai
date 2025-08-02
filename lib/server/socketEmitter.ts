import { Server as SocketIOServer } from 'socket.io';

// Global Socket.IO server instance
let io: SocketIOServer | null = null;

export function setSocketIOInstance(socketServer: SocketIOServer) {
  io = socketServer;
  console.log('Socket.IO instance set for event emission');
}

export function getSocketIOInstance(): SocketIOServer | null {
  return io;
}

// Helper functions to emit events from API routes
export function emitRoomMessageCreated(roomIdOrShareCode: string, messageData: any) {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit room message event');
    return;
  }

  // Emit to all users in the room (using share code for room identification)
  io.to(`room:${roomIdOrShareCode}`).emit('room-message-created', {
    new: messageData,
    eventType: 'INSERT',
    table: 'room_messages',
    schema: 'public'
  });

  console.log(`Emitted room message created event for room ${roomIdOrShareCode}`);
}

export function emitChatMessageCreated(userId: string, messageData: any) {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit chat message event');
    return;
  }

  // Emit to user's personal channel for sidebar updates
  io.to(`user:${userId}`).emit('chat-message-created', {
    new: messageData,
    eventType: 'INSERT',
    table: 'chat_messages',
    schema: 'public'
  });

  console.log(`Emitted chat message created event for user ${userId}`);
}

export function emitSidebarRefresh(userId: string) {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit sidebar refresh');
    return;
  }

  // Emit to user's personal channel
  io.to(`user:${userId}`).emit('sidebar-refresh-requested', {
    timestamp: new Date().toISOString()
  });

  console.log(`Emitted sidebar refresh for user ${userId}`);
}