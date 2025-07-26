import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/server/server';

// React Cache: https://react.dev/reference/react/cache
//This memoizes/dedupes the request
// if it is called multiple times in the same request.
export const getSession = cache(async () => {
  const supabase = await createServerSupabaseClient();
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Auth Error:', error);
      return null;
    }
    return user;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
});

//This memoizes/dedupes the request
// if it is called multiple times in the same request.
export const getUserInfo = cache(async () => {
  const supabase = await createServerSupabaseClient();
  try {
    // First check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return null;
    }

    // Then get user info from users table
    const { data, error } = await supabase
      .from('users')
      .select('full_name, email, id')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Supabase Error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
});
