-- Socket.IO Optimization Verification Script
-- Run this with: supabase db query --file sql/verify-optimizations.sql

-- ============================================================
-- 1. CHECK CRITICAL INDEXES
-- ============================================================

SELECT '🔍 CRITICAL INDEXES VERIFICATION' as section;

-- Check that all critical Socket.IO indexes exist
WITH required_indexes AS (
    SELECT 
        expected_index,
        expected_table,
        performance_impact
    FROM (
        VALUES 
            ('idx_rooms_share_code_active', 'rooms', 'HIGH - Room validation queries'),
            ('idx_rooms_lookup_optimized', 'rooms', 'HIGH - Room lookup queries'),
            ('idx_room_participants_room_active', 'room_participants', 'HIGH - Active participant queries'),
            ('idx_room_participants_user_lookup', 'room_participants', 'HIGH - User participant queries'),
            ('idx_chat_sessions_user_updated', 'chat_sessions', 'HIGH - User session queries'),
            ('idx_room_messages_room_thread', 'room_messages', 'HIGH - Room message queries')
    ) AS t(expected_index, expected_table, performance_impact)
)
SELECT 
    'Critical Index Status' as check_type,
    ri.expected_index,
    ri.expected_table,
    ri.performance_impact,
    CASE 
        WHEN pi.indexname IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM required_indexes ri
LEFT JOIN pg_indexes pi ON pi.indexname = ri.expected_index AND pi.schemaname = 'public'
ORDER BY ri.expected_index;

-- ============================================================
-- 2. CHECK OPTIMIZATION FUNCTIONS
-- ============================================================

SELECT '⚙️ OPTIMIZATION FUNCTIONS VERIFICATION' as section;

-- Check that all optimization functions exist
WITH required_functions AS (
    SELECT 
        expected_function,
        function_purpose
    FROM (
        VALUES 
            ('get_active_participant_count', 'Count active participants in a room'),
            ('validate_room_access', 'Validate room access and capacity'),
            ('get_sidebar_data_optimized', 'Get sidebar data efficiently')
    ) AS t(expected_function, function_purpose)
)
SELECT 
    'Function Status' as check_type,
    rf.expected_function,
    rf.function_purpose,
    CASE 
        WHEN p.proname IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status,
    CASE 
        WHEN p.proname IS NOT NULL THEN pg_catalog.pg_get_function_arguments(p.oid)
        ELSE 'N/A'
    END as arguments
FROM required_functions rf
LEFT JOIN pg_proc p ON p.proname = rf.expected_function
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
ORDER BY rf.expected_function;

-- ============================================================
-- 3. TEST OPTIMIZATION FUNCTIONS
-- ============================================================

SELECT '🧪 FUNCTION TESTING' as section;

-- Test get_active_participant_count function
SELECT 
    'get_active_participant_count test' as test_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM rooms LIMIT 1) THEN
            CASE 
                WHEN get_active_participant_count((SELECT id FROM rooms LIMIT 1)) >= 0 
                THEN '✅ WORKING - Function returns valid count'
                ELSE '❌ ERROR - Function returned invalid result'
            END
        ELSE '⚠️ NO DATA - No rooms available for testing'
    END as test_result;

-- Test validate_room_access function
SELECT 
    'validate_room_access test' as test_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM rooms WHERE expires_at > NOW() LIMIT 1) THEN
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM validate_room_access((SELECT share_code FROM rooms WHERE expires_at > NOW() LIMIT 1)) 
                    WHERE valid = true
                )
                THEN '✅ WORKING - Function validates rooms correctly'
                ELSE '❌ ERROR - Function validation failed'
            END
        ELSE '⚠️ NO DATA - No active rooms available for testing'
    END as test_result;

-- Test get_sidebar_data_optimized function
SELECT 
    'get_sidebar_data_optimized test' as test_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM chat_sessions LIMIT 1) THEN
            CASE 
                WHEN LENGTH(get_sidebar_data_optimized((SELECT user_id FROM chat_sessions LIMIT 1))::text) > 10
                THEN '✅ WORKING - Function returns sidebar data'
                ELSE '❌ ERROR - Function returned empty/invalid data'
            END
        ELSE '⚠️ NO DATA - No chat sessions available for testing'
    END as test_result;

-- ============================================================
-- 4. CHECK TABLE ACCESS PATTERNS (PERFORMANCE VERIFICATION)
-- ============================================================

