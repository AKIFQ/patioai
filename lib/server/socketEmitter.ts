import { Server as SocketIOServer } from 'socket.io';
import { SocketMonitor } from '../monitoring/socketMonitor';
import { alertSystem } from '../monitoring/alertSystem';

// Global Socket.IO server instance
let io: SocketIOServer | null = null;

export function setSocketIOInstance(socketServer: SocketIOServer) {
  io = socketServer;
  // Also set it globally for Next.js API routes to access
  (global as any).__socketIO = socketServer;
  
  // Initialize monitoring
  const socketMonitor = SocketMonitor.getInstance();
  socketMonitor.initialize(socketServer);
  
  // Set up alert system
  alertSystem.addAlertHandler((alert) => {
    console.log(`🚨 [${alert.type.toUpperCase()}] ${alert.message}`);
    
    // Emit alert to monitoring dashboard if needed
    if (alert.type === 'critical') {
      socketServer.emit('system-alert', {
        type: alert.type,
        message: alert.message,
        timestamp: alert.timestamp.toISOString()
      });
    }
  });
  
  console.log('Socket.IO instance set for event emission with monitoring enabled');
}

export function getSocketIOInstance(): SocketIOServer | null {
  // Try to get from local variable first, then from global
  if (io) return io;
  if ((global as any).__socketIO) {
    io = (global as any).__socketIO;
    return io;
  }
  return null;
}

// Helper functions to emit events from API routes
export function emitRoomMessageCreated(roomIdOrShareCode: string, messageData: any) {
  const socketIO = getSocketIOInstance();
  if (!socketIO) {
    console.warn('Socket.IO not initialized, cannot emit room message event');
    return;
  }

  // Emit to all users in the room (using share code for room identification)
  socketIO.to(`room:${roomIdOrShareCode}`).emit('room-message-created', {
    new: messageData,
    eventType: 'INSERT',
    table: 'room_messages',
    schema: 'public'
  });

  console.log(`Emitted room message created event for room ${roomIdOrShareCode}`);
}

export function emitChatMessageCreated(userId: string, messageData: any) {
  const socketIO = getSocketIOInstance();
  if (!socketIO) {
    console.warn('Socket.IO not initialized, cannot emit chat message event');
    return;
  }

  // Emit to user's personal channel for sidebar updates
  socketIO.to(`user:${userId}`).emit('chat-message-created', {
    new: messageData,
    eventType: 'INSERT',
    table: 'chat_messages',
    schema: 'public'
  });

  console.log(`Emitted chat message created event for user ${userId}`);
}

export function emitSidebarRefresh(userId: string) {
  const socketIO = getSocketIOInstance();
  if (!socketIO) {
    console.warn('Socket.IO not initialized, cannot emit sidebar refresh');
    return;
  }

  // Emit to user's personal channel
  socketIO.to(`user:${userId}`).emit('sidebar-refresh-requested', {
    timestamp: new Date().toISOString()
  });

  console.log(`Emitted sidebar refresh for user ${userId}`);
}

// Helper function to emit API-driven events with configuration
export function emitAPIEvent(eventType: string, data: any, target?: string) {
  const socketIO = getSocketIOInstance();
  if (!socketIO) {
    console.warn('Socket.IO not initialized, cannot emit API event');
    return;
  }

  const eventData = {
    ...data,
    timestamp: new Date().toISOString(),
    source: 'api'
  };

  if (target) {
    socketIO.to(target).emit(eventType, eventData);
  } else {
    socketIO.emit(eventType, eventData);
  }

  console.log(`Emitted API event ${eventType} to ${target || 'all'}`);
}

// Helper function to emit user-specific events
export function emitUserEvent(userId: string, eventType: string, data: any) {
  emitAPIEvent(eventType, data, `user:${userId}`);
}

// Helper function to emit room-specific events
export function emitRoomEvent(shareCode: string, eventType: string, data: any) {
  emitAPIEvent(eventType, data, `room:${shareCode}`);
}