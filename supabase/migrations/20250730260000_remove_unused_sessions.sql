-- Remove unused room_chat_sessions table and related code
-- We've migrated to thread-based approach using thread_id in room_messages

BEGIN;

-- Drop all policies for room_chat_sessions
DROP POLICY IF EXISTS "authenticated_users_can_view_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "session_users_can_view_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "authenticated_users_can_create_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "session_users_can_create_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "Participants can create room chat sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "Participants can view room chat sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "room_chat_sessions_policy" ON room_chat_sessions;

-- Drop the table (this will also drop all indexes and constraints)
DROP TABLE IF EXISTS room_chat_sessions CASCADE;

-- Remove any remaining references to room_chat_session_id column in room_messages
-- (This column should already be migrated to thread_id, but let's clean up if it still exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'room_messages' 
        AND column_name = 'room_chat_session_id'
    ) THEN
        -- First ensure all data is migrated to thread_id
        UPDATE room_messages 
        SET thread_id = room_chat_session_id 
        WHERE thread_id IS NULL AND room_chat_session_id IS NOT NULL;
        
        -- Drop the old column
        ALTER TABLE room_messages DROP COLUMN room_chat_session_id;
        
        RAISE NOTICE 'Removed room_chat_session_id column from room_messages';
    END IF;
END $$;

COMMIT;