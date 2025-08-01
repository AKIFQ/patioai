import { createBrowserClient } from '@supabase/ssr';
import { type Database } from '@/types/database';

// Create a singleton Supabase client to prevent multiple GoTrueClient instances
let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

// Create a Supabase client for browser-side operations. This can be used to interact with Supabase from the client-side. It is very importatnt
// that you enable RLS on your tables to ensure that your client-side operations are secure. Ideally, you would only enablle Read access on your client-side operations.
export function createClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error('Missing env variables');
  }

  // Return existing client if it exists
  if (supabaseClient) {
    return supabaseClient;
  }

  // Create new client with optimized realtime configuration for background tabs
  supabaseClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      realtime: {
        params: {
          eventsPerSecond: 10
        },
        // Shorter heartbeat for better background detection
        heartbeatIntervalMs: 15000,
        // More aggressive reconnection for background tabs
        reconnectAfterMs: (tries: number) => Math.min(tries * 500, 5000),
        // Enable background sync
        enableBackgroundSync: true,
        // Longer timeout before giving up
        timeout: 20000
      }
    }
  );

  return supabaseClient;
}