SELECT '⚡ PERFORMANCE VERIFICATION' as section;

-- Check if sequential scans have been reduced
SELECT 
    'Table Access Patterns' as analysis_type,
    relname as tablename,
    seq_scan as sequential_scans,
    idx_scan as index_scans,
    CASE 
        WHEN relname IN ('rooms', 'room_participants') AND idx_scan > seq_scan 
        THEN '✅ OPTIMIZED - More index scans than sequential'
        WHEN relname IN ('rooms', 'room_participants') AND seq_scan > idx_scan * 2 
        THEN '⚠️ STILL NEEDS WORK - Too many sequential scans'
        WHEN relname IN ('rooms', 'room_participants')
        THEN '📊 IMPROVED - Balanced scan patterns'
        ELSE '📋 OTHER TABLE'
    END as optimization_status
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
AND relname IN ('rooms', 'room_participants', 'room_messages', 'chat_sessions', 'chat_messages')
ORDER BY 
    CASE WHEN relname IN ('rooms', 'room_participants') THEN 1 ELSE 2 END,
    seq_scan DESC;

-- ============================================================
-- 5. CALCULATE FINAL OPTIMIZATION SCORE
-- ============================================================

SELECT '🎯 FINAL OPTIMIZATION SCORE' as section;

WITH optimization_metrics AS (
    SELECT 
        -- Critical indexes (6 total)
        (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' 
         AND indexname IN ('idx_rooms_share_code_active', 'idx_rooms_lookup_optimized',
                          'idx_room_participants_room_active', 'idx_room_participants_user_lookup',
                          'idx_chat_sessions_user_updated', 'idx_room_messages_room_thread')) as existing_indexes,
        6 as total_indexes,
        
        -- Optimization functions (3 total)
        (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' 
         AND p.proname IN ('get_active_participant_count', 'validate_room_access', 'get_sidebar_data_optimized')) as existing_functions,
        3 as total_functions
)
SELECT 
    'Socket.IO Optimization Score' as metric,
    existing_indexes as indexes_present,
    total_indexes as indexes_needed,
    existing_functions as functions_present,
    total_functions as functions_needed,
    ROUND(
        ((existing_indexes + existing_functions) * 100.0) / 
        (total_indexes + total_functions), 1
    ) as optimization_percentage,
    CASE 
        WHEN ((existing_indexes + existing_functions) * 100.0) / 
             (total_indexes + total_functions) >= 90 THEN '🎉 EXCELLENT (90%+)'
        WHEN ((existing_indexes + existing_functions) * 100.0) / 
             (total_indexes + total_functions) >= 70 THEN '✅ GOOD (70%+)'
        WHEN ((existing_indexes + existing_functions) * 100.0) / 
             (total_indexes + total_functions) >= 50 THEN '⚠️ NEEDS IMPROVEMENT (50%+)'
        ELSE '❌ POOR - MAJOR OPTIMIZATIONS NEEDED'
    END as optimization_status
FROM optimization_metrics;

-- ============================================================
-- 6. FINAL SUMMARY
-- ============================================================

SELECT '🎯 VERIFICATION SUMMARY' as section;

-- Count successful optimizations
WITH verification_summary AS (
    SELECT 
        'Indexes' as component,
        (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' 
         AND indexname IN ('idx_rooms_share_code_active', 'idx_rooms_lookup_optimized',
                          'idx_room_participants_room_active', 'idx_room_participants_user_lookup',
                          'idx_chat_sessions_user_updated', 'idx_room_messages_room_thread')) as present,
        6 as expected
    
    UNION ALL
    
    SELECT 
        'Functions' as component,
        (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' 
         AND p.proname IN ('get_active_participant_count', 'validate_room_access', 'get_sidebar_data_optimized')) as present,
        3 as expected
)
SELECT 
    component,
    present,
    expected,
    CASE 
        WHEN present = expected THEN '✅ COMPLETE'
        WHEN present > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ MISSING'
    END as status,
    ROUND((present * 100.0) / expected, 1) as completion_percentage
FROM verification_summary
ORDER BY completion_percentage DESC;

-- Final status message
SELECT 
    '🎉 SOCKET.IO OPTIMIZATION VERIFICATION COMPLETE' as message,
    'Your database optimizations have been verified via Supabase CLI' as status;