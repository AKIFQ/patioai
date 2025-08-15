import { useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import SocketManager from '../lib/client/socketManager';
import { ConnectionHealthMonitor, HealthMetrics } from '../lib/client/connectionHealthMonitor';
import { logger } from '../lib/utils/logger';

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  error: string | null;
  healthMetrics: HealthMetrics | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useSocket(token?: string): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBackgroundedRef = useRef(false);
  const shouldStayConnectedRef = useRef(true);
  const healthMonitorRef = useRef<ConnectionHealthMonitor | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics | null>(null);

  const connect = useCallback(async () => {
    if (!token) {
      setError('Authentication token required');
      setConnectionStatus('error');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setError(null);
      
      const socketManager = SocketManager.getInstance();
      const connectedSocket = await socketManager.connect(token);
      
      setSocket(connectedSocket);
      setIsConnected(true);
      setConnectionStatus('connected');
      
      // Initialize health monitor
      if (healthMonitorRef.current) {
        healthMonitorRef.current.stop();
      }
      
      healthMonitorRef.current = new ConnectionHealthMonitor(connectedSocket, {
        pingInterval: 30000, // 30 seconds
        pingTimeout: 5000, // 5 seconds
        maxFailures: 3,
        onStatusChange: (status, metrics) => {
          console.log(`🏥 Connection health: ${status}`, metrics);
          setHealthMetrics(metrics);
        },
        onReconnectNeeded: () => {
          console.log('🏥 Health monitor requesting reconnection');
          if (shouldStayConnectedRef.current) {
            connect();
          }
        }
      });
      
      healthMonitorRef.current.start();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setConnectionStatus('error');
      setIsConnected(false);
    }
  }, [token]);

  const disconnect = useCallback(() => {
    const socketManager = SocketManager.getInstance();
    socketManager.disconnect();
    
    // Stop health monitor
    if (healthMonitorRef.current) {
      healthMonitorRef.current.stop();
      healthMonitorRef.current = null;
    }
    
    setSocket(null);
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setError(null);
    setHealthMetrics(null);
  }, []);

  // Handle browser visibility changes - keep socket alive when backgrounded
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('🌙 Browser backgrounded - maintaining socket connection');
        isBackgroundedRef.current = true;
        // Keep connection alive, just reduce activity
        if (socket?.connected) {
          socket.emit('user-background', { timestamp: Date.now() });
        }
      } else {
        console.log('🌅 Browser foregrounded - verifying socket connection');
        isBackgroundedRef.current = false;
        // User returned, verify connection
        if (socket && !socket.connected && shouldStayConnectedRef.current) {
          console.log('🔄 Reconnecting socket after foreground');
          connect();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, connect]);

  useEffect(() => {
    if (token && connectionStatus === 'disconnected' && shouldStayConnectedRef.current) {
      connect();
    }

    return () => {
      // Only disconnect on actual unmount, not browser backgrounding
      if (!isBackgroundedRef.current) {
        shouldStayConnectedRef.current = false;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        if (connectionStatus === 'connected') {
          disconnect();
        }
      }
    };
  }, [token, connect, disconnect, connectionStatus]);

  // Update connection status based on socket state with auto-reconnection
  useEffect(() => {
    if (socket) {
      const handleConnect = () => {
        logger.info('Socket connected successfully', { token: token?.substring(0, 10) + '...' });
        setIsConnected(true);
        setConnectionStatus('connected');
        setError(null);
        // Clear any pending reconnection timeouts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      const handleDisconnect = (reason: string) => {
        logger.warn('Socket disconnected', { reason, token: token?.substring(0, 10) + '...' });
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        // Auto-reconnect if the disconnection wasn't intentional and we should stay connected
        if (shouldStayConnectedRef.current && reason !== 'io client disconnect') {
          console.log('🔄 Scheduling automatic reconnection...');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (shouldStayConnectedRef.current && !socket?.connected) {
              console.log('🔄 Attempting automatic reconnection');
              connect();
            }
          }, 2000); // Wait 2 seconds before reconnecting
        }
      };

      const handleError = (err: Error) => {
        logger.error('Socket connection error', { token: token?.substring(0, 10) + '...' }, err);
        setError(err.message);
        setConnectionStatus('error');
        setIsConnected(false);
        
        // Retry connection after error if we should stay connected
        if (shouldStayConnectedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (shouldStayConnectedRef.current) {
              console.log('🔄 Retrying connection after error');
              connect();
            }
          }, 3000); // Wait 3 seconds before retrying after error
        }
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('connect_error', handleError);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect_error', handleError);
      };
    }
  }, [socket, connect]);

  return {
    socket,
    isConnected,
    connectionStatus,
    error,
    healthMetrics,
    connect,
    disconnect,
  };
}