/**
 * Safe Auto-Cleanup System
 * 
 * ONLY cleans up monitoring/system data that doesn't affect users:
 * ✅ Alert history (monitoring data)
 * ✅ Performance metrics (monitoring data) 
 * ✅ Disconnected socket references (system data)
 * ✅ Old event listeners (system data)
 * ✅ Monitoring timers/intervals (system data)
 * 
 * ❌ NEVER touches:
 * ❌ User chat messages
 * ❌ Chat history
 * ❌ Room data
 * ❌ User sessions
 * ❌ Database data
 * ❌ Active connections
 */

import { alertSystem } from './alertSystem';

interface CleanupStats {
  alertsRemoved: number;
  socketsCleanedUp: number;
  listenersRemoved: number;
  timersCleared: number;
  memoryFreed: number;
  timestamp: Date;
}

export class SafeCleanup {
  private static instance: SafeCleanup;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastCleanup: Date | null = null;
  private cleanupStats: CleanupStats[] = [];

  private constructor() {
    this.startAutoCleanup();
  }

  static getInstance(): SafeCleanup {
    if (!SafeCleanup.instance) {
      SafeCleanup.instance = new SafeCleanup();
    }
    return SafeCleanup.instance;
  }

  private startAutoCleanup() {
    // Run cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.performSafeCleanup().catch(error => {
        console.error('Auto-cleanup error:', error);
      });
    }, 10 * 60 * 1000);

    console.log('🧹 Safe auto-cleanup started (every 10 minutes)');
  }

  async performSafeCleanup(): Promise<CleanupStats> {
    if (this.isRunning) {
      console.log('🚫 Cleanup already running, skipping...');
      return this.getLastStats();
    }

    this.isRunning = true;
    const startTime = Date.now();
    const beforeMemory = process.memoryUsage().heapUsed;

    console.log('🧹 Starting safe cleanup...');

    const stats: CleanupStats = {
      alertsRemoved: 0,
      socketsCleanedUp: 0,
      listenersRemoved: 0,
      timersCleared: 0,
      memoryFreed: 0,
      timestamp: new Date()
    };

    try {
      // 1. Clean up old alerts (SAFE - only monitoring data)
      stats.alertsRemoved = await this.cleanupAlerts();

      // 2. Clean up disconnected socket references (SAFE - only system references)
      stats.socketsCleanedUp = await this.cleanupDisconnectedSockets();

      // 3. Remove orphaned event listeners (SAFE - only system listeners)
      stats.listenersRemoved = await this.cleanupOrphanedListeners();

      // 4. Clear old monitoring timers (SAFE - only monitoring timers)
      stats.timersCleared = await this.cleanupMonitoringTimers();

      // 5. Force garbage collection if available
      if (global.gc) {
        global.gc();
        await this.sleep(100);
      }

      const afterMemory = process.memoryUsage().heapUsed;
      stats.memoryFreed = beforeMemory - afterMemory;

      // Store stats (keep only last 50 cleanup runs)
      this.cleanupStats.push(stats);
      if (this.cleanupStats.length > 50) {
        this.cleanupStats = this.cleanupStats.slice(-50);
      }

      this.lastCleanup = new Date();

      const duration = Date.now() - startTime;
      console.log(`✅ Safe cleanup completed in ${duration}ms:`);
      console.log(`   📊 Alerts removed: ${stats.alertsRemoved}`);
      console.log(`   🔌 Sockets cleaned: ${stats.socketsCleanedUp}`);
      console.log(`   🎯 Listeners removed: ${stats.listenersRemoved}`);
      console.log(`   ⏰ Timers cleared: ${stats.timersCleared}`);
      console.log(`   💾 Memory freed: ${Math.round(stats.memoryFreed / 1024 / 1024)}MB`);

    } catch (error) {
      console.error('❌ Error during safe cleanup:', error);
    } finally {
      this.isRunning = false;
    }

    return stats;
  }

  private async cleanupAlerts(): Promise<number> {
    try {
      const beforeCount = (alertSystem as any).alerts?.length || 0;
      
      // Only keep alerts from last 2 hours (very conservative)
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const alerts = (alertSystem as any).alerts || [];
      
      // Keep critical alerts longer (6 hours)
      const criticalCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
      
      const filteredAlerts = alerts.filter((alert: any) => {
        if (alert.type === 'critical') {
          return alert.timestamp > criticalCutoff;
        }
        return alert.timestamp > cutoff;
      });

      (alertSystem as any).alerts = filteredAlerts;

      // Clean up alert times map
      const alertTimes = (alertSystem as any).lastAlertTimes || new Map();
      for (const [ruleId, time] of alertTimes.entries()) {
        if (Date.now() - time.getTime() > 2 * 60 * 60 * 1000) {
          alertTimes.delete(ruleId);
        }
      }

      const removed = beforeCount - filteredAlerts.length;
      if (removed > 0) {
        console.log(`🧹 Cleaned ${removed} old alerts (kept ${filteredAlerts.length})`);
      }

      return removed;
    } catch (error) {
      console.error('Error cleaning alerts:', error);
      return 0;
    }
  }

  private async cleanupDisconnectedSockets(): Promise<number> {
    try {
      let cleanedCount = 0;

      // Get Socket.IO instance safely
      const { getSocketIOInstance } = require('../server/socketEmitter');
      const io = getSocketIOInstance();
      
      if (!io) return 0;

      const sockets = io.sockets.sockets;
      const socketsToRemove: string[] = [];

      // Find truly disconnected sockets
      for (const [id, socket] of sockets) {
        if (!socket.connected && socket.disconnected) {
          // Double-check it's been disconnected for more than 5 minutes
          const disconnectTime = (socket as any).disconnectedAt;
          if (disconnectTime && Date.now() - disconnectTime > 5 * 60 * 1000) {
            socketsToRemove.push(id);
          }
        }
      }

      // Remove references to disconnected sockets
      socketsToRemove.forEach(id => {
        try {
          const socket = sockets.get(id);
          if (socket) {
            // Clear any remaining timeouts
            if ((socket as any).cleanupTimeout) {
              clearTimeout((socket as any).cleanupTimeout);
            }
            
            // Remove from sockets map
            sockets.delete(id);
            cleanedCount++;
          }
        } catch (error) {
          console.warn(`Error cleaning socket ${id}:`, error);
        }
      });

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} disconnected socket references`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning disconnected sockets:', error);
      return 0;
    }
  }

  private async cleanupOrphanedListeners(): Promise<number> {
    try {
      let removedCount = 0;

      // Clean up process event listeners that might be orphaned
      const processEvents = process.eventNames();
      
      processEvents.forEach(eventName => {
        const listeners = process.listeners(eventName);
        
        // Only remove listeners that are clearly monitoring-related
        const monitoringEvents = [
          'memoryUsage',
          'performanceMetric', 
          'alertCheck',
          'cleanupTimer'
        ];
        
        if (monitoringEvents.includes(eventName as string)) {
          // Remove old monitoring listeners
          listeners.forEach(listener => {
            if (listener.name && listener.name.includes('monitoring')) {
              process.removeListener(eventName, listener);
              removedCount++;
            }
          });
        }
      });

      if (removedCount > 0) {
        console.log(`🧹 Cleaned ${removedCount} orphaned event listeners`);
      }

      return removedCount;
    } catch (error) {
      console.error('Error cleaning orphaned listeners:', error);
      return 0;
    }
  }

  private async cleanupMonitoringTimers(): Promise<number> {
    try {
      let clearedCount = 0;

      // Get active handles and look for old monitoring timers
      const activeHandles = (process as any)._getActiveHandles?.() || [];
      
      activeHandles.forEach((handle: any) => {
        // Only clear timers that are clearly monitoring-related
        if (handle && handle.constructor && handle.constructor.name === 'Timeout') {
          // Check if it's a monitoring timer (this is tricky, so be very conservative)
          const hasMonitoringRef = handle._onTimeout && 
            handle._onTimeout.toString().includes('monitoring');
          
          if (hasMonitoringRef) {
            try {
              clearTimeout(handle);
              clearedCount++;
            } catch (error) {
              // Ignore errors when clearing timers
            }
          }
        }
      });

      if (clearedCount > 0) {
        console.log(`🧹 Cleared ${clearedCount} old monitoring timers`);
      }

      return clearedCount;
    } catch (error) {
      console.error('Error cleaning monitoring timers:', error);
      return 0;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods
  getLastStats(): CleanupStats {
    return this.cleanupStats[this.cleanupStats.length - 1] || {
      alertsRemoved: 0,
      socketsCleanedUp: 0,
      listenersRemoved: 0,
      timersCleared: 0,
      memoryFreed: 0,
      timestamp: new Date()
    };
  }

  getCleanupHistory(): CleanupStats[] {
    return [...this.cleanupStats];
  }

  getLastCleanupTime(): Date | null {
    return this.lastCleanup;
  }

  isCleanupRunning(): boolean {
    return this.isRunning;
  }

  // Manual cleanup trigger
  async triggerManualCleanup(): Promise<CleanupStats> {
    console.log('🔧 Manual cleanup triggered');
    return this.performSafeCleanup();
  }

  // Emergency cleanup (more aggressive but still safe)
  async emergencyCleanup(): Promise<CleanupStats> {
    console.log('🚨 Emergency cleanup triggered');
    
    const stats = await this.performSafeCleanup();
    
    // Additional emergency measures (still safe)
    try {
      // More aggressive alert cleanup (keep only last hour)
      const alerts = (alertSystem as any).alerts || [];
      const emergencyCutoff = new Date(Date.now() - 60 * 60 * 1000);
      const emergencyFiltered = alerts.filter((alert: any) => 
        alert.timestamp > emergencyCutoff || alert.type === 'critical'
      );
      
      const additionalRemoved = alerts.length - emergencyFiltered.length;
      (alertSystem as any).alerts = emergencyFiltered;
      
      stats.alertsRemoved += additionalRemoved;
      
      // Force multiple garbage collections
      if (global.gc) {
        for (let i = 0; i < 3; i++) {
          global.gc();
          await this.sleep(200);
        }
      }
      
      console.log(`🚨 Emergency cleanup removed additional ${additionalRemoved} alerts`);
      
    } catch (error) {
      console.error('Error in emergency cleanup:', error);
    }
    
    return stats;
  }

  // Graceful shutdown
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    console.log('🛑 Safe cleanup system shutdown');
  }
}

// Export singleton
export const safeCleanup = SafeCleanup.getInstance();
export default safeCleanup;