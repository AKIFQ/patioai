interface MemoryObject {
  name: string;
  type: string;
  size: number;
  count: number;
  examples: any[];
  location: string;
}

export class MemoryProfiler {
  private static instance: MemoryProfiler;
  
  static getInstance(): MemoryProfiler {
    if (!MemoryProfiler.instance) {
      MemoryProfiler.instance = new MemoryProfiler();
    }
    return MemoryProfiler.instance;
  }

  // Analyze what's actually stored in memory
  analyzeMemoryUsage(): MemoryObject[] {
    const memoryObjects: MemoryObject[] = [];

    // 1. Check Socket.IO connections
    const socketConnections = this.analyzeSocketConnections();
    if (socketConnections.count > 0) {
      memoryObjects.push(socketConnections);
    }

    // 2. Check Alert System
    const alertData = this.analyzeAlertSystem();
    if (alertData.count > 0) {
      memoryObjects.push(alertData);
    }

    // 3. Check Event Listeners
    const eventListeners = this.analyzeEventListeners();
    if (eventListeners.count > 0) {
      memoryObjects.push(eventListeners);
    }

    // 4. Check Timers/Intervals
    const timers = this.analyzeTimers();
    if (timers.count > 0) {
      memoryObjects.push(timers);
    }

    // 5. Check Global Objects
    const globalObjects = this.analyzeGlobalObjects();
    if (globalObjects.count > 0) {
      memoryObjects.push(globalObjects);
    }

    // 6. Check Require Cache
    const requireCache = this.analyzeRequireCache();
    if (requireCache.count > 0) {
      memoryObjects.push(requireCache);
    }

    // 7. Check Performance Metrics
    const performanceData = this.analyzePerformanceData();
    if (performanceData.count > 0) {
      memoryObjects.push(performanceData);
    }

    return memoryObjects.sort((a, b) => b.size - a.size);
  }

  private analyzeSocketConnections(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      // Check if Socket.IO instance exists
      const { getSocketIOInstance } = require('../server/socketEmitter');
      const io = getSocketIOInstance();
      
      if (io) {
        const sockets = io.sockets.sockets;
        count = sockets.size;
        
        // Estimate size per socket connection
        const avgSocketSize = 50 * 1024; // ~50KB per socket (rough estimate)
        totalSize = count * avgSocketSize;

        // Get examples
        let exampleCount = 0;
        for (const [id, socket] of sockets) {
          if (exampleCount < 3) {
            examples.push({
              id,
              userId: (socket as any).userId || 'unknown',
              rooms: Array.from(socket.rooms),
              connected: socket.connected,
              handshake: {
                address: socket.handshake.address,
                time: socket.handshake.time
              }
            });
            exampleCount++;
          }
        }
      }
    } catch (error) {
      console.warn('Could not analyze socket connections:', error);
    }

