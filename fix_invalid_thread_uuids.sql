-- Fix existing invalid thread UUIDs in the database
-- Replace invalid UUIDs with proper ones

BEGIN;

-- First, let's see what invalid UUIDs we have
SELECT DISTINCT thread_id, COUNT(*) as message_count
FROM room_messages 
WHERE thread_id ~ '^00000000-0000-4000-8000-[A-Z]'
GROUP BY thread_id;

-- Create a function to generate proper UUIDs from share codes
CREATE OR REPLACE FUNCTION generate_thread_uuid_from_share_code(share_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    hash_num INTEGER;
    hash_str TEXT;
    result_uuid TEXT;
BEGIN
    -- Create a simple hash from the share code
    hash_num := 0;
    FOR i IN 1..length(share_code) LOOP
        hash_num := ((hash_num * 31) + ascii(substring(share_code, i, 1))) % 2147483647;
    END LOOP;
    
    -- Convert to hex string
    hash_str := lpad(to_hex(abs(hash_num)), 8, '0');
    
    -- Create a proper UUID format
    result_uuid := hash_str || '-0000-4000-8000-' || lpad(hash_str, 12, '0');
    
    RETURN result_uuid::UUID;
END;
$$;

-- Update invalid thread IDs with proper UUIDs
UPDATE room_messages 
SET thread_id = generate_thread_uuid_from_share_code(
    (SELECT share_code FROM rooms WHERE id = room_messages.room_id)
)
WHERE thread_id ~ '^00000000-0000-4000-8000-[A-Z]';

-- Clean up the function
DROP FUNCTION generate_thread_uuid_from_share_code(TEXT);

-- Verify the fix
SELECT DISTINCT thread_id, COUNT(*) as message_count
FROM room_messages 
WHERE thread_id ~ '^00000000-0000-4000-8000-[A-Z]'
GROUP BY thread_id;

COMMIT;