-- Step 3: Migrate data to thread-based approach

-- Ensure all room_messages have thread_id
UPDATE room_messages 
SET thread_id = COALESCE(thread_id, room_chat_session_id, gen_random_uuid())
WHERE thread_id IS NULL;

-- Make thread_id NOT NULL
ALTER TABLE room_messages ALTER COLUMN thread_id SET NOT NULL;