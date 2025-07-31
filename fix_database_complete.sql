-- Complete Database Fix Script
-- This will migrate from complex session-based to simple thread-based approach
-- Run this in your Supabase SQL Editor

BEGIN;

-- =============================================================================
-- 1. DISABLE RLS TEMPORARILY TO AVOID INFINITE RECURSION
-- =============================================================================
ALTER TABLE room_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_chat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. DROP ALL EXISTING RLS POLICIES (THEY'RE CAUSING INFINITE RECURSION)
-- =============================================================================
-- Room participants policies
DROP POLICY IF EXISTS "Participants can view room participants" ON room_participants;
DROP POLICY IF EXISTS "Participants can create room participants" ON room_participants;
DROP POLICY IF EXISTS "authenticated_users_can_view_participants" ON room_participants;
DROP POLICY IF EXISTS "session_users_can_view_participants" ON room_participants;
DROP POLICY IF EXISTS "authenticated_users_can_create_participants" ON room_participants;
DROP POLICY IF EXISTS "session_users_can_create_participants" ON room_participants;
DROP POLICY IF EXISTS "room_participants_policy" ON room_participants;

-- Room messages policies
DROP POLICY IF EXISTS "Participants can view room messages" ON room_messages;
DROP POLICY IF EXISTS "Participants can create room messages" ON room_messages;
DROP POLICY IF EXISTS "authenticated_users_can_view_messages" ON room_messages;
DROP POLICY IF EXISTS "session_users_can_view_messages" ON room_messages;
DROP POLICY IF EXISTS "authenticated_users_can_create_messages" ON room_messages;
DROP POLICY IF EXISTS "session_users_can_create_messages" ON room_messages;
DROP POLICY IF EXISTS "room_messages_policy" ON room_messages;

-- Room chat sessions policies
DROP POLICY IF EXISTS "Participants can view room chat sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "Participants can create room chat sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "authenticated_users_can_view_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "session_users_can_view_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "authenticated_users_can_create_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "session_users_can_create_sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "room_chat_sessions_policy" ON room_chat_sessions;

-- Rooms policies
DROP POLICY IF EXISTS "Users can view rooms" ON rooms;
DROP POLICY IF EXISTS "Users can create rooms" ON rooms;
DROP POLICY IF EXISTS "authenticated_users_can_view_rooms" ON rooms;
DROP POLICY IF EXISTS "authenticated_users_can_create_rooms" ON rooms;
DROP POLICY IF EXISTS "rooms_policy" ON rooms;

-- =============================================================================
-- 3. MIGRATE DATA FROM OLD STRUCTURE TO NEW THREAD-BASED STRUCTURE
-- =============================================================================
-- Ensure all room_messages have thread_id set
UPDATE room_messages 
SET thread_id = room_chat_session_id 
WHERE thread_id IS NULL AND room_chat_session_id IS NOT NULL;

-- For any messages that still don't have thread_id, generate new UUIDs
UPDATE room_messages 
SET thread_id = gen_random_uuid() 
WHERE thread_id IS NULL;

-- Make thread_id NOT NULL (it should be required)
ALTER TABLE room_messages ALTER COLUMN thread_id SET NOT NULL;

-- =============================================================================
-- 4. REMOVE OLD FOREIGN KEY CONSTRAINTS
-- =============================================================================
ALTER TABLE room_messages DROP CONSTRAINT IF EXISTS room_messages_session_fkey;

-- =============================================================================
-- 5. REMOVE OLD COLUMNS AND TABLES
-- =============================================================================
-- Remove the old room_chat_session_id column from room_messages
ALTER TABLE room_messages DROP COLUMN IF EXISTS room_chat_session_id;

-- Drop the entire room_chat_sessions table (no longer needed)
DROP TABLE IF EXISTS room_chat_sessions CASCADE;

-- =============================================================================
-- 6. CREATE SIMPLE, NON-RECURSIVE RLS POLICIES
-- =============================================================================

-- ROOMS: Simple policies for authenticated users
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_can_view_rooms" ON rooms
FOR SELECT USING (
    auth.uid() IS NOT NULL
);

CREATE POLICY "authenticated_users_can_create_rooms" ON rooms
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND created_by = auth.uid()
);

-- ROOM_PARTICIPANTS: Simple policies
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_view_participants" ON room_participants
FOR SELECT USING (true);

CREATE POLICY "anyone_can_join_room" ON room_participants
FOR INSERT WITH CHECK (true);

-- ROOM_MESSAGES: Simple policies for thread-based messages
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_view_messages" ON room_messages
FOR SELECT USING (true);

CREATE POLICY "anyone_can_create_messages" ON room_messages
FOR INSERT WITH CHECK (true);

-- =============================================================================
-- 7. CREATE OPTIMIZED INDEXES FOR THREAD-BASED QUERIES
-- =============================================================================
-- Index for fetching messages by room and thread
CREATE INDEX IF NOT EXISTS idx_room_messages_room_thread 
ON room_messages (room_id, thread_id, created_at);

-- Index for fetching latest messages per thread
CREATE INDEX IF NOT EXISTS idx_room_messages_thread_created 
ON room_messages (thread_id, created_at DESC);

-- =============================================================================
-- 8. ENABLE REALTIME FOR ROOM MESSAGES
-- =============================================================================
-- Enable realtime for room_messages so sidebar updates work
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;

-- =============================================================================
-- 9. CREATE HELPER FUNCTION FOR GETTING USER ROOMS
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_rooms_with_counts(user_id_param UUID)
RETURNS TABLE (
    room_id UUID,
    room_name TEXT,
    share_code TEXT,
    max_participants INTEGER,
    creator_tier VARCHAR,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    created_by UUID,
    participant_count BIGINT,
    is_creator BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as room_id,
        r.name as room_name,
        r.share_code,
        r.max_participants,
        r.creator_tier,
        r.expires_at,
        r.created_at,
        r.created_by,
        COUNT(rp.room_id) as participant_count,
        (r.created_by = user_id_param) as is_creator
    FROM rooms r
    LEFT JOIN room_participants rp ON r.id = rp.room_id
    WHERE r.created_by = user_id_param
       OR EXISTS (
           SELECT 1 FROM room_participants rp2 
           WHERE rp2.room_id = r.id 
           AND rp2.user_id = user_id_param
       )
    GROUP BY r.id, r.name, r.share_code, r.max_participants, r.creator_tier, 
             r.expires_at, r.created_at, r.created_by
    ORDER BY r.created_at DESC;
END;
$$;

COMMIT;

-- =============================================================================
-- 10. VERIFY THE MIGRATION
-- =============================================================================
-- Check that thread_id is properly set
SELECT 
    'VERIFICATION' as check_type,
    COUNT(*) as total_messages,
    COUNT(thread_id) as messages_with_thread_id,
    COUNT(DISTINCT thread_id) as unique_threads
FROM room_messages;

-- Check room structure
SELECT 
    'ROOM_STRUCTURE' as check_type,
    r.name as room_name,
    r.share_code,
    COUNT(DISTINCT rm.thread_id) as thread_count,
    COUNT(rm.id) as message_count
FROM rooms r
LEFT JOIN room_messages rm ON r.id = rm.room_id
GROUP BY r.id, r.name, r.share_code
ORDER BY r.created_at DESC;