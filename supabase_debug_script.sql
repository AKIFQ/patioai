-- ============================================================================
-- SUPABASE REAL-TIME DEBUGGING SCRIPT
-- ============================================================================
-- Run this in your Supabase SQL Editor to diagnose the real-time sync issue

-- ============================================================================
-- 1. CHECK RLS STATUS
-- ============================================================================
SELECT 
    'RLS_STATUS' as check_type,
    schemaname,
    tablename,
    rowsecurity,
    CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls_status
FROM pg_tables 
WHERE schemaname = 'public'
  AND tablename IN ('rooms', 'room_participants', 'room_messages', 'room_chat_sessions', 'users')
ORDER BY tablename;

-- ============================================================================
-- 2. CHECK ALL RLS POLICIES (CRITICAL!)
-- ============================================================================
SELECT 
    'RLS_POLICIES' as check_type,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual AS policy_condition
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('rooms', 'room_participants', 'room_messages', 'room_chat_sessions')
ORDER BY tablename, policyname;

-- ============================================================================
-- 3. CHECK CUSTOM FUNCTIONS
-- ============================================================================
SELECT 
    'FUNCTIONS' as check_type,
    p.proname AS function_name,
    CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type,
    CASE WHEN p.proname IN ('join_room_safely', 'increment_daily_usage', 'set_session_context') 
         THEN 'EXISTS' ELSE 'UNKNOWN' END as status
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN ('join_room_safely', 'increment_daily_usage', 'set_session_context')
ORDER BY p.proname;

-- ============================================================================
-- 4. CHECK ROOM PARTICIPANTS (Current state)
-- ============================================================================
SELECT 
    'PARTICIPANTS' as check_type,
    r.share_code,
    rp.user_id,
    rp.session_id,
    rp.display_name,
    CASE WHEN rp.user_id IS NOT NULL THEN 'AUTHENTICATED' ELSE 'ANONYMOUS' END as user_type,
    rp.joined_at
FROM room_participants rp
JOIN rooms r ON r.id = rp.room_id
WHERE r.share_code = 'STUDY-2025'
ORDER BY rp.joined_at DESC;

-- ============================================================================
-- 5. CHECK RECENT MESSAGES
-- ============================================================================
SELECT 
    'MESSAGES' as check_type,
    r.share_code,
    rm.user_id,
    rm.session_id,
    rm.sender_name,
    rm.is_ai_response,
    LEFT(rm.content, 50) as content_preview,
    rm.created_at
FROM room_messages rm
JOIN rooms r ON r.id = rm.room_id
WHERE r.share_code = 'STUDY-2025'
ORDER BY rm.created_at DESC
LIMIT 10;

-- ============================================================================
-- 6. CHECK USERS TABLE STRUCTURE
-- ============================================================================
SELECT 
    'USERS_TABLE' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- ============================================================================
-- 7. TEST RLS ACCESS (Simulate anonymous user)
-- ============================================================================
-- This will show if RLS is blocking anonymous access
BEGIN;
-- Simulate setting session context for anonymous user
SELECT set_session_context('test_session_456');

-- Try to select from room_participants as anonymous user
SELECT 
    'RLS_TEST_PARTICIPANTS' as check_type,
    COUNT(*) as accessible_rows
FROM room_participants rp
JOIN rooms r ON r.id = rp.room_id
WHERE r.share_code = 'STUDY-2025';

-- Try to select from room_messages as anonymous user  
SELECT 
    'RLS_TEST_MESSAGES' as check_type,
    COUNT(*) as accessible_rows
FROM room_messages rm
JOIN rooms r ON r.id = rm.room_id
WHERE r.share_code = 'STUDY-2025';

ROLLBACK;

-- ============================================================================
-- 8. QUICK FIX: CREATE PROPER RLS POLICIES
-- ============================================================================
-- If the above tests show RLS is blocking access, run these fixes:

-- Fix room_participants policy
DROP POLICY IF EXISTS rp_select_all ON room_participants;
CREATE POLICY rp_select_all ON room_participants FOR ALL 
USING (
    user_id = auth.uid() 
    OR session_id = current_setting('my.session_id', true)
    OR EXISTS (
        SELECT 1 FROM rooms 
        WHERE id = room_participants.room_id 
        AND created_by = auth.uid()
    )
);

-- Fix room_messages policy  
DROP POLICY IF EXISTS rm_select_all ON room_messages;
CREATE POLICY rm_select_all ON room_messages FOR ALL
USING (
    user_id = auth.uid()
    OR session_id = current_setting('my.session_id', true) 
    OR EXISTS (
        SELECT 1 FROM rooms
        WHERE id = room_messages.room_id
        AND created_by = auth.uid()
    )
);

-- Fix room_chat_sessions policy
DROP POLICY IF EXISTS rcs_select_all ON room_chat_sessions;
CREATE POLICY rcs_select_all ON room_chat_sessions FOR ALL
USING (
    user_id = auth.uid()
    OR session_id = current_setting('my.session_id', true)
    OR EXISTS (
        SELECT 1 FROM rooms
        WHERE id = room_chat_sessions.room_id  
        AND created_by = auth.uid()
    )
);
