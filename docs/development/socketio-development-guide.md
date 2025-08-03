# Socket.IO Development Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Event Patterns](#event-patterns)
4. [Best Practices](#best-practices)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database running
- Basic understanding of WebSockets and real-time communication
- Familiarity with React hooks and Next.js

### Quick Start

1. **Install Dependencies**
   ```bash
   npm install socket.io socket.io-client
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Verify Socket.IO Connection**
   - Open browser console
   - Navigate to any chat room
   - Look for "Socket.IO connected" message

## Development Setup

### Environment Variables

Add these to your `.env.local`:

```bash
# Socket.IO Configuration
SOCKET_IO_PORT=3001
SOCKET_IO_CORS_ORIGIN=http://localhost:3000
ENABLE_SOCKET_MONITORING=true

# Monitoring and Security
ENABLE_AUTH_VALIDATION=true
ENABLE_CSRF_PROTECTION=true
ENABLE_INPUT_VALIDATION=true
ENABLE_AUDIT_LOGGING=true
```

### Server Configuration

The Socket.IO server is automatically configured in Next.js. Key configuration files:

- `lib/server/socketEmitter.ts` - Core server setup
- `lib/monitoring/socketMonitor.ts` - Connection monitoring
- `lib/security/authValidator.ts` - Authentication

### Client Configuration

Socket.IO client is configured in React components:

```typescript
// Example client setup
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001');
    
    socketInstance.on('connect', () => {
      console.log('Socket.IO connected:', socketInstance.id);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return socket;
};
```

## Event Patterns

### 1. Room-Based Events

Use room-based events for efficient message distribution:

```typescript
// Server-side: Join rooms
socket.on('join-room', (roomData) => {
  socket.join(`room:${roomData.shareCode}`);
  socket.join(`user:${roomData.userId}`);
});

// Server-side: Broadcast to room
io.to(`room:${shareCode}`).emit('room-message-created', messageData);

// Client-side: Listen for room events
socket.on('room-message-created', (data) => {
  // Handle new message
  updateMessages(data.new);
});
```

### 2. User-Specific Events

Send events to specific users:

```typescript
// Server-side: Send to specific user
io.to(`user:${userId}`).emit('sidebar-refresh-requested', {
  timestamp: new Date().toISOString()
});

// Client-side: Listen for user events
socket.on('sidebar-refresh-requested', () => {
  refreshSidebar();
});
```

### 3. System-Wide Events

Broadcast system-wide notifications:

```typescript
// Server-side: System notification
io.emit('system-notification', {
  type: 'maintenance',
  message: 'System maintenance in 5 minutes',
  timestamp: new Date().toISOString()
});

// Client-side: Handle system events
socket.on('system-notification', (notification) => {
  showNotification(notification.message);
});
```

## Best Practices

### 1. Event Naming

Follow consistent naming conventions:

```typescript
// ✅ Good: Descriptive and consistent
'room-message-created'
'user-status-updated'
'chat-typing-started'

// ❌ Bad: Unclear or inconsistent
'msg'
'update'
'event1'
```

### 2. Data Structure

Use consistent data structures:

```typescript
// ✅ Good: Consistent structure
interface SocketEvent {
  new?: any;
  old?: any;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  timestamp: string;
}

// ❌ Bad: Inconsistent structure
{ data: message }  // Sometimes
{ message: data }  // Other times
```

### 3. Error Handling

Always implement proper error handling:

```typescript
// ✅ Good: Comprehensive error handling
socket.on('send-message', async (data, callback) => {
  try {
    const validationResult = validateMessage(data);
    if (!validationResult.valid) {
      callback({ error: 'Invalid message data', errors: validationResult.errors });
      return;
    }

    const message = await saveMessage(data);
    callback({ success: true, message });
    
    // Broadcast to room
    io.to(`room:${data.roomId}`).emit('room-message-created', {
      new: message,
      eventType: 'INSERT',
      table: 'room_messages'
    });

  } catch (error) {
    console.error('Message send error:', error);
    callback({ error: 'Failed to send message' });
  }
});

// ❌ Bad: No error handling
socket.on('send-message', (data) => {
  const message = saveMessage(data); // Could throw
  io.emit('new-message', message);   // No validation
});
```

### 4. Resource Cleanup

Always clean up event listeners:

```typescript
// ✅ Good: Proper cleanup
useEffect(() => {
  if (!socket) return;

  const handleMessage = (data) => {
    setMessages(prev => [...prev, data.new]);
  };

  socket.on('room-message-created', handleMessage);

  return () => {
    socket.off('room-message-created', handleMessage);
  };
}, [socket]);

// ❌ Bad: No cleanup (memory leak)
useEffect(() => {
  socket.on('room-message-created', (data) => {
    setMessages(prev => [...prev, data.new]);
  });
}, []);
```

## Testing

### 1. Unit Testing Socket Events

```typescript
// Test Socket.IO event handlers
import { createServer } from 'http';
import { Server } from 'socket.io';
import Client from 'socket.io-client';

describe('Socket.IO Events', () => {
  let io, serverSocket, clientSocket;

  beforeAll((done) => {
    const httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = new Client(`http://localhost:${port}`);
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
  });

  test('should handle room message creation', (done) => {
    const messageData = {
      content: 'Test message',
      roomId: 'test-room',
      userId: 'test-user'
    };

    clientSocket.on('room-message-created', (data) => {
      expect(data.new.content).toBe('Test message');
      expect(data.eventType).toBe('INSERT');
      done();
    });

    serverSocket.emit('room-message-created', {
      new: messageData,
      eventType: 'INSERT',
      table: 'room_messages'
    });
  });
});
```

### 2. Integration Testing

```typescript
// Test full Socket.IO integration
import { render, screen, waitFor } from '@testing-library/react';
import { SocketProvider } from '../contexts/SocketContext';
import ChatRoom from '../components/ChatRoom';

test('should receive real-time messages', async () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn()
  };

  render(
    <SocketProvider socket={mockSocket}>
      <ChatRoom roomId="test-room" />
    </SocketProvider>
  );

  // Simulate receiving a message
  const messageHandler = mockSocket.on.mock.calls
    .find(call => call[0] === 'room-message-created')[1];
  
  messageHandler({
    new: { content: 'New message', userId: 'user1' },
    eventType: 'INSERT'
  });

  await waitFor(() => {
    expect(screen.getByText('New message')).toBeInTheDocument();
  });
});
```

### 3. Load Testing

```typescript
// Load test Socket.IO connections
import Client from 'socket.io-client';

