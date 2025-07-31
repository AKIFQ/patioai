-- Database Schema Analysis Script
-- Run each query separately in Supabase SQL Editor

-- 1. All Tables Structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 2. Foreign Keys
SELECT 
    tc.table_name as source_table,
    kcu.column_name as source_column,
    ccu.table_name as target_table,
    ccu.column_name as target_column,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 3. RLS Status
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    relforcerowsecurity as rls_forced
FROM pg_tables pt
JOIN pg_class pc ON pt.tablename = pc.relname
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. All RLS Policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Table Row Counts
SELECT 
    'users' as table_name, 
    COUNT(*) as row_count 
FROM users
UNION ALL
SELECT 
    'chat_sessions' as table_name, 
    COUNT(*) as row_count 
FROM chat_sessions
UNION ALL
SELECT 
    'rooms' as table_name, 
    COUNT(*) as row_count 
FROM rooms
UNION ALL
SELECT 
    'room_participants' as table_name, 
    COUNT(*) as row_count 
FROM room_participants
UNION ALL
SELECT 
    'room_messages' as table_name, 
    COUNT(*) as row_count 
FROM room_messages;

-- 6. Current Auth Status
SELECT 
    current_user,
    session_user,
    auth.uid() as auth_uid;

-- 7. Recent Room Messages Sample
SELECT 
    id,
    room_id,
    thread_id,
    sender_name,
    substring(content, 1, 50) as content_preview,
    is_ai_response,
    created_at
FROM room_messages
ORDER BY created_at DESC
LIMIT 10;