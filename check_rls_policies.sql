-- Check current RLS policies for room tables
SELECT 
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