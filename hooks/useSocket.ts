import { useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import SocketManager from '../lib/client/socketManager';

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useSocket(token?: string): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [error, setError] = useState<string | null>(null);

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
    setSocket(null);
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setError(null);
  }, []);

  useEffect(() => {
    if (token && connectionStatus === 'disconnected') {
      connect();
    }

    return () => {
      // Cleanup on unmount
      if (connectionStatus === 'connected') {
        disconnect();
      }
    };
  }, [token, connect, disconnect, connectionStatus]);

  // Update connection status based on socket state
  useEffect(() => {
    if (socket) {
      const handleConnect = () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        setError(null);
      };

      const handleDisconnect = () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
      };

      const handleError = (err: Error) => {
        setError(err.message);
        setConnectionStatus('error');
        setIsConnected(false);
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
  }, [socket]);

  return {
    socket,
    isConnected,
    connectionStatus,
    error,
    connect,
    disconnect,
  };
}