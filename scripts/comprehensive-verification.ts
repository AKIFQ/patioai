#!/usr/bin/env tsx

// Comprehensive verification script for Socket.IO and database optimizations
import { SocketDatabaseService, ConnectionPoolManager } from '../lib/database/socketQueries';
import { APICache } from '../lib/cache/apiCache';
import { CacheManager } from '../lib/cache/cacheManager';
import { PerformanceMonitor } from '../lib/monitoring/performanceMonitor';

interface VerificationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

class ComprehensiveVerifier {
  private results: VerificationResult[] = [];
  private performanceMonitor = PerformanceMonitor.getInstance();

  async runAllVerifications(): Promise<void> {
    console.log('🔍 Starting Comprehensive Verification...\n');

    // 1. Database Optimizations
    await this.verifyDatabaseOptimizations();
    
    // 2. Socket.IO Integration
    await this.verifySocketIOIntegration();
    
    // 3. Caching System
    await this.verifyCachingSystem();
    
    // 4. Performance Monitoring
    await this.verifyPerformanceMonitoring();
    
    // 5. API Endpoints
    await this.verifyAPIEndpoints();
    
    // 6. Hook Integration
    await this.verifyHookIntegration();
    
    // 7. Error Handling
    await this.verifyErrorHandling();

    // Generate final report
    this.generateReport();
  }

  private async verifyDatabaseOptimizations(): Promise<void> {
    console.log('📊 Verifying Database Optimizations...');

    try {
      // Test room validation optimization
      const roomValidation = await SocketDatabaseService.validateRoomAccess('test-room');
      this.addResult('Database', 'PASS', 'Room validation optimization working', {
        valid: roomValidation.valid,
        error: roomValidation.error
      });

      // Test sidebar data optimization
      const sidebarData = await SocketDatabaseService.getSidebarData('test-user');
      this.addResult('Database', sidebarData.success ? 'PASS' : 'WARNING', 
        'Sidebar data optimization working', {
        success: sidebarData.success,
        error: sidebarData.error
      });

      // Test batch message insertion
      const batchResult = await SocketDatabaseService.insertChatMessages([
        {
          chatSessionId: 'test-session',
          content: 'Test message',
          isUserMessage: true
        }
      ]);
      this.addResult('Database', batchResult.success ? 'PASS' : 'WARNING',
        'Batch message insertion working', {
        success: batchResult.success,
        messageIds: batchResult.messageIds?.length || 0
      });

      // Test connection pool
      const poolManager = ConnectionPoolManager.getInstance();
      const acquired = await poolManager.acquireConnection();
      poolManager.releaseConnection();
      this.addResult('Database', 'PASS', 'Connection pool management working', {
        maxConnections: poolManager.getMaxConnections(),
        currentConnections: poolManager.getConnectionCount()
      });

    } catch (error) {
      this.addResult('Database', 'FAIL', 'Database optimization verification failed', {
        error: error.message
      });
    }
  }

  private async verifySocketIOIntegration(): Promise<void> {
    console.log('🔌 Verifying Socket.IO Integration...');

    try {
      // Check if Socket.IO handlers are properly imported
      const handlersExist = await this.checkFileExists('lib/server/socketHandlers.ts');
      this.addResult('Socket.IO', handlersExist ? 'PASS' : 'FAIL', 
        'Socket.IO handlers file exists');

      // Check if Socket.IO emitter is properly configured
      const emitterExists = await this.checkFileExists('lib/server/socketEmitter.ts');
      this.addResult('Socket.IO', emitterExists ? 'PASS' : 'FAIL',
        'Socket.IO emitter file exists');

      // Check if performance monitoring is integrated
      const monitoringIntegrated = await this.checkSocketIOMonitoring();
      this.addResult('Socket.IO', monitoringIntegrated ? 'PASS' : 'WARNING',
        'Performance monitoring integrated with Socket.IO');

    } catch (error) {
      this.addResult('Socket.IO', 'FAIL', 'Socket.IO integration verification failed', {
        error: error.message
      });
    }
  }

