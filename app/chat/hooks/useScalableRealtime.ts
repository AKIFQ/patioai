import { useEffect, useState, useRef, useCallback } from 'react';
import { REALTIME_CONFIG } from '@/lib/realtime/config';
import type { Message } from 'ai';

interface ScalableRealtimeHookProps {
  shareCode: string;
  displayName: string;
  chatSessionId?: string;
  onNewMessage: (message: Message) => void;
  onTypingUpdate: (users: string[]) => void;
}

export function useScalableRealtime({
  shareCode,
  displayName,
  chatSessionId,
  onNewMessage,
  onTypingUpdate
}: ScalableRealtimeHookProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    cleanup();

    const wsUrl = `${REALTIME_CONFIG.websocket.url}/room/${shareCode}?displayName=${encodeURIComponent(displayName)}&threadId=${chatSessionId || 'main'}`;
    
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    setConnectionStatus('CONNECTING');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      setConnectionStatus('CONNECTED');

      // Start heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, REALTIME_CONFIG.websocket.heartbeatInterval);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'pong':
            // Heartbeat response
            break;
            
          case 'new_message':
            console.log('📨 New message received:', data.message);
            onNewMessage(data.message);
            break;
            
          case 'typing_update':
            console.log('⌨️ Typing update:', data.users);
            onTypingUpdate(data.users);
            break;
            
          case 'error':
            console.error('❌ WebSocket error:', data.error);
            break;
            
          default:
            console.log('🔍 Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('🔒 WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      setConnectionStatus('DISCONNECTED');

      // Attempt to reconnect unless it was a clean close
      if (event.code !== 1000) {
        const delay = REALTIME_CONFIG.websocket.reconnectDelay;
        console.log(`🔄 Reconnecting in ${delay}ms...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      setConnectionStatus('ERROR');
    };
  }, [shareCode, displayName, chatSessionId, onNewMessage, onTypingUpdate, cleanup]);

  // Handle visibility changes to maintain connection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !isConnected) {
        console.log('☀️ Tab visible and disconnected - reconnecting');
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, connect]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'typing',
        isTyping,
        displayName,
        timestamp: Date.now()
      }));

      if (isTyping) {
        // Auto-stop typing after 3 seconds
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          broadcastTyping(false);
        }, 3000);
      }
    }
  }, [displayName]);

  return {
    isConnected,
    connectionStatus,
    broadcastTyping
  };
}

// Example WebSocket server implementation (Node.js)
/*
const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // roomId -> Set of connections
const typing = new Map(); // roomId -> Set of typing users

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomId = url.pathname.split('/')[2];
  const displayName = url.searchParams.get('displayName');
  const threadId = url.searchParams.get('threadId');

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);

  ws.roomId = roomId;
  ws.displayName = displayName;
  ws.threadId = threadId;

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
        
      case 'typing':
        handleTyping(ws, message);
        break;
    }
  });

  ws.on('close', () => {
    rooms.get(roomId)?.delete(ws);
    if (rooms.get(roomId)?.size === 0) {
      rooms.delete(roomId);
    }
  });
});

function broadcastToRoom(roomId, message, excludeWs = null) {
  const roomConnections = rooms.get(roomId);
  if (roomConnections) {
    roomConnections.forEach(ws => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}

server.listen(8080, () => {
  console.log('WebSocket server running on port 8080');
});
*/