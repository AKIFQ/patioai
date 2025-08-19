import type { Socket as SocketIOSocket } from 'socket.io';

export interface AuthenticatedSocket extends SocketIOSocket {
  userId: string;
  currentThread?: Record<string, string>; // Track which thread user is in for each room
  isTyping?: boolean; // Track if user is currently typing
}