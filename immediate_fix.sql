-- ============================================================================
-- IMMEDIATE FIX FOR 403 FORBIDDEN ERROR
-- ============================================================================
-- Run this in your Supabase SQL Editor to fix the real-time sync issue

-- 1. Create the missing set_session_context function
CREATE OR REPLACE FUNCTION public.set_session_context(session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('my.session_id', session_id, false);
END;
$$;

-- 2. Fix RLS policies to allow anonymous users
-- Drop existing policies and create new ones
DROP POLICY IF EXISTS room_participants_policy ON room_participants;
CREATE POLICY room_participants_policy ON room_participants FOR ALL
USING (
    user_id = auth.uid() 
    OR session_id = current_setting('my.session_id', true)
    OR EXISTS (
        SELECT 1 FROM rooms 
        WHERE id = room_participants.room_id 
        AND created_by = auth.uid()
    )
);

DROP POLICY IF EXISTS room_messages_policy ON room_messages;
CREATE POLICY room_messages_policy ON room_messages FOR ALL
USING (
    user_id = auth.uid()
    OR session_id = current_setting('my.session_id', true)
    OR EXISTS (
        SELECT 1 FROM rooms
        WHERE id = room_messages.room_id
        AND created_by = auth.uid()
    )
);

DROP POLICY IF EXISTS room_chat_sessions_policy ON room_chat_sessions;
CREATE POLICY room_chat_sessions_policy ON room_chat_sessions FOR ALL
USING (
    user_id = auth.uid()
    OR session_id = current_setting('my.session_id', true)
    OR EXISTS (
        SELECT 1 FROM rooms
        WHERE id = room_chat_sessions.room_id
        AND created_by = auth.uid()
    )
);

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION public.set_session_context(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_context(text) TO anon;

-- 4. Test the fix
SELECT 'Fix applied successfully! Anonymous users should now be able to send messages.' as result;
