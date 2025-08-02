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
      // Silently handle auth errors for anonymous users
      return null;
    }
    return user;
  } catch (error) {
    // Suppress auth errors for anonymous users
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

// Check if user has existing chats or rooms
export const hasExistingContent = cache(async () => {
  const supabase = await createServerSupabaseClient();
  try {
    // First check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return false;
    }

    // Check for existing chat sessions
    const { data: chatSessions, error: chatError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (chatError) {
      console.error('Error checking chat sessions:', chatError);
    } else if (chatSessions && chatSessions.length > 0) {
      return true;
    }

    // Check for existing rooms (as creator)
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id')
      .eq('created_by', user.id)
      .limit(1);

    if (roomsError) {
      console.error('Error checking rooms:', roomsError);
    } else if (rooms && rooms.length > 0) {
      return true;
    }

    // Check for rooms where user is a participant
    const { data: participantRooms, error: participantError } = await supabase
      .from('room_participants')
      .select('room_id')
      .eq('user_id', user.id)
      .limit(1);

    if (participantError) {
      console.error('Error checking participant rooms:', participantError);
    } else if (participantRooms && participantRooms.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking existing content:', error);
    return false;
  }
});
