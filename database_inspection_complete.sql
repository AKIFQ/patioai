-- ============================================
-- COMPLETE DATABASE INSPECTION SCRIPT
-- Run these queries in Supabase SQL Editor
-- ============================================

-- 1. ALL TABLES WITH COLUMN DETAILS
SELECT 
  '=== TABLE STRUCTURE ===' AS section;
  
SELECT 
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- 2. ALL INDEXES
SELECT 
  '=== INDEXES ===' AS section;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 3. ALL RLS POLICIES
SELECT 
  '=== RLS POLICIES ===' AS section;

SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. ALL FOREIGN KEY CONSTRAINTS
SELECT 
  '=== FOREIGN KEYS ===' AS section;

SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 5. ALL CHECK CONSTRAINTS
SELECT 
  '=== CHECK CONSTRAINTS ===' AS section;

SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 6. ALL CUSTOM FUNCTIONS
SELECT 
  '=== CUSTOM FUNCTIONS ===' AS section;

SELECT
  p.proname AS function_name,
  pg_catalog.pg_get_function_result(p.oid) AS return_type,
  pg_catalog.pg_get_function_arguments(p.oid) AS arguments,
  CASE 
    WHEN length(p.prosrc) > 200 
    THEN left(p.prosrc, 200) || '...'
    ELSE p.prosrc 
  END AS source_preview
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- 7. ALL TRIGGERS
SELECT 
  '=== TRIGGERS ===' AS section;

SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 8. ROW LEVEL SECURITY STATUS
SELECT 
  '=== RLS STATUS ===' AS section;

SELECT
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity THEN 'ENABLED'
    ELSE 'DISABLED'
  END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 9. TABLE SIZES
SELECT 
  '=== TABLE SIZES ===' AS section;

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 10. SEQUENCES
SELECT 
  '=== SEQUENCES ===' AS section;

SELECT
  sequence_name,
  data_type,
  start_value,
  minimum_value,
  maximum_value,
  increment
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name; 