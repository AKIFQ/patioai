// CRITICAL: Memory protection mechanisms to prevent OOM crashes
export class MemoryProtection {
  private static instance: MemoryProtection;
  private isEmergencyMode = false;
  private emergencyModeStart = 0;
  private protectionInterval: NodeJS.Timeout | null = null;
  
  // Emergency thresholds - more conservative
  private readonly EMERGENCY_THRESHOLD = 900; // 900MB - emergency mode
  private readonly CRITICAL_THRESHOLD = 768;  // 768MB - aggressive cleanup
  private readonly EMERGENCY_DURATION = 60000; // 1 minute emergency mode

  private constructor() {
    this.startProtectionMonitoring();
  }

  static getInstance(): MemoryProtection {
    if (!MemoryProtection.instance) {
      MemoryProtection.instance = new MemoryProtection();
    }
    return MemoryProtection.instance;
  }

  private startProtectionMonitoring() {
    // Very lightweight monitoring - every 30 seconds
    this.protectionInterval = setInterval(() => {
      this.checkEmergencyStatus();
    }, 30000);

console.log(' Memory Protection: Started emergency monitoring');
  }

  private checkEmergencyStatus() {
    try {
      const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
      
      if (heapUsedMB > this.EMERGENCY_THRESHOLD && !this.isEmergencyMode) {
        this.activateEmergencyMode();
      } else if (heapUsedMB < this.CRITICAL_THRESHOLD && this.isEmergencyMode) {
        const emergencyDuration = Date.now() - this.emergencyModeStart;
        if (emergencyDuration > this.EMERGENCY_DURATION) {
          this.deactivateEmergencyMode();
        }
      }
    } catch (error) {
      console.error('Memory protection check error:', error);
    }
  }

  private activateEmergencyMode() {
    this.isEmergencyMode = true;
    this.emergencyModeStart = Date.now();
    
console.error(' EMERGENCY: Activating memory protection mode!');
    
    try {
      // Immediate emergency cleanup
      this.emergencyCleanup();
      
      // Block new expensive operations
      this.blockExpensiveOperations();
      
    } catch (error) {
      console.error('Emergency mode activation failed:', error);
    }
  }

  private deactivateEmergencyMode() {
    this.isEmergencyMode = false;
    this.emergencyModeStart = 0;
    
console.log(' Memory protection: Emergency mode deactivated');
    
    // Re-enable operations
    this.enableOperations();
  }

  private emergencyCleanup() {
    try {
      // Force immediate garbage collection
      if (global.gc) {
        global.gc();
        console.log('🧹 Emergency GC triggered');
      }
      
      // Clean Socket.IO memory immediately
      const io = (global as any).__socketIO;
      if (io?.sockets?.sockets) {
        let cleaned = 0;
        for (const [socketId, socket] of io.sockets.sockets.entries()) {
          const socketAny = socket as any;
          if (!socketAny.connected) {
            try {
              socketAny.removeAllListeners();
              if (socketAny.currentThread) delete socketAny.currentThread;
              if (socketAny.isTyping !== undefined) delete socketAny.isTyping;
              cleaned++;
            } catch {}
          }
        }
        if (cleaned > 0) {
          console.log(`🧹 Emergency: Cleaned ${cleaned} disconnected sockets`);
        }
      }
      
      // Force another GC
      if (global.gc) {
        global.gc();
      }
      
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    }
  }

  private blockExpensiveOperations() {
    // Set global flag to block expensive operations
    (global as any).__MEMORY_EMERGENCY = true;
    
console.warn(' Blocking expensive operations due to memory pressure');
  }

  private enableOperations() {
    // Remove global block
    delete (global as any).__MEMORY_EMERGENCY;
    
console.log(' Re-enabled operations - memory stable');
  }

  // Public API for checking if operations should be blocked
  public shouldBlockOperation(): boolean {
    return this.isEmergencyMode || (global as any).__MEMORY_EMERGENCY === true;
  }

  public getStatus() {
    const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    return {
      emergencyMode: this.isEmergencyMode,
      currentMemoryMB: heapUsedMB,
      emergencyThreshold: this.EMERGENCY_THRESHOLD,
      criticalThreshold: this.CRITICAL_THRESHOLD,
      emergencyDuration: this.isEmergencyMode ? Date.now() - this.emergencyModeStart : 0,
      operationsBlocked: this.shouldBlockOperation()
    };
  }

  public cleanup() {
    if (this.protectionInterval) {
      clearInterval(this.protectionInterval);
      this.protectionInterval = null;
    }
    
    this.deactivateEmergencyMode();
console.log(' Memory Protection: Cleaned up');
  }
}

// Circuit breaker for memory-intensive operations
export function withMemoryProtection<T>(operation: () => Promise<T> | T, fallback?: T): Promise<T> | T {
  const protection = MemoryProtection.getInstance();
  
  if (protection.shouldBlockOperation()) {
console.warn(' Operation blocked due to memory pressure');
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error('Operation blocked due to memory pressure');
  }
  
  return operation();
}

// Export singleton
export const memoryProtection = MemoryProtection.getInstance();