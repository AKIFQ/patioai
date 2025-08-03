'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';

interface MemoryObject {
  name: string;
  type: string;
  sizeMB: number;
  sizeKB: number;
  count: number;
  location: string;
  examples: any[];
}

interface MemoryStats {
  current: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
  };
  status: 'healthy' | 'warning' | 'critical';
  recommendation: string;
  uptime: number;
  pid: number;
  nodeVersion: string;
  isCritical: boolean;
  isHigh: boolean;
  detailed?: {
    objects: MemoryObject[];
    report: string;
  };
}

export default function MemoryDashboard() {
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDetailed, setShowDetailed] = useState(false);

  const fetchMemoryStats = async (detailed = false) => {
    try {
      const url = detailed ? '/api/admin/memory?detailed=true' : '/api/admin/memory';
      const response = await fetch(url);
      const data = await response.json();
      setMemoryStats(data);
    } catch (error) {
      console.error('Failed to fetch memory stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (action: string) => {
    setActionLoading(action);
    try {
      const response = await fetch('/api/admin/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      
      const result = await response.json();
      console.log(`${action} result:`, result);
      
      // Refresh stats after action
      setTimeout(fetchMemoryStats, 1000);
    } catch (error) {
      console.error(`Failed to perform ${action}:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchMemoryStats();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchMemoryStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-8">Loading memory stats...</div>;
  }

  if (!memoryStats) {
    return <div className="p-8">Failed to load memory stats</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100';
      case 'warning': return 'bg-yellow-100';
      case 'critical': return 'bg-red-100';
      default: return 'bg-gray-100';
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Memory Dashboard</h1>
      
      {/* Status Overview */}
      <Card className={`mb-6 ${getStatusBg(memoryStats.status)}`}>
        <CardHeader>
          <CardTitle className={`text-xl ${getStatusColor(memoryStats.status)}`}>
            Memory Status: {memoryStats.status.toUpperCase()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg mb-2">
            <strong>Heap Used:</strong> {memoryStats.current.heapUsed}MB
          </p>
          <p className="text-sm text-gray-600">
            {memoryStats.recommendation}
          </p>
        </CardContent>
      </Card>

      {/* Memory Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Heap Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Used:</span>
                <span className="font-mono">{memoryStats.current.heapUsed}MB</span>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-mono">{memoryStats.current.heapTotal}MB</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    memoryStats.isCritical ? 'bg-red-500' : 
                    memoryStats.isHigh ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ 
                    width: `${Math.min((memoryStats.current.heapUsed / memoryStats.current.heapTotal) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>RSS:</span>
                <span className="font-mono">{memoryStats.current.rss}MB</span>
              </div>
              <div className="flex justify-between">
                <span>External:</span>
                <span className="font-mono">{memoryStats.current.external}MB</span>
              </div>
              <div className="flex justify-between">
                <span>Array Buffers:</span>
                <span className="font-mono">{memoryStats.current.arrayBuffers}MB</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Process Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Uptime:</span>
                <span className="font-mono">{Math.floor(memoryStats.uptime / 60)}m {memoryStats.uptime % 60}s</span>
              </div>
              <div className="flex justify-between">
                <span>PID:</span>
                <span className="font-mono">{memoryStats.pid}</span>
              </div>
              <div className="flex justify-between">
                <span>Node:</span>
                <span className="font-mono">{memoryStats.nodeVersion}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Memory Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <Button
              onClick={() => performAction('gc')}
              disabled={actionLoading === 'gc'}
              variant="outline"
            >
              {actionLoading === 'gc' ? 'Running...' : 'Force Garbage Collection'}
            </Button>
            
            <Button
              onClick={() => performAction('safe-cleanup')}
              disabled={actionLoading === 'safe-cleanup'}
              variant="default"
            >
              {actionLoading === 'safe-cleanup' ? 'Running...' : 'Safe Cleanup (Recommended)'}
            </Button>

            <Button
              onClick={() => performAction('emergency-safe-cleanup')}
              disabled={actionLoading === 'emergency-safe-cleanup'}
              variant="destructive"
            >
              {actionLoading === 'emergency-safe-cleanup' ? 'Running...' : 'Emergency Safe Cleanup'}
            </Button>

            <Button
              onClick={() => performAction('emergency-cleanup')}
              disabled={actionLoading === 'emergency-cleanup'}
              variant="destructive"
              className="opacity-50"
            >
              {actionLoading === 'emergency-cleanup' ? 'Running...' : 'Legacy Emergency Cleanup'}
            </Button>
            
            <Button
              onClick={() => fetchMemoryStats(false)}
              variant="secondary"
            >
              Refresh Stats
            </Button>

            <Button
              onClick={() => performAction('analyze')}
              disabled={actionLoading === 'analyze'}
              variant="outline"
            >
              {actionLoading === 'analyze' ? 'Analyzing...' : 'Detailed Analysis'}
            </Button>

            <Button
              onClick={() => {
                setShowDetailed(!showDetailed);
                if (!showDetailed && !memoryStats?.detailed) {
                  fetchMemoryStats(true);
                }
              }}
              variant="outline"
            >
              {showDetailed ? 'Hide Details' : 'Show Details'}
            </Button>
          </div>
          
          <div className="mt-4 space-y-3">
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">✅ Safe Cleanup</h4>
              <p className="text-sm text-green-700">
                <strong>Recommended:</strong> Only removes monitoring data (alerts, performance metrics, disconnected sockets). 
                <strong>Never touches user data, chats, or active connections.</strong>
              </p>
            </div>
            
            <div className="p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Emergency Safe Cleanup</h4>
              <p className="text-sm text-yellow-700">
                More aggressive cleanup but still safe. Only removes system/monitoring data.
                Use when memory is critical but you want to preserve all user data.
              </p>
            </div>

            <div className="p-4 bg-red-50 rounded-lg">
              <h4 className="font-semibold text-red-800 mb-2">🚨 Legacy Emergency Cleanup</h4>
              <p className="text-sm text-red-700">
                Old cleanup method - may affect system stability. Use safe cleanup instead.
                Consider restarting the application if memory issues persist.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Memory Analysis */}
      {showDetailed && memoryStats?.detailed && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>🔍 Detailed Memory Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Memory Objects Table */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Memory Objects by Size</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">Object</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Type</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Size</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Count</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memoryStats.detailed.objects.map((obj, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="border border-gray-300 px-4 py-2 font-medium">
                            {obj.name}
                          </td>
                          <td className="border border-gray-300 px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              obj.type === 'network' ? 'bg-blue-100 text-blue-800' :
                              obj.type === 'monitoring' ? 'bg-yellow-100 text-yellow-800' :
                              obj.type === 'events' ? 'bg-green-100 text-green-800' :
                              obj.type === 'system' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {obj.type}
                            </span>
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                            {obj.sizeMB > 1 ? `${obj.sizeMB}MB` : `${obj.sizeKB}KB`}
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                            {obj.count.toLocaleString()}
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-sm text-gray-600">
                            {obj.location}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Examples for largest objects */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Examples from Largest Objects</h3>
                <div className="space-y-4">
                  {memoryStats.detailed.objects.slice(0, 3).map((obj, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h4 className="font-medium text-lg mb-2">{obj.name}</h4>
                      <p className="text-sm text-gray-600 mb-2">
                        📍 {obj.location} • 📊 {obj.sizeMB > 1 ? `${obj.sizeMB}MB` : `${obj.sizeKB}KB`} • 🔢 {obj.count} items
                      </p>
                      {obj.examples.length > 0 && (
                        <div className="bg-gray-100 rounded p-3">
                          <p className="text-sm font-medium mb-2">Sample Data:</p>
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify(obj.examples[0], null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Full Report */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Full Analysis Report</h3>
                <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{memoryStats.detailed.report}</pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}