const loadTest = async (concurrentConnections = 100) => {
  const clients = [];
  const startTime = Date.now();

  // Create multiple connections
  for (let i = 0; i < concurrentConnections; i++) {
    const client = new Client('http://localhost:3001');
    clients.push(client);
    
    client.on('connect', () => {
      console.log(`Client ${i} connected`);
    });
  }

  // Wait for all connections
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Send messages from all clients
  clients.forEach((client, index) => {
    client.emit('send-message', {
      content: `Message from client ${index}`,
      roomId: 'load-test-room'
    });
  });

  // Cleanup
  clients.forEach(client => client.disconnect());
  
  const duration = Date.now() - startTime;
  console.log(`Load test completed in ${duration}ms`);
};
```

## Debugging

### 1. Enable Debug Logging

```bash
# Enable Socket.IO debug logs
DEBUG=socket.io* npm run dev

# Enable specific debug categories
DEBUG=socket.io:server npm run dev
```

### 2. Client-Side Debugging

```typescript
// Enable client debug logging
localStorage.debug = 'socket.io-client:socket';

// Monitor connection events
socket.on('connect', () => console.log('Connected'));
socket.on('disconnect', () => console.log('Disconnected'));
socket.on('connect_error', (error) => console.error('Connection error:', error));
```

### 3. Server-Side Debugging

```typescript
// Monitor server events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, reason);
  });
  
  socket.onAny((eventName, ...args) => {
    console.log('Event received:', eventName, args);
  });
});
```

### 4. Monitoring Dashboard

Access the monitoring dashboard at `/monitoring` to view:

- Active connections
- Event frequency
- Error rates
- Performance metrics

## Common Patterns

### 1. Typing Indicators

```typescript
// Server-side: Handle typing events
socket.on('typing-start', (data) => {
  socket.to(`room:${data.roomId}`).emit('user-typing', {
    userId: data.userId,
    userName: data.userName,
    isTyping: true
  });
});

socket.on('typing-stop', (data) => {
  socket.to(`room:${data.roomId}`).emit('user-typing', {
    userId: data.userId,
    isTyping: false
  });
});

// Client-side: Typing indicator
const [typingUsers, setTypingUsers] = useState(new Set());

