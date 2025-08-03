import { Socket as SocketIOSocket } from 'socket.io';

export interface AuthenticatedSocket extends SocketIOSocket {
  userId: string;
}