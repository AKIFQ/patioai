# Socket.IO Scaling Strategies

## Overview

This document outlines strategies for scaling the Socket.IO-based realtime chat system to handle increased load, concurrent connections, and geographic distribution.

## Current Architecture

### Single Instance Setup

The current development setup runs Socket.IO as a single instance integrated with Next.js:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │◄──►│   Next.js +     │◄──►│   PostgreSQL    │
│   (Browsers)    │    │   Socket.IO     │    │   Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Limitations**:
- Single point of failure
- Limited to single server resources
- No geographic distribution
- Connection limit based on single server capacity

## Horizontal Scaling with Redis

### Redis Adapter Architecture

For production scaling, implement Redis adapter for multi-instance deployment:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Redis Cluster │    │   PostgreSQL    │
│   (Nginx/HAProxy)│    │   (Pub/Sub)     │    │   Database      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Socket.IO     │◄──►│   Socket.IO     │◄──►│   Socket.IO     │
│   Instance 1    │    │   Instance 2    │    │   Instance 3    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Implementation

#### 1. Redis Adapter Setup

```typescript
// lib/server/socketAdapter.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export function setupRedisAdapter(io: Server) {
  if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
    const pubClient = createClient({ 
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });
    
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Redis adapter configured for Socket.IO scaling');
    }).catch((error) => {
      console.error('❌ Redis adapter setup failed:', error);
    });

    // Handle Redis connection errors
    pubClient.on('error', (err) => {
      console.error('Redis pub client error:', err);
    });

    subClient.on('error', (err) => {
      console.error('Redis sub client error:', err);
    });
  }
}
```

#### 2. Load Balancer Configuration

**Nginx Configuration**:

```nginx
# /etc/nginx/sites-available/socketio-app
upstream socketio_backend {
    # Sticky sessions for Socket.IO
    ip_hash;
    
    server app1.example.com:3001 max_fails=3 fail_timeout=30s;
    server app2.example.com:3001 max_fails=3 fail_timeout=30s;
    server app3.example.com:3001 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name chat.example.com;

    # Socket.IO endpoint
    location /socket.io/ {
        proxy_pass http://socketio_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Next.js app
    location / {
        proxy_pass http://socketio_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**HAProxy Configuration**:

```haproxy
# /etc/haproxy/haproxy.cfg
global
    daemon
    maxconn 4096

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend socketio_frontend
    bind *:80
    default_backend socketio_backend

backend socketio_backend
    balance source  # Sticky sessions
    option httpchk GET /api/health
    
    server app1 app1.example.com:3001 check
    server app2 app2.example.com:3001 check
    server app3 app3.example.com:3001 check
