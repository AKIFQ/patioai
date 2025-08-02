// Resilient Socket.IO wrapper with error handling and recovery
import { SocketManager } from '../client/socketManager';
import { CircuitBreaker, circuitBreakers } from './circuitBreaker';
import { RetryMechanism, retryConfigs } from './retryMechanism';
import { AsyncErrorHandler, handleAsyncOperation } from '../error/asyncErrorHandler';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

export interface ResilientSocketConfig {
  maxReconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  connectionTimeout: number;
  enableCircuitBreaker: boolean;
  enableRetry: boolean;
}

export interface SocketHealth {
  connected: boolean;
  lastConnected: number;
  connectionAttempts: number;
  lastError?: string;
  circuitBreakerState: string;
  retryStats: any;
}

export class ResilientSocket {
  private socketManager: SocketManager;
  private circuitBreaker: CircuitBreaker;
  private retryMechanism: RetryMechanism;
  private errorHandler: AsyncErrorHandler;
  private performanceMonitor: PerformanceMonitor;
  
  private config: ResilientSocketConfig;
  private connectionAttempts = 0;
  private lastConnected = 0;
  private lastError?: string;
  private heartbeatInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private isReconnecting = false;

  constructor(config?: Partial<ResilientSocketConfig>) {
    this.config = {
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 10000,  // 10 seconds
      enableCircuitBreaker: true,
      enableRetry: true,
      ...config
    };

    this.socketManager = SocketManager.getInstance();
    this.circuitBreaker = circuitBreakers.supabase();
    this.retryMechanism = new RetryMechanism('socket', {
      ...retryConfigs.api,
      maxAttempts: this.config.maxReconnectAttempts
    });
    this.errorHandler = AsyncErrorHandler.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();

    this.setupSocketListeners();
  }

