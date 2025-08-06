// System-wide cleanup to prevent memory leaks
import { CSRFProtection } from '../security/csrfProtection';
import { AuditLogger } from '../security/auditLogger';
import { AuthValidator } from '../security/authValidator';
import { ErrorTracker } from '../monitoring/errorTracker';
import { SocketMonitor } from '../monitoring/socketMonitor';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';
import { CacheManager } from '../cache/cacheManager';
import { APICache } from '../cache/apiCache';
import { closeRedisClient } from '../redis/client';

export class SystemCleanup {
  private static instance: SystemCleanup;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  private constructor() {
    // Run comprehensive cleanup every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.performRoutineCleanup();
    }, 30 * 60 * 1000);

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  static getInstance(): SystemCleanup {
    if (!SystemCleanup.instance) {
      SystemCleanup.instance = new SystemCleanup();
    }
    return SystemCleanup.instance;
  }

  // Perform routine cleanup to prevent memory leaks
  async performRoutineCleanup(): Promise<{
    memoryBefore: number;
    memoryAfter: number;
    memoryFreed: number;
    actions: string[];
  }> {
    if (this.isShuttingDown) return;

    const memoryBefore = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const actions: string[] = [];

    try {
      console.log('🧹 Starting routine system cleanup...');

      // 1. Clean up caches
      const cacheManager = CacheManager.getInstance();
      const cacheCleanup = await cacheManager.cleanup();
      actions.push(`Cleaned ${cacheCleanup} cache entries`);

      const apiCache = APICache.getInstance();
      const apiCleanup = await apiCache.invalidateUserCache('*');
      actions.push(`Cleaned ${apiCleanup} API cache entries`);

      // 2. Force garbage collection multiple times
      if (global.gc) {
        for (let i = 0; i < 3; i++) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        actions.push('Forced 3 garbage collection cycles');
      }

      // 3. Clear require cache for non-core modules
      let cacheCleared = 0;
      Object.keys(require.cache).forEach(key => {
        if (!key.includes('node_modules') && (key.includes('lib/') || key.includes('app/'))) {
          delete require.cache[key];
          cacheCleared++;
        }
      });
      if (cacheCleared > 0) {
        actions.push(`Cleared ${cacheCleared} require cache entries`);
      }

      // 4. Clean up monitoring data
      const errorTracker = ErrorTracker.getInstance();
      // ErrorTracker has its own cleanup intervals

      const memoryAfter = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const memoryFreed = memoryBefore - memoryAfter;

      console.log(`✅ Routine cleanup completed: freed ${memoryFreed}MB`);

      return {
        memoryBefore,
        memoryAfter,
        memoryFreed,
        actions
      };

    } catch (error) {
      console.error('❌ Routine cleanup failed:', error);
      actions.push(`Cleanup failed: ${error.message}`);
      
      return {
        memoryBefore,
        memoryAfter: memoryBefore,
        memoryFreed: 0,
        actions
      };
    }
  }

  // Aggressive cleanup for critical memory situations
  async performAggressiveCleanup(): Promise<{
    memoryBefore: number;
    memoryAfter: number;
    memoryFreed: number;
    actions: string[];
  }> {
    const memoryBefore = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const actions: string[] = [];

    try {
      console.log('🚨 Starting aggressive system cleanup...');

      // 1. Perform routine cleanup first
      const routineResult = await this.performRoutineCleanup();
      actions.push(...routineResult.actions);

      // 2. Clear all singleton instances (dangerous but effective)
      try {
        // Clear global caches
        if (typeof global !== 'undefined') {
          const globalKeys = Object.keys(global).filter(key => 
            key.includes('cache') || key.includes('Cache') || key.includes('monitor')
          );
          globalKeys.forEach(key => {
            try {
              if (global[key] && typeof global[key].clear === 'function') {
                global[key].clear();
                actions.push(`Cleared global.${key}`);
              }
            } catch (e) {
              // Ignore errors
            }
          });
        }
      } catch (error) {
        actions.push(`Global cleanup failed: ${error.message}`);
      }

      // 3. Force multiple aggressive garbage collections
      if (global.gc) {
        for (let i = 0; i < 5; i++) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        actions.push('Forced 5 aggressive garbage collection cycles');
      }

      const memoryAfter = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const memoryFreed = memoryBefore - memoryAfter;

      console.log(`✅ Aggressive cleanup completed: freed ${memoryFreed}MB`);

      return {
        memoryBefore,
        memoryAfter,
        memoryFreed,
        actions
      };

    } catch (error) {
      console.error('❌ Aggressive cleanup failed:', error);
      actions.push(`Aggressive cleanup failed: ${error.message}`);
      
      return {
        memoryBefore,
        memoryAfter: memoryBefore,
        memoryFreed: 0,
        actions
      };
    }
  }

  // Setup graceful shutdown handlers
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`🛑 Received ${signal}, performing graceful shutdown...`);

      try {
        // Clear all intervals
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
          this.cleanupInterval = null;
        }

        // Destroy all singleton instances
        try {
          const csrfProtection = CSRFProtection.getInstance();
          if (csrfProtection.destroy) csrfProtection.destroy();
        } catch (e) { /* ignore */ }

        try {
          const auditLogger = AuditLogger.getInstance();
          if (auditLogger.destroy) auditLogger.destroy();
        } catch (e) { /* ignore */ }

        try {
          const authValidator = AuthValidator.getInstance();
          if (authValidator.destroy) authValidator.destroy();
        } catch (e) { /* ignore */ }

        // Close Redis connection
        try {
          closeRedisClient();
        } catch (e) { /* ignore */ }

        // Final cleanup
        await this.performAggressiveCleanup();

        console.log('✅ Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        console.error('❌ Shutdown cleanup failed:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  // Get current system status
  getSystemStatus(): {
    memory: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    process: {
      uptime: number;
      activeHandles: number;
      activeRequests: number;
    };
    cleanup: {
      isActive: boolean;
      nextCleanup: number;
    };
  } {
    const memory = process.memoryUsage();
    const activeHandles = process._getActiveHandles?.() || [];
    const activeRequests = process._getActiveRequests?.() || [];

    return {
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024)
      },
      process: {
        uptime: Math.round(process.uptime()),
        activeHandles: activeHandles.length,
        activeRequests: activeRequests.length
      },
      cleanup: {
        isActive: !this.isShuttingDown && this.cleanupInterval !== null,
        nextCleanup: this.cleanupInterval ? 30 * 60 * 1000 : 0 // 30 minutes
      }
    };
  }

  // Manual cleanup trigger
  async triggerCleanup(aggressive = false): Promise<any> {
    if (aggressive) {
      return await this.performAggressiveCleanup();
    } else {
      return await this.performRoutineCleanup();
    }
  }
}

// Initialize system cleanup on import
export const systemCleanup = SystemCleanup.getInstance();
export default systemCleanup;