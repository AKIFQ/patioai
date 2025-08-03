import { io, Socket } from 'socket.io-client';
import { config } from '../config/endpoints';

export interface SocketManagerConfig {
  url: string;
  options?: {
    timeout?: number;
    retries?: number;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
  };
}

class SocketManager {
  private static instance: SocketManager;
  private socket: Socket | null = null;
  private isConnecting = false;
  private connectionPromise: Promise<Socket> | null = null;

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async connect(token: string): Promise<Socket> {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = this.createConnection(token);

    try {
      this.socket = await this.connectionPromise;
      return this.socket;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  private createConnection(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(config.socketIO.serverUrl, {
        auth: { token },
        timeout: config.socketIO.timeout,
        reconnectionAttempts: config.socketIO.reconnectionAttempts,
        reconnectionDelay: config.socketIO.reconnectionDelay,
        transports: ['websocket', 'polling'],
      });

      const timeoutId = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Connection timeout'));
      }, config.socketIO.timeout);

      socket.on('connect', () => {
        clearTimeout(timeoutId);
        console.log('Socket.IO connected:', socket.id);
        resolve(socket);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeoutId);
        console.error('Socket.IO connection error:', error);
        reject(error);
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          socket.connect();
        }
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
      });

      socket.on('reconnect_error', (error) => {
        console.error('Socket.IO reconnection error:', error);
      });

      socket.on('reconnect_failed', () => {
        console.error('Socket.IO reconnection failed');
      });
    });
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // MVP-level event helpers
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

export default SocketManager;