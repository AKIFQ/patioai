import { io, type Socket } from 'socket.io-client';
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
        // Debug logging removed
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          (window as any).__patio_socket = socket;
        }
        resolve(socket);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeoutId);
console.error('Socket.IO connection error:', error);
        reject(error);
      });

      socket.on('disconnect', (reason) => {
        // Debug logging removed
        // Don't force reconnection here - let the hook handle it
        // This prevents duplicate reconnection attempts
      });

      socket.on('reconnect', (attemptNumber: number) => {
        // Debug logging removed
        // Reset connection state
        this.isConnecting = false;
        this.connectionPromise = null;
      });

      socket.on('reconnect_error', (error: Error) => {
console.error(' Socket.IO reconnection error:', error);
      });

      socket.on('reconnect_failed', () => {
console.error(' Socket.IO reconnection failed - all attempts exhausted');
        // Reset connection state so manual reconnection can work
        this.isConnecting = false;
        this.connectionPromise = null;
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
  emit(event: string, data?: any): boolean {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      return true;
    } else {
console.warn(' Socket not connected, cannot emit event:', event);
      return false;
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