  // Connect with resilience mechanisms
  async connect(token: string): Promise<void> {
    const operation = async () => {
      this.connectionAttempts++;
      
      const connectPromise = this.socketManager.connect(token);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeout);
      });

      const socket = await Promise.race([connectPromise, timeoutPromise]);
      
      this.lastConnected = Date.now();
      this.connectionAttempts = 0;
      this.lastError = undefined;
      
      // Start heartbeat
      this.startHeartbeat();
      
      return socket;
    };

    if (this.config.enableCircuitBreaker) {
      if (this.config.enableRetry) {
        // Use both circuit breaker and retry
        return this.retryMechanism.execute(() => 
          this.circuitBreaker.execute(operation)
        );
      } else {
        // Use only circuit breaker
        return this.circuitBreaker.execute(operation);
      }
    } else if (this.config.enableRetry) {
      // Use only retry
      return this.retryMechanism.execute(operation);
    } else {
      // No resilience mechanisms
      return operation();
    }
  }

  // Disconnect gracefully
  disconnect(): void {
    this.stopHeartbeat();
    this.stopReconnectTimer();
    this.socketManager.disconnect();
  }

  // Get current socket instance
  getSocket() {
    return this.socketManager.getSocket();
  }

  // Check if connected
  isConnected(): boolean {
    const socket = this.socketManager.getSocket();
    return socket?.connected || false;
  }

  // Emit event with error handling
  async emit(event: string, data?: any): Promise<void> {
    const result = await handleAsyncOperation(
      async () => {
        const socket = this.socketManager.getSocket();
        if (!socket || !socket.connected) {
          throw new Error('Socket not connected');
        }
        
        socket.emit(event, data);
      },
      'socket.emit',
      { event, hasData: !!data }
    );

    if (!result.success && result.shouldRetry) {
      // Attempt reconnection if emit failed
      this.attemptReconnection();
    }
  }

  // Listen to events with error handling
  on(event: string, handler: (...args: any[]) => void): void {
    const socket = this.socketManager.getSocket();
    if (socket) {
      socket.on(event, (...args) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in socket event handler for ${event}:`, error);
          this.performanceMonitor.recordMetric(
            'socket.eventHandlerError',
            Date.now(),
            false,
            (error as Error).message,
            { event }
          );
        }
      });
    }
  }

  // Remove event listener
  off(event: string, handler?: (...args: any[]) => void): void {
    const socket = this.socketManager.getSocket();
    if (socket) {
      if (handler) {
        socket.off(event, handler);
      } else {
        socket.off(event);
      }
    }
  }

  // Get health status
  getHealth(): SocketHealth {
    return {
      connected: this.isConnected(),
      lastConnected: this.lastConnected,
      connectionAttempts: this.connectionAttempts,
      lastError: this.lastError,
      circuitBreakerState: this.circuitBreaker.getStats().state,
      retryStats: this.retryMechanism.getStats()
    };
  }

  // Force reconnection
  async forceReconnect(token: string): Promise<void> {
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    return this.connect(token);
  }

  private setupSocketListeners(): void {
    // These will be set up when socket is created
    const setupListeners = () => {
      const socket = this.socketManager.getSocket();
      if (!socket) return;

      socket.on('connect', () => {
        console.log('Resilient socket connected');
        this.lastConnected = Date.now();
        this.connectionAttempts = 0;
        this.lastError = undefined;
        this.isReconnecting = false;
        this.startHeartbeat();
      });

      socket.on('disconnect', (reason) => {
        console.log('Resilient socket disconnected:', reason);
        this.stopHeartbeat();
        
        // Attempt reconnection for certain disconnect reasons
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't reconnect
          return;
        }
        
        this.attemptReconnection();
      });

      socket.on('connect_error', (error) => {
        console.error('Resilient socket connection error:', error);
        this.lastError = error.message;
        this.performanceMonitor.recordMetric(
          'socket.connectionError',
          Date.now(),
          false,
          error.message
        );
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log(`Resilient socket reconnected after ${attemptNumber} attempts`);
        this.isReconnecting = false;
      });

      socket.on('reconnect_error', (error) => {
        console.error('Resilient socket reconnection error:', error);
        this.lastError = error.message;
      });
    };

    // Set up listeners when socket is available
    const checkSocket = () => {
      if (this.socketManager.getSocket()) {
        setupListeners();
      } else {
        setTimeout(checkSocket, 100);
      }
    };
    
    checkSocket();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      const socket = this.socketManager.getSocket();
      if (socket && socket.connected) {
        // Send ping to check connection
        socket.emit('ping', Date.now());
      } else {
        // Connection lost, attempt reconnection
        this.attemptReconnection();
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private attemptReconnection(): void {
    if (this.isReconnecting) {
      return; // Already attempting reconnection
    }

    this.isReconnecting = true;
    this.stopReconnectTimer();

    this.reconnectTimeout = setTimeout(async () => {
      try {
        // Get the last used token (this would need to be stored)
        const token = this.getStoredToken();
        if (token) {
          await this.connect(token);
        }
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
        this.lastError = (error as Error).message;
        
        // Schedule next reconnection attempt
        if (this.connectionAttempts < this.config.maxReconnectAttempts) {
          this.attemptReconnection();
        } else {
          console.error('Max reconnection attempts reached');
          this.isReconnecting = false;
        }
      }
    }, this.config.reconnectDelay * Math.pow(2, Math.min(this.connectionAttempts, 5)));
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  private getStoredToken(): string | null {
    // This would retrieve the stored authentication token
    // Implementation depends on your auth system
    return localStorage.getItem('auth_token');
  }
}

// Global resilient socket instance
let globalResilientSocket: ResilientSocket | null = null;

export function getResilientSocket(config?: Partial<ResilientSocketConfig>): ResilientSocket {
  if (!globalResilientSocket) {
    globalResilientSocket = new ResilientSocket(config);
  }
  return globalResilientSocket;
}

// React hook for resilient socket
export function useResilientSocket(config?: Partial<ResilientSocketConfig>) {
  const socket = getResilientSocket(config);
  
  return {
    connect: socket.connect.bind(socket),
    disconnect: socket.disconnect.bind(socket),
    emit: socket.emit.bind(socket),
    on: socket.on.bind(socket),
    off: socket.off.bind(socket),
    isConnected: socket.isConnected.bind(socket),
    getHealth: socket.getHealth.bind(socket),
    forceReconnect: socket.forceReconnect.bind(socket)
  };
}