import { alertSystem } from '../monitoring/alertSystem';
import { memoryMonitor } from '../monitoring/memoryMonitor';

export class EmergencyMemoryCleanup {
  private static isRunning = false;

  static async performEmergencyCleanup(): Promise<void> {
    if (this.isRunning) {
      console.log('🚫 Emergency cleanup already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🚨 Starting emergency memory cleanup...');

    try {
      const beforeMemory = process.memoryUsage().heapUsed;

      // 1. Force garbage collection multiple times
      if (global.gc) {
        console.log('🧹 Running multiple garbage collections...');
        for (let i = 0; i < 3; i++) {
          global.gc();
          await this.sleep(100);
        }
      }

      // 2. Clear monitoring data
      console.log('🧹 Clearing monitoring data...');
      try {
        // Clear alert history but keep system running
        const alertStats = alertSystem.getAlertStats();
        console.log(`Clearing ${alertStats.total} alerts from memory`);
        
        // Get active alerts before cleanup
        const activeAlerts = alertSystem.getActiveAlerts();
        
        // Force cleanup of old data
        (alertSystem as any).alerts = activeAlerts; // Keep only active alerts
        (alertSystem as any).lastAlertTimes.clear();
      } catch (error) {
        console.error('Error clearing alert data:', error);
      }

      // 3. Clear any cached data
      console.log('🧹 Clearing application caches...');
      try {
        // Clear require cache for non-essential modules (be very careful here)
        const moduleKeys = Object.keys(require.cache);
        const clearableModules = moduleKeys.filter(key => 
          key.includes('/node_modules/') && 
          !key.includes('socket.io') &&
          !key.includes('express') &&
          !key.includes('next')
        );
        
        console.log(`Found ${clearableModules.length} clearable cached modules`);
        // Don't actually clear them in production - too risky
      } catch (error) {
        console.error('Error clearing module cache:', error);
      }

      // 4. Clear any global variables that might be holding references
      console.log('🧹 Clearing global references...');
      try {
        // Clear any global arrays or objects that might be accumulating data
        if ((global as any).socketConnections) {
          console.log('Clearing global socket connections');
          (global as any).socketConnections = new Map();
        }
        
        if ((global as any).performanceMetrics) {
          console.log('Clearing global performance metrics');
          (global as any).performanceMetrics = [];
        }
      } catch (error) {
        console.error('Error clearing global references:', error);
      }

      // 5. Final garbage collection
      if (global.gc) {
        console.log('🧹 Final garbage collection...');
        global.gc();
        await this.sleep(500);
      }

      const afterMemory = process.memoryUsage().heapUsed;
      const freedMemory = beforeMemory - afterMemory;
      
      console.log(`✅ Emergency cleanup completed:`);
      console.log(`   Before: ${Math.round(beforeMemory / 1024 / 1024)}MB`);
      console.log(`   After: ${Math.round(afterMemory / 1024 / 1024)}MB`);
      console.log(`   Freed: ${Math.round(freedMemory / 1024 / 1024)}MB`);

      // If still critical, suggest restart
      if (afterMemory > 800 * 1024 * 1024) { // Still over 800MB
        console.error('🚨 Memory still critical after cleanup - application restart recommended');
        this.logRestartInstructions();
      }

    } catch (error) {
      console.error('❌ Error during emergency cleanup:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static logRestartInstructions(): void {
    console.log('🔄 Application Restart Instructions:');
    console.log('   1. Save current state if possible');
    console.log('   2. Gracefully close Socket.IO connections');
    console.log('   3. Close database connections');
    console.log('   4. Restart the Node.js process');
    console.log('   5. Monitor memory usage after restart');
  }

  static getMemoryStatus(): {
    current: number;
    status: 'healthy' | 'warning' | 'critical';
    recommendation: string;
  } {
    const currentMemory = process.memoryUsage().heapUsed;
    const currentMB = Math.round(currentMemory / 1024 / 1024);

    if (currentMemory > 1000 * 1024 * 1024) {
      return {
        current: currentMB,
        status: 'critical',
        recommendation: 'Immediate action required - consider emergency cleanup or restart'
      };
    } else if (currentMemory > 500 * 1024 * 1024) {
      return {
        current: currentMB,
        status: 'warning',
        recommendation: 'Monitor closely - consider cleanup if trend continues'
      };
    } else {
      return {
        current: currentMB,
        status: 'healthy',
        recommendation: 'Memory usage is normal'
      };
    }
  }

  static async scheduleCleanupIfNeeded(): Promise<void> {
    const status = this.getMemoryStatus();
    
    if (status.status === 'critical') {
      console.log(`🚨 Critical memory usage: ${status.current}MB - scheduling emergency cleanup`);
      // Don't await - run in background
      this.performEmergencyCleanup().catch(error => {
        console.error('Emergency cleanup failed:', error);
      });
    } else if (status.status === 'warning') {
      console.log(`⚠️ High memory usage: ${status.current}MB - ${status.recommendation}`);
    }
  }
}

// Auto-schedule cleanup check every 2 minutes
setInterval(() => {
  EmergencyMemoryCleanup.scheduleCleanupIfNeeded().catch(error => {
    console.error('Error in scheduled cleanup check:', error);
  });
}, 2 * 60 * 1000);

export default EmergencyMemoryCleanup;