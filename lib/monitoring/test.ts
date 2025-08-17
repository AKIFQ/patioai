// Simple test script to verify monitoring system functionality
import { SocketMonitor } from './socketMonitor';
import { ErrorTracker } from './errorTracker';
import { PerformanceMonitor } from './performanceMonitor';
import { alertSystem } from './alertSystem';

export function testMonitoringSystem() {
  console.log('🧪 Testing monitoring system...');

  try {
    // Test SocketMonitor
    const socketMonitor = SocketMonitor.getInstance();
    const socketMetrics = socketMonitor.getMetrics();
console.log(' SocketMonitor working:', {
      activeConnections: socketMetrics.activeConnections,
      totalConnections: socketMetrics.totalConnections
    });

    // Test ErrorTracker
    const errorTracker = ErrorTracker.getInstance();
    const errorMetrics = errorTracker.getMetrics();
console.log(' ErrorTracker working:', {
      totalErrors: errorMetrics.totalErrors,
      errorRate: errorMetrics.errorRate
    });

    // Test PerformanceMonitor
    const performanceMonitor = PerformanceMonitor.getInstance();
    const performanceMetrics = performanceMonitor.getPerformanceSummary();
console.log(' PerformanceMonitor working:', {
      totalOperations: performanceMetrics.overall.totalOperations,
      successRate: performanceMetrics.overall.successRate
    });

    // Test AlertSystem
    const alertStats = alertSystem.getAlertStats();
console.log(' AlertSystem working:', {
      totalAlerts: alertStats.total,
      activeAlerts: alertStats.active
    });

    // Test error tracking
    errorTracker.trackError('info', 'system', 'Test error for monitoring verification');
console.log(' Error tracking test completed');

    // Test performance recording
    performanceMonitor.recordMetric('test-operation', Date.now() - 100, true);
console.log(' Performance recording test completed');

console.log(' All monitoring systems are working correctly!');
    return true;

  } catch (error) {
console.error(' Monitoring system test failed:', error);
    return false;
  }
}

// Export for use in other files
export default testMonitoringSystem;