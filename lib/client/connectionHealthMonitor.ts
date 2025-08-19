import type { Socket } from 'socket.io-client';

export interface HealthMetrics {
  isConnected: boolean;
  lastPingTime: number;
  roundTripTime: number;
  consecutiveFailures: number;
  connectionUptime: number;
  reconnectionCount: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

export interface HealthMonitorOptions {
  pingInterval: number; // ms
  pingTimeout: number; // ms
  maxFailures: number;
  onStatusChange?: (status: HealthMetrics['status'], metrics: HealthMetrics) => void;
  onReconnectNeeded?: () => void;
}

export class ConnectionHealthMonitor {
  private socket: Socket;
  private options: Required<HealthMonitorOptions>;
  private metrics: HealthMetrics;
  private pingInterval: NodeJS.Timer | null = null;
  private pendingPings = new Map<string, { timestamp: number; timeout: NodeJS.Timeout }>();
  private connectionStartTime: number = Date.now();
  private isBackgroundMode = false;
  private normalInterval: number;
  private backgroundInterval: number;

  constructor(socket: Socket, options: Partial<HealthMonitorOptions> = {}) {
    this.socket = socket;
    this.normalInterval = options.pingInterval ?? 30000; // 30 seconds
    this.backgroundInterval = (options.pingInterval ?? 30000) * 4; // 2 minutes
    this.options = {
      pingInterval: this.normalInterval,
      pingTimeout: options.pingTimeout ?? 5000, // 5 seconds
      maxFailures: options.maxFailures ?? 3,
      onStatusChange: options.onStatusChange ?? (() => {}),
      onReconnectNeeded: options.onReconnectNeeded ?? (() => {})
    };

    this.metrics = {
      isConnected: socket.connected,
      lastPingTime: 0,
      roundTripTime: 0,
      consecutiveFailures: 0,
      connectionUptime: 0,
      reconnectionCount: 0,
      status: 'healthy'
    };

    this.setupSocketListeners();
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.pingInterval) {
      // Debug logging removed
      return;
    }

    // Debug logging removed
    this.connectionStartTime = Date.now();
    
    // Start periodic health checks
    this.pingInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.options.pingInterval);

    // Immediate health check
    this.performHealthCheck();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    // Debug logging removed
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // CRITICAL: Clear pending pings and their timeouts to prevent memory leaks
    this.pendingPings.forEach(({ timeout }) => clearTimeout(timeout));
    this.pendingPings.clear();
    
    // Also clear metrics to prevent memory accumulation
    this.metrics = {
      isConnected: false,
      lastPingTime: 0,
      roundTripTime: 0,
      consecutiveFailures: 0,
      connectionUptime: 0,
      reconnectionCount: 0,
      status: 'unhealthy'
    };
  }

  /**
   * Set background mode - reduces ping frequency to save battery
   */
  setBackgroundMode(isBackground: boolean): void {
    if (this.isBackgroundMode === isBackground) {
      return;
    }

    // Debug logging removed
    this.isBackgroundMode = isBackground;
    
    // Update interval and restart monitoring
    this.options.pingInterval = isBackground ? this.backgroundInterval : this.normalInterval;
    
    if (this.pingInterval) {
      // Restart with new interval
      this.stop();
      this.start();
    }
  }

  /**
   * Get current health metrics
   */
  getMetrics(): HealthMetrics {
    return {
      ...this.metrics,
      connectionUptime: Date.now() - this.connectionStartTime
    };
  }

  /**
   * Force a health check
   */
  async performHealthCheck(): Promise<void> {
    if (!this.socket.connected) {
      this.handlePingFailure('Socket not connected');
      return;
    }

    const pingId = this.generatePingId();
    const startTime = Date.now();

    // Debug logging removed

    try {
      // Set up timeout for ping
      const timeout = setTimeout(() => {
        this.handlePingTimeout(pingId);
      }, this.options.pingTimeout);

      // Store ping info
      this.pendingPings.set(pingId, { timestamp: startTime, timeout });

      // Send ping with callback
      this.socket.emit('health-ping', { id: pingId, timestamp: startTime }, (response: any) => {
        this.handlePingResponse(pingId, response);
      });

    } catch (error) {
console.error(' Health check error:', error);
      this.handlePingFailure('Ping emission failed');
    }
  }

  /**
   * Handle ping response
   */
  private handlePingResponse(pingId: string, response: any): void {
    const pingInfo = this.pendingPings.get(pingId);
    if (!pingInfo) {
console.warn(' Received ping response for unknown ping:', pingId);
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pingInfo.timeout);
    this.pendingPings.delete(pingId);

    const roundTripTime = Date.now() - pingInfo.timestamp;
    
    // Debug logging removed

    // Update metrics
    this.metrics.lastPingTime = Date.now();
    this.metrics.roundTripTime = roundTripTime;
    this.metrics.consecutiveFailures = 0;
    this.metrics.isConnected = true;

    this.updateHealthStatus();
  }

  /**
   * Handle ping timeout
   */
  private handlePingTimeout(pingId: string): void {
console.warn(' Health check timeout:', pingId);
    const pingInfo = this.pendingPings.get(pingId);
    if (pingInfo) {
      clearTimeout(pingInfo.timeout);
      this.pendingPings.delete(pingId);
    }
    this.handlePingFailure('Ping timeout');
  }

  /**
   * Handle ping failure
   */
  private handlePingFailure(reason: string): void {
console.warn(' Health check failed:', reason);
    
    this.metrics.consecutiveFailures++;
    this.updateHealthStatus();

    // Trigger reconnection if too many failures
    if (this.metrics.consecutiveFailures >= this.options.maxFailures) {
console.error(' Too many consecutive failures, triggering reconnection');
      this.options.onReconnectNeeded();
    }
  }

  /**
   * Update health status based on metrics
   */
  private updateHealthStatus(): void {
    const oldStatus = this.metrics.status;
    let newStatus: HealthMetrics['status'];

    if (this.metrics.consecutiveFailures === 0 && this.metrics.isConnected) {
      newStatus = 'healthy';
    } else if (this.metrics.consecutiveFailures < this.options.maxFailures) {
      newStatus = 'degraded';
    } else {
      newStatus = 'unhealthy';
    }

    this.metrics.status = newStatus;

    // Notify if status changed
    if (oldStatus !== newStatus) {
      // Debug logging removed
      this.options.onStatusChange(newStatus, this.getMetrics());
    }
  }

  /**
   * Setup socket event listeners
   */
  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      // Debug logging removed
      this.metrics.isConnected = true;
      this.metrics.consecutiveFailures = 0;
      this.connectionStartTime = Date.now();
      this.updateHealthStatus();
    });

    this.socket.on('disconnect', (reason) => {
      // Debug logging removed
      this.metrics.isConnected = false;
      this.updateHealthStatus();
    });

    this.socket.on('reconnect', (attemptNumber) => {
      // Debug logging removed
      this.metrics.reconnectionCount++;
      this.connectionStartTime = Date.now();
      this.updateHealthStatus();
    });
  }

  /**
   * Generate unique ping ID
   */
  private generatePingId(): string {
return `ping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}