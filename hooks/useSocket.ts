import { useEffect, useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import SocketManager from '../lib/client/socketManager';
import type { HealthMetrics } from '../lib/client/connectionHealthMonitor';
import { ConnectionHealthMonitor } from '../lib/client/connectionHealthMonitor';
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
      
      // CRITICAL: Properly cleanup existing health monitor to prevent multiple instances
      if (healthMonitorRef.current) {
        healthMonitorRef.current.stop();
        healthMonitorRef.current = null;
      }
      
      healthMonitorRef.current = new ConnectionHealthMonitor(connectedSocket, {
        pingInterval: 60000, // 60 seconds - less aggressive
        pingTimeout: 10000, // 10 seconds - more time for response
        maxFailures: 5, // More failures before triggering reconnection
        onStatusChange: (status, metrics) => {
          // Connection health updated
          setHealthMetrics(metrics);
        },
        onReconnectNeeded: () => {
          // Health monitor requesting reconnection
          // Only reconnect if socket is actually disconnected, not just slow
          if (shouldStayConnectedRef.current && !connectedSocket.connected) {
            // Socket disconnected, reconnecting
            connect();
          } else {
            // Socket still connected, ignoring reconnection request
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
        // Browser backgrounded - maintaining socket connection
        isBackgroundedRef.current = true;
        // Keep connection alive, just reduce health monitoring frequency
        if (socket?.connected) {
          socket.emit('user-background', { timestamp: Date.now() });
        }
        // Reduce health monitoring frequency but don't stop completely
        if (healthMonitorRef.current) {
          healthMonitorRef.current.setBackgroundMode(true);
        }
      } else {
        // Browser foregrounded - resuming activity
        isBackgroundedRef.current = false;
        
        // Restore normal health monitoring
        if (healthMonitorRef.current) {
          healthMonitorRef.current.setBackgroundMode(false);
        }
        
        // User returned, verify connection and recover any pending messages
        if (socket && !socket.connected && shouldStayConnectedRef.current) {
          // Reconnecting socket after foreground
          connect();
        } else if (socket?.connected) {
          // Verify connection is still healthy after being backgrounded
          // Verifying connection health after foreground
          socket.emit('user-foreground', { timestamp: Date.now() });
          
          // Trigger health check to ensure connection is still good
          if (healthMonitorRef.current) {
            healthMonitorRef.current.performHealthCheck();
          }
          
          // CRITICAL FIX: Request any missed messages while backgrounded
          socket.emit('request-missed-messages', { 
            timestamp: Date.now(),
            lastActiveTime: isBackgroundedRef.current ? Date.now() - 60000 : Date.now() // Assume 1 min background
          });
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
        
        // DISABLED: Auto-reconnect was causing constant refresh loops
        // Let Socket.IO handle its own reconnection instead of forcing it
      // Socket disconnected, letting Socket.IO handle reconnection
      };

      const handleError = (err: Error) => {
        logger.error('Socket connection error', { token: token?.substring(0, 10) + '...' }, err);
        setError(err.message);
        setConnectionStatus('error');
        setIsConnected(false);
        
        // DISABLED: Manual retry was causing refresh loops
        // Let Socket.IO handle its own error recovery
      // Socket error, letting Socket.IO handle recovery
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