-- Simplify the room chat system to be thread-centric like Discord
-- Each message belongs directly to a thread, no complex session management

BEGIN;

-- Add thread_id column to room_messages if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'room_messages' 
        AND column_name = 'thread_id'
    ) THEN
        ALTER TABLE room_messages ADD COLUMN thread_id uuid;
        
        -- Migrate existing data: use room_chat_session_id as thread_id
        UPDATE room_messages 
        SET thread_id = room_chat_session_id 
        WHERE thread_id IS NULL AND room_chat_session_id IS NOT NULL;
        
        -- Create index for thread-based queries
        CREATE INDEX IF NOT EXISTS idx_room_messages_thread 
        ON room_messages (room_id, thread_id, created_at);
        
        RAISE NOTICE 'Added thread_id column and migrated data';
    END IF;
END $$;

-- Update the realtime subscription to include thread_id
-- This ensures real-time updates include thread information
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime DROP TABLE room_messages;
    EXCEPTION WHEN undefined_object THEN
        -- Table not in publication, skip
        NULL;
    END;
    
    ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
END $$;

-- Create a simple function to get thread messages
CREATE OR REPLACE FUNCTION get_thread_messages(
  room_id_param uuid,
  thread_id_param uuid,
  limit_param integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  thread_id uuid,
  sender_name text,
  content text,
  is_ai_response boolean,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rm.id,
    rm.room_id,
    rm.thread_id,
    rm.sender_name,
    rm.content,
    rm.is_ai_response,
    rm.created_at
  FROM room_messages rm
  WHERE rm.room_id = room_id_param 
    AND rm.thread_id = thread_id_param
  ORDER BY rm.created_at ASC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;