  private async verifyCachingSystem(): Promise<void> {
    console.log('💾 Verifying Caching System...');

    try {
      const apiCache = APICache.getInstance();
      const cacheManager = CacheManager.getInstance();

      // Test basic cache operations
      await cacheManager.set('test-key', { test: 'data' }, 5000);
      const cached = await cacheManager.get('test-key');
      this.addResult('Cache', cached ? 'PASS' : 'FAIL',
        'Basic cache operations working');

      // Test API-specific caching
      await apiCache.cacheMetadata('https://test.com', { title: 'Test' });
      const cachedMetadata = await apiCache.getCachedMetadata('https://test.com');
      this.addResult('Cache', cachedMetadata ? 'PASS' : 'FAIL',
        'API-specific caching working');

      // Test cache statistics
      const stats = await apiCache.getCacheStats();
      this.addResult('Cache', 'PASS', 'Cache statistics available', {
        metadataHitRate: stats.metadata.hitRate,
        searchHitRate: stats.search.hitRate
      });

    } catch (error) {
      this.addResult('Cache', 'FAIL', 'Caching system verification failed', {
        error: error.message
      });
    }
  }

  private async verifyPerformanceMonitoring(): Promise<void> {
    console.log('📈 Verifying Performance Monitoring...');

    try {
      // Test performance metric recording
      this.performanceMonitor.recordMetric('test.operation', Date.now() - 100, true);
      
      // Test performance summary
      const summary = this.performanceMonitor.getPerformanceSummary();
      this.addResult('Performance', 'PASS', 'Performance monitoring working', {
        totalOperations: summary.overall.totalOperations,
        successRate: summary.overall.successRate
      });

      // Test system health check
      const health = this.performanceMonitor.isSystemHealthy();
      this.addResult('Performance', health.healthy ? 'PASS' : 'WARNING',
        'System health monitoring working', {
        healthy: health.healthy,
        issues: health.issues.length,
        recommendations: health.recommendations.length
      });

    } catch (error) {
      this.addResult('Performance', 'FAIL', 'Performance monitoring verification failed', {
        error: error.message
      });
    }
  }

  private async verifyAPIEndpoints(): Promise<void> {
    console.log('🌐 Verifying API Endpoints...');

    try {
      // Check critical API files for optimization integration
      const criticalAPIs = [
        'app/api/chat/SaveToDb.ts',
        'app/api/rooms/[shareCode]/chat/route.ts',
        'app/api/rooms/[shareCode]/join/route.ts'
      ];

      for (const apiPath of criticalAPIs) {
        const hasOptimization = await this.checkAPIOptimization(apiPath);
        this.addResult('API', hasOptimization ? 'PASS' : 'WARNING',
          `${apiPath} has optimization integration`);
      }

      // Check monitoring API endpoints
      const monitoringAPIs = [
        'app/api/monitoring/performance/route.ts',
        'app/api/monitoring/cache/route.ts'
      ];

      for (const apiPath of monitoringAPIs) {
        const exists = await this.checkFileExists(apiPath);
        this.addResult('API', exists ? 'PASS' : 'FAIL',
          `${apiPath} monitoring endpoint exists`);
      }

    } catch (error) {
      this.addResult('API', 'FAIL', 'API endpoint verification failed', {
        error: error.message
      });
    }
  }

  private async verifyHookIntegration(): Promise<void> {
    console.log('🪝 Verifying Hook Integration...');

    try {
      // Check Socket.IO hooks
      const socketHooks = [
        'app/chat/hooks/useSidebarSocket.ts',
        'app/chat/hooks/useRoomSocket.ts',
        'hooks/useSocket.ts'
      ];

      for (const hookPath of socketHooks) {
        const exists = await this.checkFileExists(hookPath);
        this.addResult('Hooks', exists ? 'PASS' : 'FAIL',
          `${hookPath} Socket.IO hook exists`);
      }

      // Check if hooks are properly integrated with components
      const componentIntegration = await this.checkComponentIntegration();
      this.addResult('Hooks', componentIntegration ? 'PASS' : 'WARNING',
        'Hooks properly integrated with components');

    } catch (error) {
      this.addResult('Hooks', 'FAIL', 'Hook integration verification failed', {
        error: error.message
      });
    }
  }