useEffect(() => {
  if (!socket) return;

  socket.on('user-typing', (data) => {
    setTypingUsers(prev => {
      const newSet = new Set(prev);
      if (data.isTyping) {
        newSet.add(data.userId);
      } else {
        newSet.delete(data.userId);
      }
      return newSet;
    });
  });

  return () => socket.off('user-typing');
}, [socket]);
```

### 2. Presence System

```typescript
// Server-side: Track user presence
const userPresence = new Map();

socket.on('user-online', (userId) => {
  userPresence.set(userId, {
    socketId: socket.id,
    lastSeen: new Date(),
    status: 'online'
  });
  
  io.emit('presence-update', {
    userId,
    status: 'online',
    lastSeen: new Date()
  });
});

socket.on('disconnect', () => {
  // Find and update user status
  for (const [userId, presence] of userPresence.entries()) {
    if (presence.socketId === socket.id) {
      presence.status = 'offline';
      presence.lastSeen = new Date();
      
      io.emit('presence-update', {
        userId,
        status: 'offline',
        lastSeen: new Date()
      });
      break;
    }
  }
});
```

### 3. Message Acknowledgments

```typescript
// Server-side: Message with acknowledgment
socket.on('send-message', async (data, callback) => {
  try {
    const message = await saveMessage(data);
    
    // Acknowledge to sender
    callback({ success: true, messageId: message.id });
    
    // Broadcast to others
    socket.to(`room:${data.roomId}`).emit('room-message-created', {
      new: message,
      eventType: 'INSERT'
    });
    
  } catch (error) {
    callback({ success: false, error: error.message });
  }
});

// Client-side: Send with acknowledgment
const sendMessage = (messageData) => {
  socket.emit('send-message', messageData, (response) => {
    if (response.success) {
      console.log('Message sent:', response.messageId);
    } else {
      console.error('Failed to send:', response.error);
      // Handle retry logic
    }
  });
};
```

## Troubleshooting

### Common Issues

#### 1. Connection Failures

**Symptoms**: Client cannot connect to Socket.IO server

**Solutions**:
```typescript
// Check server is running
curl http://localhost:3001/socket.io/

// Verify CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Check firewall and proxy settings
// Ensure WebSocket upgrade headers are forwarded
```

#### 2. Events Not Received

**Symptoms**: Client doesn't receive expected events

**Solutions**:
```typescript
// Verify room membership
socket.on('join-room', (roomId) => {
  socket.join(`room:${roomId}`);
  console.log(`Socket ${socket.id} joined room:${roomId}`);
});

// Check event name spelling
socket.on('room-message-created', handler); // Correct
socket.on('room-message-create', handler);  // Wrong

// Verify server-side emission
io.to(`room:${roomId}`).emit('room-message-created', data);
console.log(`Emitted to room:${roomId}`, data);
```

#### 3. Memory Leaks

**Symptoms**: Increasing memory usage over time

**Solutions**:
```typescript
// Always clean up event listeners
useEffect(() => {
  const handler = (data) => { /* handle event */ };
  socket.on('event-name', handler);
  
  return () => {
    socket.off('event-name', handler); // Important!
  };
}, [socket]);

// Monitor connection count
console.log('Active connections:', io.engine.clientsCount);

// Use monitoring dashboard to track memory usage
```

#### 4. Authentication Issues

**Symptoms**: Socket connections rejected or unauthorized

**Solutions**:
```typescript
// Verify authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const user = await validateToken(token);
    socket.data.userId = user.id;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

// Check client authentication
const socket = io('http://localhost:3001', {
  auth: {
    token: getAuthToken()
  }
});
```

### Performance Issues

#### 1. High Latency

**Diagnosis**:
```typescript
// Measure event round-trip time
const startTime = Date.now();
socket.emit('ping', startTime, (serverTime) => {
  const latency = Date.now() - startTime;
  console.log(`Latency: ${latency}ms`);
});
```

**Solutions**:
- Check network connectivity
- Optimize database queries
- Use connection pooling
- Consider Redis adapter for scaling

#### 2. High Memory Usage

**Diagnosis**:
```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
  });
}, 30000);
```

**Solutions**:
- Implement proper event cleanup
- Limit connection count
- Use monitoring alerts
- Regular garbage collection

### Getting Help

1. **Check Logs**: Review server and client console logs
2. **Monitoring Dashboard**: Use `/monitoring` for system health
3. **Debug Mode**: Enable Socket.IO debug logging
4. **Network Tools**: Use browser dev tools to inspect WebSocket traffic
5. **Documentation**: Refer to Socket.IO official documentation

---

*This guide covers the essential patterns and practices for Socket.IO development. For architecture details, see the Socket.IO Integration Architecture document.*