import { alertSystem } from './alertSystem';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryHistory: MemoryStats[] = [];
  private readonly MAX_HISTORY = 100; // Keep last 100 readings
  private readonly CRITICAL_THRESHOLD = 1000 * 1024 * 1024; // 1GB
  private readonly WARNING_THRESHOLD = 500 * 1024 * 1024; // 500MB

  private constructor() {
    this.startMonitoring();
  }

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  private startMonitoring() {
    // Monitor memory every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30 * 1000);

    console.log('🔍 Memory monitoring started');
  }

  private checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    
    const stats: MemoryStats = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };

    // Add to history
    this.memoryHistory.push(stats);
    
    // Keep only recent history
    if (this.memoryHistory.length > this.MAX_HISTORY) {
      this.memoryHistory = this.memoryHistory.slice(-this.MAX_HISTORY);
    }

    // Check for memory issues
    this.analyzeMemoryTrends(stats);

    // Force garbage collection if memory is high and gc is available
    if (stats.heapUsed > this.WARNING_THRESHOLD && global.gc) {
      try {
        const beforeGC = process.memoryUsage().heapUsed;
        global.gc();
        const afterGC = process.memoryUsage().heapUsed;
        const freed = beforeGC - afterGC;
        
        if (freed > 10 * 1024 * 1024) { // Only log if freed > 10MB
          console.log(`🧹 GC freed ${Math.round(freed / 1024 / 1024)}MB memory`);
        }
      } catch (error) {
        console.warn('Failed to run garbage collection:', error);
      }
    }
  }

  private analyzeMemoryTrends(currentStats: MemoryStats) {
    if (this.memoryHistory.length < 5) return; // Need some history

    const recent = this.memoryHistory.slice(-5);
    const trend = this.calculateTrend(recent.map(s => s.heapUsed));
    
    // Check for rapid memory growth
    if (trend > 50 * 1024 * 1024) { // Growing by 50MB+ over 5 readings
      console.warn(`⚠️ Rapid memory growth detected: +${Math.round(trend / 1024 / 1024)}MB trend`);
      
      // Log top memory consumers
      this.logMemoryConsumers();
    }

    // Check for memory leaks (consistent growth over time)
    if (this.memoryHistory.length >= 20) {
      const longTrend = this.calculateTrend(
        this.memoryHistory.slice(-20).map(s => s.heapUsed)
      );
      
      if (longTrend > 100 * 1024 * 1024) { // Growing by 100MB+ over 20 readings
        console.error(`🚨 Potential memory leak detected: +${Math.round(longTrend / 1024 / 1024)}MB over 20 readings`);
        this.suggestMemoryOptimizations();
      }
    }
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const first = values[0];
    const last = values[values.length - 1];
    return last - first;
  }

  private logMemoryConsumers() {
    console.log('📊 Memory Analysis:');
    const memUsage = process.memoryUsage();
    
    console.log(`  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.log(`  RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
    console.log(`  External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
    console.log(`  Array Buffers: ${Math.round(memUsage.arrayBuffers / 1024 / 1024)}MB`);
    
    // Log process info
    console.log(`  Uptime: ${Math.round(process.uptime())}s`);
    console.log(`  PID: ${process.pid}`);
  }

  private suggestMemoryOptimizations() {
    console.log('💡 Memory Optimization Suggestions:');
    console.log('  1. Check for unclosed database connections');
    console.log('  2. Review Socket.IO event listener cleanup');
    console.log('  3. Clear old cache entries');
    console.log('  4. Check for circular references');
    console.log('  5. Consider restarting the application');
  }

  // Public methods
  getCurrentStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };
  }

  getMemoryHistory(): MemoryStats[] {
    return [...this.memoryHistory];
  }

  isMemoryCritical(): boolean {
    const current = this.getCurrentStats();
    return current.heapUsed > this.CRITICAL_THRESHOLD;
  }

  isMemoryHigh(): boolean {
    const current = this.getCurrentStats();
    return current.heapUsed > this.WARNING_THRESHOLD;
  }

  forceGarbageCollection(): boolean {
    if (!global.gc) {
      console.warn('Garbage collection not available. Start Node.js with --expose-gc flag.');
      return false;
    }

    try {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = before - after;
      
      console.log(`🧹 Manual GC freed ${Math.round(freed / 1024 / 1024)}MB memory`);
      return true;
    } catch (error) {
      console.error('Failed to run garbage collection:', error);
      return false;
    }
  }

  cleanup() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.memoryHistory = [];
    console.log('🧹 Memory monitor cleanup completed');
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();
export default memoryMonitor;