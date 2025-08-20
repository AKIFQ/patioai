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

  // Start performance measurement
  const startMeasurement = useCallback(() => {
    renderStartTime.current = performance.now();
  }, []);

  // End performance measurement
  const endMeasurement = useCallback((messageCount = 0) => {
    const renderTime = performance.now() - renderStartTime.current;
    
    const metrics: PerformanceMetrics = {
      renderTime,
      messageCount,
      timestamp: Date.now()
    };

    // Add memory usage if available
    if ('memory' in performance) {
      metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }

    metricsRef.current.push(metrics);

    // Keep only last 100 measurements
    if (metricsRef.current.length > 100) {
      metricsRef.current = metricsRef.current.slice(-100);
    }

    // Log slow renders in development
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

  // Report performance metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = getStats();
      if (stats && stats.measurements > 0) {
        // Only log in development or if explicitly enabled
        if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_PERF_LOGGING === 'true') {
          console.log(`Performance stats for ${componentName}:`, stats);
        }
      }
    }, 30000); // Report every 30 seconds

    return () => clearInterval(interval);
  }, [componentName, getStats]);

  return {
    startMeasurement,
    endMeasurement,
    getStats
  };
}