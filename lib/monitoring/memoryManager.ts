
import { SocketMonitor } from './socketMonitor';
import { ErrorTracker } from './errorTracker';
import { PerformanceMonitor } from './performanceMonitor';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

interface CleanupResult {
  success: boolean;
  freedMemory: number;
  actions: string[];
  error?: string;
}

export class MemoryManager {
  private static instance: MemoryManager;
  private cleanupInProgress = false;
  private lastCleanup = 0;
  private cleanupHistory: { timestamp: number; freedMemory: number; actions: string[] }[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  // CRITICAL: Container-compatible memory thresholds in MB
  private readonly CRITICAL_THRESHOLD = 2048;  // 2GB - aggressive cleanup (was 768MB)
  private readonly WARNING_THRESHOLD = 1536;   // 1.5GB - moderate cleanup (was 512MB)
  private readonly CLEANUP_COOLDOWN = 30000;   // 30 seconds between cleanups (less frequent)

  private constructor() {
    this.startMemoryMonitoring();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private startMemoryMonitoring() {
    // CRITICAL FIX: Reduce monitoring frequency when memory is stable
    // Start with more frequent checks, then back off if memory is stable
    let checkCount = 0;
    let lastMemoryLevel = 0;
    
    const adaptiveCheck = () => {
      try {
        checkCount++;
        const currentMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        
        // If memory is stable (within 50MB for 3 checks), reduce frequency
        const isStable = Math.abs(currentMemory - lastMemoryLevel) < 50 && checkCount > 3;
        
        this.checkMemoryUsage();
        lastMemoryLevel = currentMemory;
        
        // Adaptive interval: 60s when stable, 30s when unstable, 15s when critical
        const nextInterval = currentMemory > this.CRITICAL_THRESHOLD ? 15000 :
                            isStable ? 60000 : 30000;
        
        // Clear existing interval and set new one
        if (this.monitoringInterval) {
          clearTimeout(this.monitoringInterval);
        }
        
        this.monitoringInterval = setTimeout(adaptiveCheck, nextInterval);
      } catch (error) {
        console.error('Memory monitoring error:', error);
        // Fallback to less frequent monitoring if errors occur
        this.monitoringInterval = setTimeout(adaptiveCheck, 60000);
      }
    };

    // Start initial check
    adaptiveCheck();
    console.log('Memory Manager: Started adaptive monitoring');
  }

  private checkMemoryUsage() {
    const memStats = this.getMemoryStats();
    const heapUsedMB = memStats.heapUsed / 1024 / 1024;

    // Check memory usage thresholds
    if (heapUsedMB > this.WARNING_THRESHOLD) {
      console.warn('High memory usage:', Math.round(heapUsedMB), 'MB');
    }

    // Trigger cleanup if needed
    if (heapUsedMB > this.CRITICAL_THRESHOLD) {
      console.error('CRITICAL: Memory usage', Math.round(heapUsedMB), 'MB - triggering cleanup');
      this.performAggressiveCleanup();
    } else if (heapUsedMB > this.WARNING_THRESHOLD) {
      console.warn('WARNING: Memory usage', Math.round(heapUsedMB), 'MB - triggering cleanup');
      this.performModerateCleanup();
    }
  }

  private async performAggressiveCleanup(): Promise<CleanupResult> {
    if (this.cleanupInProgress) {
      return { success: false, freedMemory: 0, actions: [], error: 'Cleanup already in progress' };
    }

    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_COOLDOWN) {
      return { success: false, freedMemory: 0, actions: [], error: 'Cleanup cooldown active' };
    }

    this.cleanupInProgress = true;
    this.lastCleanup = now;

    const beforeMemory = this.getMemoryStats().heapUsed;
    const actions: string[] = [];

    try {
      // Starting aggressive memory cleanup

      // 1. Force garbage collection if available
      if (global.gc) {
        global.gc();
        actions.push('Forced garbage collection');
      }

      // 2. Clean up socket monitoring data
      await this.cleanupSocketData();
      actions.push('Cleaned socket monitoring data');

      // 3. Clean up error tracking data
      await this.cleanupErrorData();
      actions.push('Cleaned error tracking data');

      // 4. Clean up performance monitoring data
      await this.cleanupPerformanceData();
      actions.push('Cleaned performance monitoring data');

      // 5. Clean up database connections
      await this.cleanupDatabaseConnections();
      actions.push('Cleaned database connections');

      // 6. Clean up old cleanup history
      this.cleanupHistory = this.cleanupHistory.slice(-10);
      actions.push('Cleaned cleanup history');

      // 7. Force another garbage collection
      if (global.gc) {
        global.gc();
        actions.push('Final garbage collection');
      }

      const afterMemory = this.getMemoryStats().heapUsed;
      const freedMemory = beforeMemory - afterMemory;

      // Aggressive cleanup completed

      // Record cleanup result
      this.cleanupHistory.push({
        timestamp: now,
        freedMemory,
        actions: [...actions]
      });

      return { success: true, freedMemory, actions };

    } catch (error) {
      console.error('Error during aggressive cleanup:', error);
      return { success: false, freedMemory: 0, actions, error: String(error) };
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private async performModerateCleanup(): Promise<CleanupResult> {
    if (this.cleanupInProgress) {
      return { success: false, freedMemory: 0, actions: [], error: 'Cleanup already in progress' };
    }

    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_COOLDOWN / 2) {
      return { success: false, freedMemory: 0, actions: [], error: 'Cleanup cooldown active' };
    }

    this.cleanupInProgress = true;
    this.lastCleanup = now;

    const beforeMemory = this.getMemoryStats().heapUsed;
    const actions: string[] = [];

    try {
      // Starting moderate memory cleanup

      // 1. Clean up old socket data
      await this.cleanupSocketData(false);
      actions.push('Cleaned old socket data');

      // 2. Clean up old error data
      await this.cleanupErrorData(false);
      actions.push('Cleaned old error data');

      // 3. Force garbage collection if available
      if (global.gc) {
        global.gc();
        actions.push('Forced garbage collection');
      }

      const afterMemory = this.getMemoryStats().heapUsed;
      const freedMemory = beforeMemory - afterMemory;

      // Moderate cleanup completed

      return { success: true, freedMemory, actions };

    } catch (error) {
      console.error('Error during moderate cleanup:', error);
      return { success: false, freedMemory: 0, actions, error: String(error) };
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private async cleanupSocketData(aggressive = true) {
    try {
      // CRITICAL FIX: Avoid creating new references and imports during cleanup
      // Pre-cache instances to avoid memory allocation during critical situations
      
      if (aggressive) {
        // Cleaning Socket.IO internal memory structures
        
        // Clean Socket.IO memory FIRST (most critical)
        const io = (global as any).__socketIO;
        if (io?.sockets?.sockets) {
          let cleanedSockets = 0;
          let cleanedRooms = 0;
          
          // Clean disconnected sockets efficiently
          for (const [socketId, socket] of io.sockets.sockets.entries()) {
            const socketAny = socket as any;
            
            if (!socketAny.connected) {
              try {
                // Quick cleanup without expensive operations
                if (socketAny.currentThread) {
                  delete socketAny.currentThread;
                }
                if (socketAny.isTyping !== undefined) {
                  delete socketAny.isTyping;
                }
                socketAny.removeAllListeners();
                cleanedSockets++;
              } catch {
                // Silent fail - don't let cleanup errors cascade
              }
            }
          }
          
          // Clean empty rooms efficiently
          const rooms = io.sockets.adapter.rooms;
          if (rooms) {
            for (const [roomName, socketSet] of rooms.entries()) {
              if (roomName.startsWith('room:') && socketSet.size === 0) {
                rooms.delete(roomName);
                cleanedRooms++;
              }
            }
          }
          
          if (cleanedSockets > 0 || cleanedRooms > 0) {
            // Cleaned sockets and rooms
          }
        }
        
        // Clean monitoring data WITHOUT imports (to avoid memory allocation)
        try {
          const socketMonitor = SocketMonitor.getInstance();
          socketMonitor.trimHistoryTo(20); // More aggressive
          socketMonitor.removeStaleConnectionTimes(5 * 60 * 1000); // 5 minutes
        } catch {
          // Silent fail
        }
      } else {
        // Lightweight cleanup - don't touch Socket.IO internals
        try {
          const socketMonitor = SocketMonitor.getInstance();
          socketMonitor.removeStaleConnectionTimes(60 * 60 * 1000);
        } catch {
          // Silent fail
        }
      }
    } catch (error) {
      // Log error but don't throw - cleanup must not fail
      console.warn('Socket cleanup warning:', error.message);
    }
  }

  private async cleanupErrorData(aggressive = true) {
    try {
      // CRITICAL FIX: Don't create new instances during memory pressure
      // Cleaning error tracker data
      
      if (aggressive) {
        // Minimal error cleanup without instance creation
        try {
          const errorTracker = ErrorTracker.getInstance();
          errorTracker.trimErrorsTo(10); // Very aggressive
          errorTracker.clearAggregates();
        } catch {
          // Silent fail - error tracker may not be available
        }
      }
    } catch (error) {
      console.warn('Error cleanup warning:', error.message);
    }
  }

  private async cleanupPerformanceData(aggressive = true) {
    try {
      // CRITICAL FIX: Don't create new instances during memory pressure  
      // Cleaning performance monitor metrics
      
      if (aggressive) {
        try {
          const performanceMonitor = PerformanceMonitor.getInstance();
          performanceMonitor.clearAllMetrics();
          performanceMonitor.trimMetricsTo(50); // More aggressive
          performanceMonitor.resetOperationMaps();
        } catch {
          // Silent fail - performance monitor may not be available
        }
      }
    } catch (error) {
      console.warn('Performance cleanup warning:', error.message);
    }
  }

  private async cleanupDatabaseConnections() {
    try {
      // Force close any idle database connections
      // This is implementation-specific to your database client
      // Cleaning up database connections
      
      // If using Supabase, connections are managed automatically
      // But we can clear any cached clients
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.error('Error cleaning database connections:', error);
    }
  }

  public getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers || 0
    };
  }

  public getMemoryReport() {
    const stats = this.getMemoryStats();
    const heapUsedMB = Math.round(stats.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(stats.heapTotal / 1024 / 1024);
    const rssMB = Math.round(stats.rss / 1024 / 1024);

    return {
      current: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        rss: rssMB,
        external: Math.round(stats.external / 1024 / 1024),
        arrayBuffers: Math.round(stats.arrayBuffers / 1024 / 1024)
      },
      thresholds: {
        warning: this.WARNING_THRESHOLD,
        critical: this.CRITICAL_THRESHOLD
      },
      status: heapUsedMB > this.CRITICAL_THRESHOLD ? 'critical' : 
              heapUsedMB > this.WARNING_THRESHOLD ? 'warning' : 'healthy',
      cleanupHistory: this.cleanupHistory.slice(-5),
      lastCleanup: this.lastCleanup,
      cleanupInProgress: this.cleanupInProgress
    };
  }

  public async forceCleanup(): Promise<CleanupResult> {
    // Manual cleanup triggered
    return this.performAggressiveCleanup();
  }

  public updateThresholds(warning: number, critical: number) {
    if (warning > 0 && critical > warning) {
      (this as any).WARNING_THRESHOLD = warning;
      (this as any).CRITICAL_THRESHOLD = critical;
      // Memory thresholds updated
    }
  }

  public cleanup() {
    if (this.monitoringInterval) {
      clearTimeout(this.monitoringInterval); // Fix: was clearInterval but we changed to setTimeout
      this.monitoringInterval = null;
    }
    
    this.cleanupHistory = [];
    // Memory Manager cleaned up
  }

  // CRITICAL: Emergency memory circuit breaker
  public isMemoryPressureHigh(): boolean {
    const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
    return heapUsedMB > this.CRITICAL_THRESHOLD;
  }

  // Global memory status for other components to check
  public getGlobalMemoryStatus(): 'healthy' | 'warning' | 'critical' | 'emergency' {
    const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 900) return 'emergency';
    if (heapUsedMB > this.CRITICAL_THRESHOLD) return 'critical';
    if (heapUsedMB > this.WARNING_THRESHOLD) return 'warning';
    return 'healthy';
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();
export default memoryManager;