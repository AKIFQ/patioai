'use client';

import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  messageCount: number;
  memoryUsage?: number;
  timestamp: number;
}

export function usePerformanceMonitor(componentName: string) {
  const renderStartTime = useRef<number>(0);
  const metricsRef = useRef<PerformanceMetrics[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isEnabledRef = useRef<boolean>(false);

  // Start performance measurement
  const startMeasurement = useCallback(() => {
    renderStartTime.current = performance.now();
  }, []);

  // End performance measurement
  const endMeasurement = useCallback((messageCount = 0) => {
    if (renderStartTime.current === 0) return; // No measurement started
    
    const renderTime = performance.now() - renderStartTime.current;
    renderStartTime.current = 0; // Reset
    
    // Only track if performance monitoring is enabled
    if (!isEnabledRef.current) return;
    
    const metrics: PerformanceMetrics = {
      renderTime,
      messageCount,
      timestamp: Date.now()
    };

    // Add memory usage if available and in development
    if (process.env.NODE_ENV === 'development' && 'memory' in performance) {
      try {
        metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
      } catch {
        // Ignore memory access errors
      }
    }

    metricsRef.current.push(metrics);

    // Keep only last 50 measurements (reduced from 100)
    if (metricsRef.current.length > 50) {
      metricsRef.current = metricsRef.current.slice(-50);
    }

    // Log slow renders only in development and if render time is significant
    if (process.env.NODE_ENV === 'development' && renderTime > 100) {
      console.warn(`Slow render detected in ${componentName}:`, {
        renderTime: `${renderTime.toFixed(2)}ms`,
        messageCount,
        timestamp: new Date().toISOString()
      });
    }
  }, [componentName]);

  // Get performance statistics
  const getStats = useCallback(() => {
    const metrics = metricsRef.current;
    if (metrics.length === 0) return null;

    const renderTimes = metrics.map(m => m.renderTime);
    const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    const maxRenderTime = Math.max(...renderTimes);
    const minRenderTime = Math.min(...renderTimes);

    return {
      componentName,
      measurements: metrics.length,
      avgRenderTime: Number(avgRenderTime.toFixed(2)),
      maxRenderTime: Number(maxRenderTime.toFixed(2)),
      minRenderTime: Number(minRenderTime.toFixed(2)),
      lastMeasurement: metrics[metrics.length - 1]
    };
  }, [componentName]);

  // Initialize monitoring state
  useEffect(() => {
    isEnabledRef.current = 
      process.env.NODE_ENV === 'development' || 
      process.env.NEXT_PUBLIC_ENABLE_PERF_LOGGING === 'true';
  }, []);

  // Report performance metrics periodically (only if enabled)
  useEffect(() => {
    if (!isEnabledRef.current) return;
    
    intervalRef.current = setInterval(() => {
      const stats = getStats();
      if (stats && stats.measurements > 5) { // Only log if we have meaningful data
        console.log(`Performance stats for ${componentName}:`, stats);
      }
    }, 60000); // Report every 60 seconds (reduced frequency)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [componentName, getStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      metricsRef.current = []; // Clear metrics to prevent memory leaks
    };
  }, []);

  return {
    startMeasurement,
    endMeasurement,
    getStats
  };
}