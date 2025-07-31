-- Fix RLS Infinite Recursion and Simplify Policies
-- This addresses the specific issues found in your current RLS setup

BEGIN;

-- =============================================================================
-- 1. TEMPORARILY DISABLE RLS TO AVOID RECURSION DURING CLEANUP
-- =============================================================================
ALTER TABLE room_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_chat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. DROP ALL CONFLICTING ROOM-RELATED POLICIES
-- =============================================================================

-- Drop room_participants policies (multiple conflicting ones)
DROP POLICY IF EXISTS "Authenticated users can join available rooms" ON room_participants;
DROP POLICY IF EXISTS "Users can leave or be removed by creator" ON room_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON room_participants;
DROP POLICY IF EXISTS "Users can view room participants for accessible rooms" ON room_participants;

-- Drop room_messages policies (conflicting SELECT policies causing recursion)
DROP POLICY IF EXISTS "Simple create access for room messages" ON room_messages;
DROP POLICY IF EXISTS "Simple read access for room messages" ON room_messages;
DROP POLICY IF EXISTS "Users can view room messages for accessible rooms" ON room_messages;

-- Drop room_chat_sessions policies (old system)
DROP POLICY IF EXISTS "Participants can update own chat sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "Users can view room chat sessions for accessible rooms" ON room_chat_sessions;

-- Keep rooms policies as they're simple and working

-- =============================================================================
-- 3. MIGRATE REMAINING DATA TO THREAD-BASED APPROACH
-- =============================================================================

-- Ensure all room_messages have thread_id
UPDATE room_messages 
SET thread_id = COALESCE(thread_id, room_chat_session_id, gen_random_uuid())
WHERE thread_id IS NULL;

-- Make thread_id NOT NULL
ALTER TABLE room_messages ALTER COLUMN thread_id SET NOT NULL;

-- =============================================================================
-- 4. CREATE SIMPLE, NON-RECURSIVE POLICIES
-- =============================================================================

-- ROOM_PARTICIPANTS: Ultra-simple policies
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can view participants (needed for room functionality)
CREATE POLICY "public_read_participants" ON room_participants
FOR SELECT USING (true);

-- Anyone can join rooms (we'll handle limits in application logic)
CREATE POLICY "public_join_rooms" ON room_participants
FOR INSERT WITH CHECK (true);

-- Users can leave rooms they joined
CREATE POLICY "users_can_leave" ON room_participants
FOR DELETE USING (
    user_id = auth.uid() OR session_id = current_setting('app.session_id', true)
);

-- ROOM_MESSAGES: Ultra-simple policies for thread-based approach
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read messages (needed for room chat functionality)
CREATE POLICY "public_read_messages" ON room_messages
FOR SELECT USING (true);

-- Anyone can create messages (we'll validate in application)
CREATE POLICY "public_create_messages" ON room_messages
FOR INSERT WITH CHECK (true);

-- ROOMS: Keep existing simple policies (they work fine)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. CLEAN UP OLD SYSTEM COMPLETELY
-- =============================================================================

-- Remove foreign key constraint to old system
ALTER TABLE room_messages DROP CONSTRAINT IF EXISTS room_messages_session_fkey;

-- Remove old column
ALTER TABLE room_messages DROP COLUMN IF EXISTS room_chat_session_id;

-- Drop old table completely
DROP TABLE IF EXISTS room_chat_sessions CASCADE;

-- =============================================================================
-- 6. CREATE OPTIMIZED INDEXES FOR NEW STRUCTURE
-- =============================================================================

-- Index for thread-based queries
CREATE INDEX IF NOT EXISTS idx_room_messages_thread_time 
ON room_messages (room_id, thread_id, created_at);

-- Index for latest messages per thread
CREATE INDEX IF NOT EXISTS idx_room_messages_thread_latest 
ON room_messages (thread_id, created_at DESC);

-- =============================================================================
-- 7. ENABLE REALTIME FOR LIVE UPDATES (IF NOT ALREADY ENABLED)
-- =============================================================================
DO $$
BEGIN
    -- Add room_messages to realtime if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'room_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
    END IF;
    
    -- Add room_participants to realtime if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'room_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;
    END IF;
END $$;

-- =============================================================================
-- 8. UPDATE HELPER FUNCTION TO WORK WITH NEW STRUCTURE
-- =============================================================================
DROP FUNCTION IF EXISTS get_user_rooms_with_counts(UUID);

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
        COALESCE(COUNT(rp.room_id), 0) as participant_count,
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
-- 9. VERIFICATION QUERIES
-- =============================================================================

-- Verify no more room_chat_sessions references
SELECT 
    'CLEANUP_CHECK' as check_type,
    COUNT(*) as remaining_old_references
FROM information_schema.columns 
WHERE table_name = 'room_messages' 
AND column_name = 'room_chat_session_id';

-- Verify thread_id is properly set
SELECT 
    'THREAD_CHECK' as check_type,
    COUNT(*) as total_messages,
    COUNT(thread_id) as messages_with_thread_id,
    COUNT(DISTINCT thread_id) as unique_threads
FROM room_messages;

-- Check policy count (should be much fewer now)
SELECT 
    'POLICY_CHECK' as check_type,
    tablename,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('room_messages', 'room_participants', 'rooms')
GROUP BY tablename
ORDER BY tablename;