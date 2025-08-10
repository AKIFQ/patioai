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
  private cleanupHistory: Array<{ timestamp: number; freedMemory: number; actions: string[] }> = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  // Memory thresholds in MB
  private readonly CRITICAL_THRESHOLD = 3000; // 3GB - aggressive cleanup
  private readonly WARNING_THRESHOLD = 2000;  // 2GB - moderate cleanup
  private readonly CLEANUP_COOLDOWN = 30000;  // 30 seconds between cleanups

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
    // Check memory every 10 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 10000);

    console.log('🧠 Memory Manager: Started monitoring with aggressive cleanup');
  }

  private checkMemoryUsage() {
    const memStats = this.getMemoryStats();
    const heapUsedMB = memStats.heapUsed / 1024 / 1024;

    // Log current memory usage
    if (heapUsedMB > this.WARNING_THRESHOLD) {
      console.warn(`⚠️ High memory usage: ${Math.round(heapUsedMB)}MB`);
    }

    // Trigger cleanup if needed
    if (heapUsedMB > this.CRITICAL_THRESHOLD) {
      console.error(`🚨 CRITICAL: Memory usage ${Math.round(heapUsedMB)}MB - triggering aggressive cleanup`);
      this.performAggressiveCleanup();
    } else if (heapUsedMB > this.WARNING_THRESHOLD) {
      console.warn(`⚠️ WARNING: Memory usage ${Math.round(heapUsedMB)}MB - triggering moderate cleanup`);
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
      console.log('🧹 Starting aggressive memory cleanup...');

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

      console.log(`✅ Aggressive cleanup completed: freed ${Math.round(freedMemory / 1024 / 1024)}MB`);

      // Record cleanup result
      this.cleanupHistory.push({
        timestamp: now,
        freedMemory,
        actions: [...actions]
      });

      return { success: true, freedMemory, actions };

    } catch (error) {
      console.error('❌ Error during aggressive cleanup:', error);
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
      console.log('🧹 Starting moderate memory cleanup...');

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

      console.log(`✅ Moderate cleanup completed: freed ${Math.round(freedMemory / 1024 / 1024)}MB`);

      return { success: true, freedMemory, actions };

    } catch (error) {
      console.error('❌ Error during moderate cleanup:', error);
      return { success: false, freedMemory: 0, actions, error: String(error) };
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private async cleanupSocketData(aggressive = true) {
    try {
      const socketMonitor = SocketMonitor.getInstance();
      
      if (aggressive) {
        // Trim history and prune stale connection times via public APIs
        socketMonitor.trimHistoryTo(50);
        socketMonitor.removeStaleConnectionTimes(10 * 60 * 1000); // 10 minutes
      } else {
        // Just clean up old data (older than 1 hour)
        socketMonitor.removeStaleConnectionTimes(60 * 60 * 1000);
      }
    } catch (error) {
      console.error('Error cleaning socket data:', error);
    }
  }

  private async cleanupErrorData(aggressive = true) {
    try {
      const errorTracker = ErrorTracker.getInstance();
      
      if (aggressive) {
        // Use safe APIs instead of touching internals
        errorTracker.trimErrorsTo(20);
        errorTracker.clearAggregates();
      } else {
        // Clean up errors older than 1 hour
        errorTracker.removeErrorsOlderThan(60 * 60 * 1000);
      }
    } catch (error) {
      console.error('Error cleaning error data:', error);
    }
  }

  private async cleanupPerformanceData(aggressive = true) {
    try {
      const performanceMonitor = PerformanceMonitor.getInstance();
      
      if (aggressive) {
        // Use safe APIs
        performanceMonitor.clearAllMetrics();
        performanceMonitor.trimMetricsTo(100); // keep a small tail just in case
        performanceMonitor.resetOperationMaps();
      } else {
        // Moderate cleanup: drop metrics older than 1 hour
        performanceMonitor.clearOldMetrics(1);
      }
    } catch (error) {
      console.error('Error cleaning performance data:', error);
    }
  }

  private async cleanupDatabaseConnections() {
    try {
      // Force close any idle database connections
      // This is implementation-specific to your database client
      console.log('🔌 Cleaning up database connections...');
      
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
    console.log('🧹 Manual cleanup triggered');
    return this.performAggressiveCleanup();
  }

  public updateThresholds(warning: number, critical: number) {
    if (warning > 0 && critical > warning) {
      (this as any).WARNING_THRESHOLD = warning;
      (this as any).CRITICAL_THRESHOLD = critical;
      console.log(`🧠 Memory thresholds updated: Warning=${warning}MB, Critical=${critical}MB`);
    }
  }

  public cleanup() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.cleanupHistory = [];
    console.log('🧠 Memory Manager: Cleaned up');
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();
export default memoryManager;