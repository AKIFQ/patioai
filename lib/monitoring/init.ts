// Monitoring system initialization
import { SocketMonitor } from './socketMonitor';
import { ErrorTracker } from './errorTracker';
import { PerformanceMonitor } from './performanceMonitor';
import { alertSystem } from './alertSystem';

export function initializeMonitoring() {
  console.log('🔍 Initializing monitoring systems...');

  try {
    // Initialize monitoring instances
    const socketMonitor = SocketMonitor.getInstance();
    const errorTracker = ErrorTracker.getInstance();
    const performanceMonitor = PerformanceMonitor.getInstance();

    // Set up global error handling
    process.on('uncaughtException', (error) => {
      errorTracker.logError({
        level: 'error',
        category: 'system',
        message: `Uncaught Exception: ${error.message}`,
        stack: error.stack,
        context: { type: 'uncaughtException' }
      });
      console.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      errorTracker.logError({
        level: 'error',
        category: 'system',
        message: `Unhandled Rejection: ${reason}`,
        context: { 
          type: 'unhandledRejection',
          promise: promise.toString()
        }
      });
      console.error('Unhandled Rejection:', reason);
    });

    // Set up performance monitoring for process events
    const startTime = Date.now();
    process.on('exit', () => {
      const uptime = Date.now() - startTime;
      console.log(`📊 Process uptime: ${Math.round(uptime / 1000)}s`);
    });

    // Log system information
    console.log('📊 System Information:', {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: Math.floor(process.uptime())
    });

    console.log('✅ Monitoring systems initialized successfully');

    return {
      socketMonitor,
      errorTracker,
      performanceMonitor,
      alertSystem
    };

  } catch (error) {
    console.error('❌ Failed to initialize monitoring systems:', error);
    throw error;
  }
}

// Export monitoring instances for easy access
export {
  SocketMonitor,
  ErrorTracker,
  PerformanceMonitor,
  alertSystem
};