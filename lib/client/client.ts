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

  // Create new client with proper realtime configuration
  supabaseClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      realtime: {
        params: {
          eventsPerSecond: 10
        },
        heartbeatIntervalMs: 30000,
        reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 10000)
      }
    }
  );

  return supabaseClient;
}
