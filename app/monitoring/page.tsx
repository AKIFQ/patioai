'use client';

import { useState, useEffect } from 'react';

interface DashboardData {
  timestamp: string;
  systemHealth: {
    status: string;
    issues: string[];
    uptime: number;
    memoryUsage: any;
  };
  metrics: {
    socket: {
      activeConnections: number;
      totalConnections: number;
      peakConnections: number;
      connectionsPerMinute: number;
      averageConnectionTime: number;
      connectionsByRoom: Record<string, number>;
      connectionsByUser: Record<string, number>;
    };
    errors: {
      totalErrors: number;
      recentErrors: number;
      errorRate: number;
      errorsByCategory: Record<string, number>;
      errorsByLevel: Record<string, number>;
    };
    performance: any;
  };
  alerts: Array<{
    type: string;
    category: string;
    message: string;
    timestamp: string;
  }>;
}

export default function MonitoringDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/monitoring/dashboard');
      if (!response.ok) throw new Error('Failed to fetch data');
      const dashboardData = await response.json();
      setData(dashboardData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'critical':
        return '🚨';
      default:
        return '⚪';
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatMemory = (bytes: number) => {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <span className="text-red-400 mr-2">⚠️</span>
            <div>
              <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900">System Monitoring Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.systemHealth.status)}`}>
            <span className="mr-2">{getStatusEmoji(data.systemHealth.status)}</span>
            {data.systemHealth.status.toUpperCase()}
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <span>🔄</span>
            Refresh
          </button>
        </div>
      </div>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 mb-2">System Status</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getStatusEmoji(data.systemHealth.status)}</span>
            <span className="text-2xl font-bold capitalize text-gray-900">
              {data.systemHealth.status}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 mb-2">Uptime</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatUptime(data.systemHealth.uptime)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 mb-2">Active Connections</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <span className="text-2xl font-bold text-gray-900">
              {data.metrics.socket.activeConnections}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 mb-2">Memory Usage</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatMemory(data.systemHealth.memoryUsage.heapUsed)}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Alerts</h2>
          <div className="space-y-3">
            {data.alerts.map((alert, index) => (
              <div key={index} className={`border rounded-md p-4 ${
                alert.type === 'critical' ? 'border-red-200 bg-red-50' :
                alert.type === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                'border-blue-200 bg-blue-50'
              }`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {alert.type === 'critical' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <span className="font-medium">{alert.message}</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
                    {alert.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Metrics */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button className="border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-blue-600">
              Connections
            </button>
            <button className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700">
              Errors
            </button>
            <button className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700">
              Performance
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Connection Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Connection Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Connections:</span>
                  <span className="font-semibold">{data.metrics.socket.totalConnections}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Peak Connections:</span>
                  <span className="font-semibold">{data.metrics.socket.peakConnections}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Connections/Min:</span>
                  <span className="font-semibold">{data.metrics.socket.connectionsPerMinute}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Connection Time:</span>
                  <span className="font-semibold">{Math.round(data.metrics.socket.averageConnectionTime)}s</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Connections by Room</h3>
              <div className="space-y-2 text-sm">
                {Object.entries(data.metrics.socket.connectionsByRoom).length > 0 ? 
                  Object.entries(data.metrics.socket.connectionsByRoom).map(([room, count]) => (
                    <div key={room} className="flex justify-between">
                      <span className="text-gray-600 truncate">{room}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  )) : 
                  <div className="text-gray-500 text-center py-4">No active rooms</div>
                }
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Error Statistics</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Errors:</span>
                  <span className="font-semibold">{data.metrics.errors.totalErrors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Recent Errors:</span>
                  <span className="font-semibold">{data.metrics.errors.recentErrors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Error Rate:</span>
                  <span className="font-semibold">{data.metrics.errors.errorRate}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}