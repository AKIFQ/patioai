'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SocketConnectionTestProps {
  userId: string;
  userRooms: any[];
}

export default function SocketConnectionTest({ userId, userRooms }: SocketConnectionTestProps) {
  const [socketStatus, setSocketStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [socket, setSocket] = useState<any>(null);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initSocket = async () => {
      try {
        console.log('🧪 SocketConnectionTest - Initializing test socket...');
        setSocketStatus('connecting');
        
        const socketIO = await import('socket.io-client');
        const testSocket = socketIO.io(window.location.origin, {
          auth: { token: userId },
          transports: ['websocket', 'polling'],
          timeout: 10000,
          forceNew: true
        });

        testSocket.on('connect', () => {
          console.log('✅ SocketConnectionTest - Socket connected successfully');
          setSocketStatus('connected');
          setConnectionAttempts(prev => prev + 1);
        });

        testSocket.on('connect_error', (error: any) => {
          console.error('❌ SocketConnectionTest - Connection error:', error);
          setSocketStatus('error');
        });

        testSocket.on('disconnect', (reason: any) => {
          console.log('🔌 SocketConnectionTest - Disconnected:', reason);
          setSocketStatus('disconnected');
        });

        // Listen for thread-created events
        testSocket.on('thread-created', (data: any) => {
          console.log('🔥 SocketConnectionTest - Received thread-created:', data);
          setLastEvent({ type: 'thread-created', data, timestamp: new Date().toISOString() });
        });

        // Join user channel
        testSocket.emit('join-user-channel');
        
        // Test ping
        testSocket.emit('ping', { message: 'connection-test', timestamp: Date.now() });

        setSocket(testSocket);
      } catch (error) {
        console.error('❌ SocketConnectionTest - Failed to create socket:', error);
        setSocketStatus('error');
      }
    };

    initSocket();

    return () => {
      if (socket) {
        console.log('🧪 SocketConnectionTest - Cleaning up test socket');
        socket.disconnect();
      }
    };
  }, [userId]);

  const testConnection = () => {
    if (socket && socket.connected) {
      console.log('🧪 SocketConnectionTest - Testing connection...');
      socket.emit('ping', { message: 'manual-test', timestamp: Date.now() });
    }
  };

  const forceReconnect = () => {
    if (socket) {
      console.log('🧪 SocketConnectionTest - Forcing reconnection...');
      socket.disconnect();
      socket.connect();
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔌 Socket.IO Connection Test
          <Badge variant={socketStatus === 'connected' ? 'default' : 'destructive'}>
            {socketStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>User ID:</strong> {userId}
          </div>
          <div>
            <strong>User Rooms:</strong> {userRooms.length}
          </div>
          <div>
            <strong>Connection Attempts:</strong> {connectionAttempts}
          </div>
          <div>
            <strong>Current URL:</strong> {typeof window !== 'undefined' ? window.location.origin : 'N/A'}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={testConnection} disabled={socketStatus !== 'connected'}>
            Test Connection
          </Button>
          <Button onClick={forceReconnect} variant="outline">
            Force Reconnect
          </Button>
        </div>

        {lastEvent && (
          <div className="text-sm">
            <strong>Last Event:</strong>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
              {JSON.stringify(lastEvent, null, 2)}
            </pre>
          </div>
        )}

        <div className="text-xs text-gray-600">
          <strong>Debug Info:</strong> Check browser console for detailed connection logs
        </div>
      </CardContent>
    </Card>
  );
}
