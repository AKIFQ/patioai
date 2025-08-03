import { Server as SocketIOServer } from 'socket.io';

interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  connectionsByRoom: Map<string, number>;
  connectionsByUser: Map<string, number>;
  averageConnectionTime: number;
  peakConnections: number;
  connectionsPerMinute: number;
  lastUpdated: Date;
}

interface ConnectionEvent {
  userId: string;
  socketId: string;
  timestamp: Date;
  event: 'connect' | 'disconnect';
  reason?: string;
  duration?: number;
}

export class SocketMonitor {
  private static instance: SocketMonitor;
  private metrics: ConnectionMetrics;
  private connectionHistory: ConnectionEvent[] = [];
  private connectionTimes: Map<string, Date> = new Map();
  private io: SocketIOServer | null = null;

  private constructor() {
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      connectionsByRoom: new Map(),
      connectionsByUser: new Map(),
      averageConnectionTime: 0,
      peakConnections: 0,
      connectionsPerMinute: 0,
      lastUpdated: new Date()
    };

    // Clean up old connection history every hour
    setInterval(() => {
      this.cleanupHistory();
    }, 60 * 60 * 1000);

    // Update connections per minute every minute
    setInterval(() => {
      this.updateConnectionsPerMinute();
    }, 60 * 1000);
  }

  static getInstance(): SocketMonitor {
    if (!SocketMonitor.instance) {
      SocketMonitor.instance = new SocketMonitor();
    }
    return SocketMonitor.instance;
  }

  setSocketIOInstance(io: SocketIOServer) {
    this.io = io;
  }

  initialize(io: SocketIOServer) {
    this.setSocketIOInstance(io);
    console.log('Socket Monitor initialized with Socket.IO server');
  }

  // Track connection events
  onConnect(userId: string, socketId: string) {
    const now = new Date();
    
    this.connectionHistory.push({
      userId,
      socketId,
      timestamp: now,
      event: 'connect'
    });

    this.connectionTimes.set(socketId, now);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    
    // Update user connections
    const userConnections = this.metrics.connectionsByUser.get(userId) || 0;
    this.metrics.connectionsByUser.set(userId, userConnections + 1);

    // Update peak connections
    if (this.metrics.activeConnections > this.metrics.peakConnections) {
      this.metrics.peakConnections = this.metrics.activeConnections;
    }

    this.metrics.lastUpdated = now;

    console.log(`📊 Socket Monitor: User ${userId} connected (${this.metrics.activeConnections} active)`);
  }

  onDisconnect(userId: string, socketId: string, reason?: string) {
    const now = new Date();
    const connectTime = this.connectionTimes.get(socketId);
    const duration = connectTime ? now.getTime() - connectTime.getTime() : 0;

    this.connectionHistory.push({
      userId,
      socketId,
      timestamp: now,
      event: 'disconnect',
      reason,
      duration
    });

    this.connectionTimes.delete(socketId);
    this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);

    // Update user connections
    const userConnections = this.metrics.connectionsByUser.get(userId) || 0;
    if (userConnections <= 1) {
      this.metrics.connectionsByUser.delete(userId);
    } else {
      this.metrics.connectionsByUser.set(userId, userConnections - 1);
    }

    // Update average connection time
    this.updateAverageConnectionTime();

    this.metrics.lastUpdated = now;

    console.log(`📊 Socket Monitor: User ${userId} disconnected after ${Math.round(duration / 1000)}s (${this.metrics.activeConnections} active)`);
  }

  onRoomJoin(userId: string, roomId: string) {
    const roomConnections = this.metrics.connectionsByRoom.get(roomId) || 0;
    this.metrics.connectionsByRoom.set(roomId, roomConnections + 1);
    
    console.log(`📊 Socket Monitor: User ${userId} joined room ${roomId} (${roomConnections + 1} in room)`);
  }

  onRoomLeave(userId: string, roomId: string) {
    const roomConnections = this.metrics.connectionsByRoom.get(roomId) || 0;
    if (roomConnections <= 1) {
      this.metrics.connectionsByRoom.delete(roomId);
    } else {
      this.metrics.connectionsByRoom.set(roomId, roomConnections - 1);
    }

    console.log(`📊 Socket Monitor: User ${userId} left room ${roomId} (${Math.max(0, roomConnections - 1)} in room)`);
  }

  // Get current metrics
  getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      connectionsByRoom: new Map(this.metrics.connectionsByRoom),
      connectionsByUser: new Map(this.metrics.connectionsByUser)
    };
  }

  // Get connection history for analysis
  getConnectionHistory(limit: number = 100): ConnectionEvent[] {
    return this.connectionHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Get health status
  getHealthStatus() {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    
    const recentConnections = this.connectionHistory.filter(
      event => event.timestamp >= oneMinuteAgo && event.event === 'connect'
    ).length;

    const recentDisconnections = this.connectionHistory.filter(
      event => event.timestamp >= oneMinuteAgo && event.event === 'disconnect'
    ).length;

    const connectionRate = recentConnections - recentDisconnections;
    
    return {
      status: this.getOverallStatus(),
      activeConnections: this.metrics.activeConnections,
      peakConnections: this.metrics.peakConnections,
      connectionsPerMinute: this.metrics.connectionsPerMinute,
      connectionRate,
      averageConnectionTime: this.metrics.averageConnectionTime,
      activeRooms: this.metrics.connectionsByRoom.size,
      activeUsers: this.metrics.connectionsByUser.size,
      lastUpdated: this.metrics.lastUpdated
    };
  }

  // Get alerts if any thresholds are exceeded
  getAlerts() {
    const alerts = [];
    const metrics = this.metrics;

    // High connection count alert
    if (metrics.activeConnections > 1000) {
      alerts.push({
        level: 'warning',
        message: `High connection count: ${metrics.activeConnections} active connections`,
        timestamp: new Date()
      });
    }

    // Very high connection count alert
    if (metrics.activeConnections > 5000) {
      alerts.push({
        level: 'critical',
        message: `Critical connection count: ${metrics.activeConnections} active connections`,
        timestamp: new Date()
      });
    }

    // High connections per minute
    if (metrics.connectionsPerMinute > 100) {
      alerts.push({
        level: 'info',
        message: `High connection rate: ${metrics.connectionsPerMinute} connections/minute`,
        timestamp: new Date()
      });
    }

    return alerts;
  }

  private updateAverageConnectionTime() {
    const recentDisconnections = this.connectionHistory
      .filter(event => event.event === 'disconnect' && event.duration)
      .slice(-100); // Last 100 disconnections

    if (recentDisconnections.length > 0) {
      const totalTime = recentDisconnections.reduce((sum, event) => sum + (event.duration || 0), 0);
      this.metrics.averageConnectionTime = Math.round(totalTime / recentDisconnections.length);
    }
  }

  private updateConnectionsPerMinute() {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    
    const connectionsInLastMinute = this.connectionHistory.filter(
      event => event.timestamp >= oneMinuteAgo && event.event === 'connect'
    ).length;

    this.metrics.connectionsPerMinute = connectionsInLastMinute;
  }

  private cleanupHistory() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.connectionHistory = this.connectionHistory.filter(
      event => event.timestamp >= oneDayAgo
    );

    console.log(`📊 Socket Monitor: Cleaned up old connection history, ${this.connectionHistory.length} events remaining`);
  }

  private getOverallStatus(): 'healthy' | 'warning' | 'critical' {
    if (this.metrics.activeConnections > 5000) return 'critical';
    if (this.metrics.activeConnections > 1000) return 'warning';
    return 'healthy';
  }

  // Export metrics for external monitoring systems
  exportMetrics() {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();
    const alerts = this.getAlerts();

    return {
      timestamp: new Date().toISOString(),
      metrics: {
        total_connections: metrics.totalConnections,
        active_connections: metrics.activeConnections,
        peak_connections: metrics.peakConnections,
        connections_per_minute: metrics.connectionsPerMinute,
        average_connection_time_ms: metrics.averageConnectionTime,
        active_rooms: metrics.connectionsByRoom.size,
        active_users: metrics.connectionsByUser.size
      },
      health,
      alerts
    };
  }
}