# Socket.IO Integration Architecture

## Overview

This document describes the Socket.IO integration architecture for the PatioAI realtime chat system, detailing how Socket.IO replaces Supabase realtime for improved performance, scalability, and control.

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js App  │    │  Socket.IO      │    │   PostgreSQL    │
│   (Frontend)    │◄──►│   Server        │◄──►│   Database      │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Hooks   │    │  Event Handlers │    │  Direct Queries │
│   (useSocket)   │    │  & Middleware   │    │  (No Realtime)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. Socket.IO Server Integration

**Location**: `lib/server/socketEmitter.ts`

The Socket.IO server is integrated directly into the Next.js application, providing:

- **Real-time bidirectional communication** between clients and server
- **Event-based messaging** for chat messages, room updates, and system notifications
- **Connection management** with automatic reconnection and heartbeat monitoring
- **Room-based broadcasting** for efficient message distribution

```typescript
// Core Socket.IO server setup
import { Server as SocketIOServer } from 'socket.io';
import { socketMonitor } from '../monitoring/socketMonitor';

export function setSocketIOInstance(socketServer: SocketIOServer) {
  io = socketServer;
  socketMonitor.initialize(socketServer);
  console.log('Socket.IO instance set with monitoring enabled');
}
```

### 2. Event Emission System

**Location**: `lib/server/socketEmitter.ts`

Centralized event emission system that handles:

- **Room message broadcasting** - `emitRoomMessageCreated()`
- **User-specific notifications** - `emitUserEvent()`
- **Sidebar updates** - `emitSidebarRefresh()`
- **System-wide events** - `emitAPIEvent()`

```typescript
// Example: Room message broadcasting
export function emitRoomMessageCreated(roomIdOrShareCode: string, messageData: any) {
  const socketIO = getSocketIOInstance();
  if (!socketIO) return;

  socketIO.to(`room:${roomIdOrShareCode}`).emit('room-message-created', {
    new: messageData,
    eventType: 'INSERT',
    table: 'room_messages',
    schema: 'public'
  });
}
```

### 3. Client-Side Integration

**Location**: `app/chat/components/SidebarSocketWrapper.tsx`

React component that manages Socket.IO client connections:

- **Connection lifecycle management**
- **Event subscription and cleanup**
- **Automatic reconnection handling**
- **Error handling and logging**

```typescript
// Socket.IO client integration
useEffect(() => {
  if (!socket) return;

  const handleRoomMessageCreated = (data: any) => {
    // Handle real-time message updates
    refreshSidebar();
  };

  socket.on('room-message-created', handleRoomMessageCreated);
  
  return () => {
    socket.off('room-message-created', handleRoomMessageCreated);
  };
}, [socket]);
```

## Event Patterns

### 1. Room-Based Events

Socket.IO uses room-based event distribution for efficient message broadcasting:

```typescript
// Join room pattern
socket.join(`room:${shareCode}`);
socket.join(`user:${userId}`);

// Broadcast to room
io.to(`room:${shareCode}`).emit('room-message-created', messageData);

// Broadcast to specific user
io.to(`user:${userId}`).emit('sidebar-refresh-requested', refreshData);
```

### 2. Event Naming Convention

Events follow a consistent naming pattern:

- **Resource-Action Pattern**: `room-message-created`, `chat-message-updated`
- **Scope Prefixes**: `room:`, `user:`, `system:`
- **Event Types**: `created`, `updated`, `deleted`, `refresh-requested`

### 3. Data Structure Standards

All events follow a consistent data structure:

```typescript
interface SocketEvent {
  new?: any;           // New data (for create/update events)
  old?: any;           // Previous data (for update/delete events)
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | 'REFRESH';
  table: string;       // Database table name
  schema: string;      // Database schema
  timestamp?: string;  // Event timestamp
  source?: string;     // Event source ('api', 'system', etc.)
}
```

## Database Integration

### 1. Direct Database Queries

Socket.IO integration uses direct database queries instead of Supabase realtime:

```typescript
// Database query with monitoring
const queryPromise = supabase
  .from('rooms')
  .select('id, name, share_code, created_by, is_active')
  .eq('share_code', shareCode)
  .single();

const { data: room, error } = await monitorQuery(
  queryPromise,
  'validateRoomAccess',
  requestId
);
```

### 2. Performance Optimizations

- **Indexed queries** for common access patterns
- **Connection pooling** for database efficiency
- **Query monitoring** for performance tracking
- **Caching strategies** for frequently accessed data

## Monitoring and Observability

### 1. Connection Monitoring

**Location**: `lib/monitoring/socketMonitor.ts`

Comprehensive monitoring of Socket.IO connections:

- **Active connection tracking**
- **Connection rate monitoring**
- **Room membership tracking**
- **Performance metrics collection**

### 2. Performance Monitoring

**Location**: `lib/monitoring/performanceMonitor.ts`

Performance tracking for Socket.IO operations:

- **Event emission timing**
- **Database query performance**
- **Memory usage tracking**
- **Error rate monitoring**

### 3. Security Monitoring

**Location**: `lib/security/auditLogger.ts`

Security event logging and monitoring:

- **Connection security events**
- **Authentication failures**
- **Rate limiting violations**
- **Suspicious activity detection**

## Scaling Strategies

### 1. Horizontal Scaling with Redis

