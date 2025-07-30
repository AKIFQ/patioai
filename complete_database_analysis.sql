-- ============================================================================
-- COMPLETE DATABASE ANALYSIS FOR REAL-TIME DEBUGGING  
-- ============================================================================
-- Copy and paste this ENTIRE script into your Supabase SQL Editor
-- It will output everything I need to diagnose the issue

-- ============================================================================
-- SECTION 1: CURRENT RLS POLICIES (MOST IMPORTANT)
-- ============================================================================
SELECT 
    '=== RLS POLICIES ===' as section,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as command_type,
    qual as using_condition,
    with_check as with_check_condition
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('rooms', 'room_participants', 'room_messages', 'room_chat_sessions')
ORDER BY tablename, policyname;

-- ============================================================================
-- SECTION 2: CHECK FUNCTIONS EXIST
-- ============================================================================
SELECT 
    '=== FUNCTIONS ===' as section,
    p.proname AS function_name,
    CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type,
    'EXISTS' as status
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN ('join_room_safely', 'increment_daily_usage', 'set_session_context')
ORDER BY p.proname;

-- ============================================================================
-- SECTION 3: CURRENT PARTICIPANTS IN STUDY-2025 ROOM
-- ============================================================================
SELECT 
    '=== PARTICIPANTS ===' as section,
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
-- SECTION 4: RECENT MESSAGES
-- ============================================================================
SELECT 
    '=== RECENT MESSAGES ===' as section,
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
-- SECTION 5: TEST RLS FOR ANONYMOUS USER
-- ============================================================================
SELECT '=== RLS TEST START ===' as section;

-- Test anonymous access
DO $$
DECLARE
    participant_count integer;
    message_count integer;
BEGIN
    -- Set session context for anonymous user
    PERFORM set_config('my.session_id', 'test_session_456', false);
    
    -- Test room_participants access
    SELECT COUNT(*) INTO participant_count
    FROM room_participants rp
    JOIN rooms r ON r.id = rp.room_id
    WHERE r.share_code = 'STUDY-2025';
    
    RAISE NOTICE 'Anonymous user can see % participants', participant_count;
    
    -- Test room_messages access
    SELECT COUNT(*) INTO message_count
    FROM room_messages rm
    JOIN rooms r ON r.id = rm.room_id
    WHERE r.share_code = 'STUDY-2025';
    
    RAISE NOTICE 'Anonymous user can see % messages', message_count;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'RLS ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- SECTION 6: TABLE STRUCTURES
-- ============================================================================
SELECT 
    '=== TABLE COLUMNS ===' as section,
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('room_participants', 'room_messages', 'room_chat_sessions', 'users')
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- SECTION 7: REALTIME STATUS
-- ============================================================================
SELECT 
    '=== REALTIME TABLES ===' as section,
    schemaname,
    tablename,
    'Check Supabase Dashboard → Database → Replication' as realtime_note
FROM pg_tables 
WHERE schemaname = 'public'
  AND tablename IN ('room_messages', 'room_participants')
ORDER BY tablename;

SELECT '=== ANALYSIS COMPLETE ===' as section;