```

## Vertical Scaling

### Resource Optimization

#### 1. Memory Optimization

```typescript
// lib/server/memoryOptimization.ts
export function optimizeMemoryUsage() {
  // Limit connection history
  const MAX_CONNECTION_HISTORY = 1000;
  
  // Periodic cleanup
  setInterval(() => {
    // Clean up old connections
    cleanupOldConnections();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// Connection pooling for database
export function setupConnectionPooling() {
  return {
    max: 20,          // Maximum connections
    min: 5,           // Minimum connections
    idle: 10000,      // Idle timeout
    acquire: 30000,   // Acquire timeout
    evict: 1000       // Eviction interval
  };
}
```

#### 2. CPU Optimization

```typescript
// lib/server/cpuOptimization.ts
import cluster from 'cluster';
import os from 'os';

export function setupClusterMode() {
  if (process.env.NODE_ENV === 'production' && cluster.isPrimary) {
    const numCPUs = os.cpus().length;
    
    console.log(`Master ${process.pid} is running`);
    console.log(`Forking ${numCPUs} workers`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died`);
      console.log('Starting a new worker');
      cluster.fork();
    });
  }
}
```

## Geographic Distribution

### Multi-Region Deployment

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   US East       │    │   EU West       │    │   Asia Pacific  │
│   Region        │    │   Region        │    │   Region        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Load Balancer │    │   Load Balancer │
│   + Socket.IO   │    │   + Socket.IO   │    │   + Socket.IO   │
│   Instances     │    │   Instances     │    │   Instances     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Global Redis  │
                    │   Cluster       │
                    └─────────────────┘
```

#### Implementation Strategy

1. **DNS-Based Routing**:
   ```javascript
   // Client-side region detection
   const getOptimalSocketURL = () => {
     const region = detectUserRegion(); // Based on IP/location
     const endpoints = {
       'us-east': 'https://us-east.chat.example.com',
       'eu-west': 'https://eu-west.chat.example.com',
       'asia-pacific': 'https://ap.chat.example.com'
     };
     return endpoints[region] || endpoints['us-east'];
   };
   ```

2. **Cross-Region Message Sync**:
   ```typescript
   // lib/server/crossRegionSync.ts
   export class CrossRegionSync {
     private redisCluster: Redis.Cluster;

     constructor() {
       this.redisCluster = new Redis.Cluster([
         { host: 'redis-us-east.example.com', port: 6379 },
         { host: 'redis-eu-west.example.com', port: 6379 },
         { host: 'redis-ap.example.com', port: 6379 }
       ]);
     }

     async syncMessage(roomId: string, message: any) {
       // Publish to all regions
       await this.redisCluster.publish(`global:room:${roomId}`, JSON.stringify(message));
     }
   }
   ```

## Connection Management

### Connection Limits

```typescript
// lib/server/connectionLimits.ts
export class ConnectionManager {
  private maxConnections: number;
  private currentConnections: number = 0;
  private connectionQueue: Array<{ socket: Socket; resolve: Function; reject: Function }> = [];

  constructor(maxConnections: number = 10000) {
    this.maxConnections = maxConnections;
  }

  async acceptConnection(socket: Socket): Promise<boolean> {
    if (this.currentConnections < this.maxConnections) {
      this.currentConnections++;
      this.setupConnectionCleanup(socket);
      return true;
    }

    // Queue connection or reject
    if (this.connectionQueue.length < 100) {
      return new Promise((resolve, reject) => {
        this.connectionQueue.push({ socket, resolve, reject });
        
        // Timeout queued connections
        setTimeout(() => {
          const index = this.connectionQueue.findIndex(item => item.socket === socket);
          if (index !== -1) {
            this.connectionQueue.splice(index, 1);
            reject(new Error('Connection timeout'));
          }
        }, 30000);
      });
    }

    return false; // Reject connection
  }

  private setupConnectionCleanup(socket: Socket) {
    socket.on('disconnect', () => {
      this.currentConnections--;
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.connectionQueue.length > 0 && this.currentConnections < this.maxConnections) {
      const { socket, resolve } = this.connectionQueue.shift()!;
      this.currentConnections++;
      this.setupConnectionCleanup(socket);
      resolve(true);
    }
  }
}
```

### Rate Limiting

```typescript
// lib/server/rateLimiting.ts
export class SocketRateLimiter {
  private limits: Map<string, { count: number; resetTime: number }> = new Map();

  checkLimit(socketId: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    const limit = this.limits.get(socketId);

    if (!limit || now > limit.resetTime) {
      this.limits.set(socketId, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (limit.count >= maxRequests) {
      return false;
    }

    limit.count++;
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [socketId, limit] of this.limits.entries()) {
      if (now > limit.resetTime) {
        this.limits.delete(socketId);
      }
    }
  }
}
```

## Monitoring and Metrics

### Scaling Metrics

```typescript
// lib/monitoring/scalingMetrics.ts
export class ScalingMetrics {
  private metrics = {
    connectionsPerSecond: 0,
    messagesPerSecond: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    responseTime: 0
  };

  collectMetrics() {
    setInterval(() => {
      this.metrics.cpuUsage = process.cpuUsage().user / 1000000; // Convert to seconds
      this.metrics.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      
      // Send metrics to monitoring service
      this.sendToMonitoring(this.metrics);
    }, 10000); // Every 10 seconds
  }

  private sendToMonitoring(metrics: any) {
    // Send to monitoring service (e.g., DataDog, New Relic, Prometheus)
    console.log('Scaling metrics:', metrics);
  }

  shouldScale(): { scale: boolean; direction: 'up' | 'down'; reason: string } {
    const { cpuUsage, memoryUsage, connectionsPerSecond } = this.metrics;

    // Scale up conditions
    if (cpuUsage > 80) {
      return { scale: true, direction: 'up', reason: 'High CPU usage' };
    }
    
    if (memoryUsage > 1000) { // 1GB
      return { scale: true, direction: 'up', reason: 'High memory usage' };
    }
    
    if (connectionsPerSecond > 50) {
      return { scale: true, direction: 'up', reason: 'High connection rate' };
    }

    // Scale down conditions
    if (cpuUsage < 20 && memoryUsage < 200 && connectionsPerSecond < 5) {
      return { scale: true, direction: 'down', reason: 'Low resource usage' };
    }

    return { scale: false, direction: 'up', reason: 'Metrics within normal range' };
  }
}
```

### Auto-Scaling Integration

```typescript
// lib/server/autoScaling.ts
export class AutoScaler {
  private scalingMetrics: ScalingMetrics;
  private isScaling: boolean = false;

  constructor() {
    this.scalingMetrics = new ScalingMetrics();
    this.startMonitoring();
  }

  private startMonitoring() {
    setInterval(() => {
      if (this.isScaling) return;

      const scalingDecision = this.scalingMetrics.shouldScale();
      
      if (scalingDecision.scale) {
        this.triggerScaling(scalingDecision.direction, scalingDecision.reason);
      }
    }, 30000); // Check every 30 seconds
  }

  private async triggerScaling(direction: 'up' | 'down', reason: string) {
    this.isScaling = true;
    
    try {
      console.log(`🔄 Triggering scale ${direction}: ${reason}`);
      
      // Integration with cloud provider auto-scaling
      if (process.env.CLOUD_PROVIDER === 'aws') {
        await this.scaleAWS(direction);
      } else if (process.env.CLOUD_PROVIDER === 'gcp') {
        await this.scaleGCP(direction);
      } else if (process.env.CLOUD_PROVIDER === 'azure') {
        await this.scaleAzure(direction);
      }
      
      // Wait for scaling to complete
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
      
    } catch (error) {
      console.error('Scaling failed:', error);
    } finally {
      this.isScaling = false;
    }
  }

  private async scaleAWS(direction: 'up' | 'down') {
    // AWS Auto Scaling Group integration
    const AWS = require('aws-sdk');
    const autoscaling = new AWS.AutoScaling();
    
    const params = {
      AutoScalingGroupName: process.env.AWS_ASG_NAME,
      DesiredCapacity: direction === 'up' ? 
        await this.getCurrentCapacity() + 1 : 
        Math.max(1, await this.getCurrentCapacity() - 1)
    };
    
    return autoscaling.setDesiredCapacity(params).promise();
  }

  private async scaleGCP(direction: 'up' | 'down') {
    // Google Cloud Instance Group Manager integration
    // Implementation depends on GCP SDK
  }

  private async scaleAzure(direction: 'up' | 'down') {
    // Azure Virtual Machine Scale Sets integration
    // Implementation depends on Azure SDK
  }

  private async getCurrentCapacity(): Promise<number> {
    // Get current instance count from cloud provider
    return 3; // Placeholder
  }
}
```

## Performance Optimization

### Message Batching

```typescript
// lib/server/messageBatching.ts
export class MessageBatcher {
  private batches: Map<string, any[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_TIMEOUT = 100; // ms

  addMessage(roomId: string, message: any) {
    if (!this.batches.has(roomId)) {
      this.batches.set(roomId, []);
    }

    const batch = this.batches.get(roomId)!;
    batch.push(message);

    // Send batch if size limit reached
    if (batch.length >= this.BATCH_SIZE) {
      this.sendBatch(roomId);
      return;
    }

    // Set timer for batch timeout
    if (!this.batchTimers.has(roomId)) {
      const timer = setTimeout(() => {
        this.sendBatch(roomId);
      }, this.BATCH_TIMEOUT);
      
      this.batchTimers.set(roomId, timer);
    }
  }

  private sendBatch(roomId: string) {
    const batch = this.batches.get(roomId);
    if (!batch || batch.length === 0) return;

    // Send batched messages
    io.to(`room:${roomId}`).emit('messages-batch', {
      messages: batch,
      count: batch.length,
      timestamp: new Date().toISOString()
    });

    // Clean up
    this.batches.delete(roomId);
    const timer = this.batchTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(roomId);
    }
  }
}
```

### Connection Pooling

```typescript
// lib/server/connectionPooling.ts
export class SocketConnectionPool {
  private pools: Map<string, Socket[]> = new Map();
  private readonly MAX_POOL_SIZE = 100;

  addToPool(region: string, socket: Socket) {
    if (!this.pools.has(region)) {
      this.pools.set(region, []);
    }

    const pool = this.pools.get(region)!;
    
    if (pool.length < this.MAX_POOL_SIZE) {
      pool.push(socket);
    }

    // Clean up disconnected sockets
    this.cleanupPool(region);
  }

  getFromPool(region: string): Socket | null {
    const pool = this.pools.get(region);
    if (!pool || pool.length === 0) return null;

    // Return first available socket
    for (let i = 0; i < pool.length; i++) {
      const socket = pool[i];
      if (socket.connected) {
        return socket;
      }
    }

    return null;
  }

  private cleanupPool(region: string) {
    const pool = this.pools.get(region);
    if (!pool) return;

    // Remove disconnected sockets
    const connectedSockets = pool.filter(socket => socket.connected);
    this.pools.set(region, connectedSockets);
  }
}
```

## Deployment Strategies

### Blue-Green Deployment

```yaml
# docker-compose.blue-green.yml
version: '3.8'

services:
  # Blue environment (current)
  app-blue:
    image: socketio-app:current
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@db:5432/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app-blue.rule=Host(`chat.example.com`)"
      - "traefik.http.services.app-blue.loadbalancer.server.port=3001"

  # Green environment (new)
  app-green:
    image: socketio-app:new
    ports:
      - "3002:3001"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@db:5432/app
    labels:
      - "traefik.enable=false"  # Initially disabled

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
```

### Rolling Deployment

```bash
#!/bin/bash
# scripts/rolling-deploy.sh

INSTANCES=("app1.example.com" "app2.example.com" "app3.example.com")
NEW_IMAGE="socketio-app:$1"

for instance in "${INSTANCES[@]}"; do
  echo "Deploying to $instance..."
  
  # Remove from load balancer
  curl -X POST "http://loadbalancer/api/remove/$instance"
  
  # Wait for connections to drain
  sleep 30
  
  # Deploy new version
  ssh $instance "docker pull $NEW_IMAGE && docker-compose up -d"
  
  # Health check
  for i in {1..30}; do
    if curl -f "http://$instance:3001/api/health"; then
      echo "$instance is healthy"
      break
    fi
    sleep 10
  done
  
  # Add back to load balancer
  curl -X POST "http://loadbalancer/api/add/$instance"
  
  echo "$instance deployment complete"
done
```

## Cost Optimization

### Resource Right-Sizing

```typescript
// lib/server/resourceOptimization.ts
export class ResourceOptimizer {
  private metrics: any[] = [];

  collectResourceMetrics() {
    setInterval(() => {
      const usage = {
        timestamp: new Date(),
        cpu: process.cpuUsage(),
        memory: process.memoryUsage(),
        connections: this.getActiveConnections(),
        throughput: this.getMessageThroughput()
      };
      
      this.metrics.push(usage);
      
      // Keep only last 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
      
    }, 60000); // Every minute
  }

  getOptimalInstanceSize(): string {
    const avgCpu = this.getAverageCpuUsage();
    const avgMemory = this.getAverageMemoryUsage();
    const avgConnections = this.getAverageConnections();

    if (avgCpu < 20 && avgMemory < 512 && avgConnections < 100) {
      return 't3.small';  // AWS instance type
    } else if (avgCpu < 50 && avgMemory < 1024 && avgConnections < 500) {
      return 't3.medium';
    } else if (avgCpu < 70 && avgMemory < 2048 && avgConnections < 1000) {
      return 't3.large';
    } else {
      return 't3.xlarge';
    }
  }

  private getAverageCpuUsage(): number {
    // Calculate average CPU usage from metrics
    return 0; // Placeholder
  }

  private getAverageMemoryUsage(): number {
    // Calculate average memory usage from metrics
    return 0; // Placeholder
  }

  private getAverageConnections(): number {
    // Calculate average connection count from metrics
    return 0; // Placeholder
  }

  private getActiveConnections(): number {
    // Get current active connections
    return 0; // Placeholder
  }

  private getMessageThroughput(): number {
    // Get current message throughput
    return 0; // Placeholder
  }
}
```

## Disaster Recovery

### Backup and Recovery

```typescript
// lib/server/disasterRecovery.ts
export class DisasterRecovery {
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString();
    const backupId = `backup-${timestamp}`;

    // Backup database
    await this.backupDatabase(backupId);
    
    // Backup Redis state
    await this.backupRedisState(backupId);
    
    // Backup configuration
    await this.backupConfiguration(backupId);

    return backupId;
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    // Restore database
    await this.restoreDatabase(backupId);
    
    // Restore Redis state
    await this.restoreRedisState(backupId);
    
    // Restore configuration
    await this.restoreConfiguration(backupId);
  }

  private async backupDatabase(backupId: string): Promise<void> {
    // Database backup implementation
  }

  private async backupRedisState(backupId: string): Promise<void> {
    // Redis backup implementation
  }

  private async backupConfiguration(backupId: string): Promise<void> {
    // Configuration backup implementation
  }

  private async restoreDatabase(backupId: string): Promise<void> {
    // Database restore implementation
  }

  private async restoreRedisState(backupId: string): Promise<void> {
    // Redis restore implementation
  }

  private async restoreConfiguration(backupId: string): Promise<void> {
    // Configuration restore implementation
  }
}
```

## Summary

This scaling strategy provides multiple approaches for handling increased load:

1. **Horizontal Scaling**: Redis adapter for multi-instance deployment
2. **Vertical Scaling**: Resource optimization and clustering
3. **Geographic Distribution**: Multi-region deployment with global sync
4. **Connection Management**: Limits, queuing, and rate limiting
5. **Performance Optimization**: Batching, pooling, and caching
6. **Monitoring**: Comprehensive metrics and auto-scaling
7. **Deployment**: Blue-green and rolling deployment strategies
8. **Cost Optimization**: Right-sizing and resource monitoring
9. **Disaster Recovery**: Backup and recovery procedures

Choose the appropriate scaling strategy based on your specific requirements, traffic patterns, and infrastructure constraints.

---

*This document is part of the Socket.IO scaling documentation suite. For implementation details, see the development guide and deployment documentation.*