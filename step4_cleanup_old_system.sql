-- Step 4: Clean up old system

-- Remove foreign key constraint to old system
ALTER TABLE room_messages DROP CONSTRAINT IF EXISTS room_messages_session_fkey;

-- Remove old column
ALTER TABLE room_messages DROP COLUMN IF EXISTS room_chat_session_id;

-- Drop old table completely
DROP TABLE IF EXISTS room_chat_sessions CASCADE;