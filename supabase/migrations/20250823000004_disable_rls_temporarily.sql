-- Temporarily disable RLS on room_messages to fix the 500 errors
-- This is a debugging step to confirm RLS is the issue

BEGIN;

-- Disable RLS on room_messages table temporarily
ALTER TABLE room_messages DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    RAISE NOTICE 'Disabled RLS on room_messages table - this should fix 500 errors temporarily';
END $$;

COMMIT;