For production scaling, Socket.IO can be configured with Redis adapter:

```typescript
// Redis adapter configuration (production)
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

### 2. Load Balancing

Socket.IO supports sticky sessions for load balancing:

```nginx
# Nginx configuration for Socket.IO load balancing
upstream socketio_backend {
    ip_hash;  # Sticky sessions
    server backend1:3001;
    server backend2:3001;
    server backend3:3001;
}

server {
    location /socket.io/ {
        proxy_pass http://socketio_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 3. Connection Limits and Rate Limiting

Built-in protection against connection abuse:

```typescript
// Connection rate limiting
const rateLimitResult = this.checkRateLimit(clientIP);
if (!rateLimitResult.allowed) {
  socket.disconnect(true);
  return;
}

// Connection count monitoring
if (activeConnections > MAX_CONNECTIONS) {
  socket.emit('connection-rejected', { reason: 'Server at capacity' });
  socket.disconnect(true);
}
```

## Security Considerations

### 1. Authentication Integration

Socket.IO connections are authenticated using the existing auth system:

```typescript
// Socket.IO authentication middleware
io.use(async (socket, next) => {
  const authResult = await authValidator.validateSession(socket.request);
  if (!authResult.valid) {
    return next(new Error('Authentication failed'));
  }
  socket.data.userId = authResult.userId;
  socket.data.sessionId = authResult.sessionId;
  next();
});
```

### 2. Input Validation

All Socket.IO events validate input data:

```typescript
// Input validation for Socket.IO events
socket.on('send-message', async (data) => {
  const validationResult = inputValidator.validate(data, messageSchema);
  if (!validationResult.valid) {
    socket.emit('validation-error', { errors: validationResult.errors });
    return;
  }
  // Process validated message
});
```

### 3. Rate Limiting

Per-connection rate limiting prevents abuse:

```typescript
// Rate limiting per socket connection
const rateLimiter = new Map();
socket.on('send-message', (data) => {
  if (isRateLimited(socket.id)) {
    socket.emit('rate-limited', { message: 'Too many messages' });
    return;
  }
  // Process message
});
```

## Migration Benefits

### 1. Performance Improvements

- **Reduced latency**: Direct WebSocket connections vs HTTP polling
- **Lower bandwidth**: Efficient binary protocol vs JSON over HTTP
- **Better connection management**: Built-in reconnection and heartbeat
- **Optimized broadcasting**: Room-based message distribution

### 2. Enhanced Control

- **Custom event handling**: Tailored event patterns for application needs
- **Advanced monitoring**: Comprehensive connection and performance tracking
- **Security integration**: Built-in authentication and rate limiting
- **Flexible scaling**: Redis adapter support for horizontal scaling

### 3. Operational Benefits

- **Simplified architecture**: Single WebSocket connection vs multiple HTTP requests
- **Better debugging**: Comprehensive logging and monitoring
- **Improved reliability**: Automatic reconnection and error handling
- **Cost efficiency**: Reduced external service dependencies

## Best Practices

### 1. Event Design

- **Use descriptive event names** that clearly indicate the action
- **Maintain consistent data structures** across all events
- **Include necessary metadata** for proper event handling
- **Implement proper error handling** for all event listeners

### 2. Connection Management

- **Implement proper cleanup** when components unmount
- **Handle connection failures gracefully** with retry logic
- **Monitor connection health** and provide user feedback
- **Use room-based broadcasting** for efficient message distribution

### 3. Performance Optimization

- **Batch related events** when possible to reduce overhead
- **Use appropriate event frequency** to avoid overwhelming clients
- **Implement client-side caching** for frequently accessed data
- **Monitor and optimize** database queries triggered by events

### 4. Security

- **Always validate input data** from Socket.IO events
- **Implement proper authentication** for all connections
- **Use rate limiting** to prevent abuse
- **Log security events** for monitoring and analysis

## Troubleshooting

### Common Issues

1. **Connection Failures**
   - Check network connectivity
   - Verify server is running and accessible
   - Check authentication credentials
   - Review firewall and proxy settings

2. **Event Not Received**
   - Verify event listener is properly registered
   - Check if client is in the correct room
   - Confirm event name spelling and case
   - Review server-side event emission logic

3. **Performance Issues**
   - Monitor connection count and server resources
   - Check for memory leaks in event handlers
   - Review database query performance
   - Analyze network latency and bandwidth

4. **Authentication Problems**
   - Verify session validity and expiration
   - Check authentication middleware configuration
   - Review CORS settings for cross-origin requests
   - Confirm proper header forwarding through proxies

## Future Enhancements

### Planned Improvements

1. **Redis Integration**: Implement Redis adapter for horizontal scaling
2. **Advanced Monitoring**: Enhanced metrics and alerting capabilities
3. **Message Persistence**: Optional message queuing for offline users
4. **Binary Data Support**: Efficient handling of file uploads and media
5. **Custom Namespaces**: Logical separation of different application areas

### Considerations

- **Backward Compatibility**: Maintain compatibility with existing client code
- **Migration Strategy**: Gradual rollout of new features
- **Performance Impact**: Monitor resource usage of new features
- **Security Review**: Regular security audits of new functionality

---

*This document is part of the Socket.IO migration documentation suite. For implementation details, see the development guide and API documentation.*