    return {
      name: 'Socket.IO Connections',
      type: 'network',
      size: totalSize,
      count,
      examples,
      location: 'lib/server/socketEmitter.ts'
    };
  }

  private analyzeAlertSystem(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      const { alertSystem } = require('./alertSystem');
      const alerts = (alertSystem as any).alerts || [];
      const alertTimes = (alertSystem as any).lastAlertTimes || new Map();
      
      count = alerts.length + alertTimes.size;
      
      // Estimate size
      alerts.forEach((alert: any) => {
        totalSize += JSON.stringify(alert).length * 2; // UTF-16
      });
      
      alertTimes.forEach((time: Date, ruleId: string) => {
        totalSize += ruleId.length * 2 + 24; // string + Date object
      });

      // Get examples
      examples.push(
        ...alerts.slice(0, 3).map((alert: any) => ({
          id: alert.id,
          type: alert.type,
          message: alert.message.substring(0, 100),
          timestamp: alert.timestamp,
          resolved: alert.resolved
        }))
      );

    } catch (error) {
      console.warn('Could not analyze alert system:', error);
    }

    return {
      name: 'Alert System Data',
      type: 'monitoring',
      size: totalSize,
      count,
      examples,
      location: 'lib/monitoring/alertSystem.ts'
    };
  }

  private analyzeEventListeners(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      // Check process event listeners
      const processEvents = process.eventNames();
      processEvents.forEach(eventName => {
        const listeners = process.listeners(eventName);
        count += listeners.length;
        totalSize += listeners.length * 1024; // Rough estimate per listener
        
        if (examples.length < 5) {
          examples.push({
            event: eventName,
            listenerCount: listeners.length,
            location: 'process'
          });
        }
      });

      // Check Socket.IO event listeners
      const { getSocketIOInstance } = require('../server/socketEmitter');
      const io = getSocketIOInstance();
      
      if (io) {
        const sockets = io.sockets.sockets;
        for (const [id, socket] of sockets) {
          const socketEvents = (socket as any).eventNames?.() || [];
          socketEvents.forEach((eventName: string) => {
            const listeners = (socket as any).listeners?.(eventName) || [];
            count += listeners.length;
            totalSize += listeners.length * 512; // Smaller estimate per socket listener
          });
          
          if (examples.length < 10 && socketEvents.length > 0) {
            examples.push({
              socketId: id,
              events: socketEvents,
              totalListeners: socketEvents.reduce((sum: number, event: string) => {
                return sum + ((socket as any).listeners?.(event)?.length || 0);
              }, 0),
              location: 'socket'
            });
          }
        }
      }

    } catch (error) {
      console.warn('Could not analyze event listeners:', error);
    }

    return {
      name: 'Event Listeners',
      type: 'events',
      size: totalSize,
      count,
      examples,
      location: 'Various (process, sockets)'
    };
  }

  private analyzeTimers(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      // Get active handles (includes timers)
      const activeHandles = (process as any)._getActiveHandles?.() || [];
      const activeRequests = (process as any)._getActiveRequests?.() || [];
      
      count = activeHandles.length + activeRequests.length;
      totalSize = count * 256; // Rough estimate per handle/request

      // Analyze handles
      activeHandles.slice(0, 5).forEach((handle: any, index: number) => {
        examples.push({
          type: 'handle',
          index,
          constructor: handle.constructor?.name || 'unknown',
          hasRef: handle.hasRef?.() || false
        });
      });

      // Analyze requests
      activeRequests.slice(0, 3).forEach((request: any, index: number) => {
        examples.push({
          type: 'request',
          index,
          constructor: request.constructor?.name || 'unknown'
        });
      });

    } catch (error) {
      console.warn('Could not analyze timers:', error);
    }

    return {
      name: 'Timers & Handles',
      type: 'system',
      size: totalSize,
      count,
      examples,
      location: 'Node.js internals'
    };
  }

  private analyzeGlobalObjects(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      // Check global object properties
      const globalKeys = Object.keys(global);
      count = globalKeys.length;

      globalKeys.forEach(key => {
        try {
          const value = (global as any)[key];
          if (value && typeof value === 'object') {
            const jsonStr = JSON.stringify(value, null, 0);
            if (jsonStr && jsonStr.length > 1000) { // Only count large objects
              totalSize += jsonStr.length * 2;
              
              if (examples.length < 5) {
                examples.push({
                  key,
                  type: typeof value,
                  constructor: value.constructor?.name || 'unknown',
                  size: jsonStr.length,
                  isArray: Array.isArray(value),
                  length: Array.isArray(value) ? value.length : Object.keys(value).length
                });
              }
            }
          }
        } catch (error) {
          // Skip circular references or non-serializable objects
        }
      });

    } catch (error) {
      console.warn('Could not analyze global objects:', error);
    }

    return {
      name: 'Global Objects',
      type: 'global',
      size: totalSize,
      count,
      examples,
      location: 'global namespace'
    };
  }

  private analyzeRequireCache(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      const cacheKeys = Object.keys(require.cache);
      count = cacheKeys.length;

      // Estimate size of require cache
      cacheKeys.forEach(key => {
        totalSize += key.length * 2; // Key size
        totalSize += 1024; // Rough estimate for cached module
      });

      // Get examples of largest modules
      const modulesBySize = cacheKeys
        .map(key => ({
          path: key,
          size: key.length + 1024,
          isNodeModule: key.includes('node_modules'),
          isUserModule: !key.includes('node_modules')
        }))
        .sort((a, b) => b.size - a.size);

      examples.push(...modulesBySize.slice(0, 5));

    } catch (error) {
      console.warn('Could not analyze require cache:', error);
    }

    return {
      name: 'Require Cache',
      type: 'modules',
      size: totalSize,
      count,
      examples,
      location: 'require.cache'
    };
  }

  private analyzePerformanceData(): MemoryObject {
    let totalSize = 0;
    let count = 0;
    const examples: any[] = [];

    try {
      // Check if performance monitor exists
      const { PerformanceMonitor } = require('./performanceMonitor');
      const perfMonitor = PerformanceMonitor.getInstance();
      
      if (perfMonitor) {
        const summary = perfMonitor.getPerformanceSummary();
        
        // Estimate size of performance data
        const summaryStr = JSON.stringify(summary);
        totalSize = summaryStr.length * 2;
        count = Object.keys(summary).length;

        examples.push({
          type: 'performance_summary',
          keys: Object.keys(summary),
          dataSize: summaryStr.length,
          sampleData: Object.entries(summary).slice(0, 3)
        });
      }

    } catch (error) {
      console.warn('Could not analyze performance data:', error);
    }

    return {
      name: 'Performance Data',
      type: 'monitoring',
      size: totalSize,
      count,
      examples,
      location: 'lib/monitoring/performanceMonitor.ts'
    };
  }

  // Generate a detailed memory report
  generateMemoryReport(): string {
    const memoryObjects = this.analyzeMemoryUsage();
    const totalAnalyzedSize = memoryObjects.reduce((sum, obj) => sum + obj.size, 0);
    const currentMemory = process.memoryUsage();

    let report = '\n🔍 DETAILED MEMORY ANALYSIS\n';
    report += '='.repeat(50) + '\n\n';

    report += `📊 Current Memory Usage:\n`;
    report += `   Heap Used: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB\n`;
    report += `   Heap Total: ${Math.round(currentMemory.heapTotal / 1024 / 1024)}MB\n`;
    report += `   RSS: ${Math.round(currentMemory.rss / 1024 / 1024)}MB\n`;
    report += `   External: ${Math.round(currentMemory.external / 1024 / 1024)}MB\n\n`;

    report += `🔍 Analyzed Objects (${Math.round(totalAnalyzedSize / 1024 / 1024)}MB total):\n\n`;

    memoryObjects.forEach((obj, index) => {
      const sizeMB = Math.round(obj.size / 1024 / 1024 * 100) / 100;
      const sizeKB = Math.round(obj.size / 1024);
      
      report += `${index + 1}. ${obj.name}\n`;
      report += `   📍 Location: ${obj.location}\n`;
      report += `   📊 Size: ${sizeMB > 1 ? `${sizeMB}MB` : `${sizeKB}KB`}\n`;
      report += `   🔢 Count: ${obj.count} items\n`;
      report += `   📝 Type: ${obj.type}\n`;
      
      if (obj.examples.length > 0) {
        report += `   🔍 Examples:\n`;
        obj.examples.forEach((example, i) => {
          report += `      ${i + 1}. ${JSON.stringify(example, null, 2).substring(0, 200)}...\n`;
        });
      }
      report += '\n';
    });

    // Add recommendations
    report += '💡 MEMORY OPTIMIZATION RECOMMENDATIONS:\n';
    report += '-'.repeat(40) + '\n';

    memoryObjects.forEach((obj, index) => {
      if (obj.size > 10 * 1024 * 1024) { // > 10MB
        report += `🚨 HIGH PRIORITY - ${obj.name}:\n`;
        switch (obj.type) {
          case 'network':
            report += `   • Implement connection pooling and cleanup\n`;
            report += `   • Add connection timeouts and limits\n`;
            break;
          case 'monitoring':
            report += `   • Reduce data retention period\n`;
            report += `   • Implement data rotation/cleanup\n`;
            break;
          case 'events':
            report += `   • Remove unused event listeners\n`;
            report += `   • Implement proper cleanup on disconnect\n`;
            break;
          case 'modules':
            report += `   • Clear unused modules from cache\n`;
            report += `   • Use dynamic imports for large modules\n`;
            break;
        }
        report += '\n';
      }
    });

    return report;
  }

  // Log memory report to console
  logMemoryReport(): void {
    console.log(this.generateMemoryReport());
  }
}

export const memoryProfiler = MemoryProfiler.getInstance();
export default memoryProfiler;