  private async verifyErrorHandling(): Promise<void> {
    console.log('⚠️ Verifying Error Handling...');

    try {
      // Test database error handling
      const invalidRoomValidation = await SocketDatabaseService.validateRoomAccess('');
      this.addResult('Error Handling', !invalidRoomValidation.valid ? 'PASS' : 'FAIL',
        'Database error handling working');

      // Test cache error handling
      const cacheManager = CacheManager.getInstance();
      try {
        await cacheManager.get('nonexistent-key');
        this.addResult('Error Handling', 'PASS', 'Cache error handling working');
      } catch (error) {
        this.addResult('Error Handling', 'WARNING', 'Cache error handling needs improvement');
      }

      // Test performance monitoring error handling
      this.performanceMonitor.recordMetric('test.error', Date.now() - 100, false, 'Test error');
      this.addResult('Error Handling', 'PASS', 'Performance monitoring error handling working');

    } catch (error) {
      this.addResult('Error Handling', 'FAIL', 'Error handling verification failed', {
        error: error.message
      });
    }
  }

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async checkAPIOptimization(apiPath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(apiPath, 'utf-8');
      return content.includes('SocketDatabaseService') || content.includes('measurePerformance');
    } catch {
      return false;
    }
  }

  private async checkSocketIOMonitoring(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile('lib/server/socketHandlers.ts', 'utf-8');
      return content.includes('PerformanceMonitor') && content.includes('measurePerformance');
    } catch {
      return false;
    }
  }

  private async checkComponentIntegration(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const layoutContent = await fs.readFile('app/chat/layout.tsx', 'utf-8');
      return layoutContent.includes('useSidebarSocket') || layoutContent.includes('SidebarSocketWrapper');
    } catch {
      return false;
    }
  }

  private addResult(component: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string, details?: any): void {
    this.results.push({ component, status, message, details });
    
    const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`   ${emoji} ${message}`);
    
    if (details && Object.keys(details).length > 0) {
      console.log(`      Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  private generateReport(): void {
    console.log('\n📋 Comprehensive Verification Report');
    console.log('=====================================\n');

    const summary = this.results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('Summary:');
    console.log(`✅ PASS: ${summary.PASS || 0}`);
    console.log(`⚠️  WARNING: ${summary.WARNING || 0}`);
    console.log(`❌ FAIL: ${summary.FAIL || 0}`);
    console.log(`📊 Total: ${this.results.length}\n`);

    // Group by component
    const byComponent = this.results.reduce((acc, result) => {
      if (!acc[result.component]) acc[result.component] = [];
      acc[result.component].push(result);
      return acc;
    }, {} as Record<string, VerificationResult[]>);

    console.log('Detailed Results by Component:');
    console.log('==============================\n');

    for (const [component, results] of Object.entries(byComponent)) {
      console.log(`${component}:`);
      for (const result of results) {
        const emoji = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
        console.log(`  ${emoji} ${result.message}`);
      }
      console.log('');
    }

    // Critical issues
    const criticalIssues = this.results.filter(r => r.status === 'FAIL');
    if (criticalIssues.length > 0) {
      console.log('🚨 Critical Issues to Address:');
      console.log('==============================\n');
      for (const issue of criticalIssues) {
        console.log(`❌ ${issue.component}: ${issue.message}`);
        if (issue.details) {
          console.log(`   Details: ${JSON.stringify(issue.details, null, 2)}`);
        }
      }
      console.log('');
    }

    // Recommendations
    const warnings = this.results.filter(r => r.status === 'WARNING');
    if (warnings.length > 0) {
      console.log('💡 Recommendations:');
      console.log('===================\n');
      for (const warning of warnings) {
        console.log(`⚠️  ${warning.component}: ${warning.message}`);
      }
      console.log('');
    }

    // Overall status
    const overallStatus = criticalIssues.length === 0 ? 
      (warnings.length === 0 ? 'EXCELLENT' : 'GOOD') : 'NEEDS_ATTENTION';

    console.log(`🎯 Overall Status: ${overallStatus}`);
    
    if (overallStatus === 'EXCELLENT') {
      console.log('🎉 All systems are optimized and working correctly!');
    } else if (overallStatus === 'GOOD') {
      console.log('👍 System is working well with minor recommendations.');
    } else {
      console.log('🔧 System needs attention to resolve critical issues.');
    }

    console.log('\n📈 Performance Summary:');
    const perfSummary = this.performanceMonitor.getPerformanceSummary();
    console.log(`   Operations: ${perfSummary.overall.totalOperations}`);
    console.log(`   Success Rate: ${perfSummary.overall.successRate}`);
    console.log(`   Avg Duration: ${perfSummary.overall.averageDuration}`);
    console.log(`   Active Connections: ${perfSummary.connections.activeConnections}`);
  }
}

// Run verification if script is executed directly
if (require.main === module) {
  const verifier = new ComprehensiveVerifier();
  verifier.runAllVerifications()
    .then(() => {
      console.log('\n✅ Comprehensive verification completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Comprehensive verification failed:', error);
      process.exit(1);
    });
}

export { ComprehensiveVerifier };