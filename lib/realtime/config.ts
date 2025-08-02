// Realtime configuration for different scales
export const REALTIME_CONFIG = {
  // Use Supabase for small scale (< 100 concurrent users)
  provider: process.env.NEXT_PUBLIC_REALTIME_PROVIDER || 'supabase', // 'supabase' | 'websocket' | 'pusher'
  
  // Supabase Realtime settings
  supabase: {
    maxConnections: 200,
    heartbeatInterval: 15000,
    reconnectDelay: 2000,
  },
  
  // Custom WebSocket server settings (for 1000+ users)
  websocket: {
    url: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8080',
    maxConnections: 10000,
    heartbeatInterval: 30000,
    reconnectDelay: 1000,
  },
  
  // Pusher settings (alternative for medium scale)
  pusher: {
    key: process.env.NEXT_PUBLIC_PUSHER_KEY,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2',
    maxConnections: 1000,
  }
};

// Determine which provider to use based on expected load
export function getOptimalProvider(expectedUsers: number): string {
  if (expectedUsers > 500) {
    return 'websocket'; // Custom WebSocket server
  } else if (expectedUsers > 100) {
    return 'pusher'; // Pusher for medium scale
  } else {
    return 'supabase'; // Supabase for small scale
  }
}