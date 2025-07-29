-- Production-ready Supabase Realtime setup for group chat
-- This enables real-time message synchronization for thousands of users

BEGIN;

-- Enable realtime replication for room_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;

-- Enable realtime replication for room_participants table (for join/leave events)
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;

-- Create indexes to optimize realtime queries
CREATE INDEX IF NOT EXISTS idx_room_messages_realtime 
ON room_messages (room_id, created_at DESC, id);

-- Create a function to get room ID from share code (for real-time filtering)
CREATE OR REPLACE FUNCTION get_room_id_from_share_code(share_code_param text)
RETURNS uuid AS $$
DECLARE
  room_uuid uuid;
BEGIN
  SELECT id INTO room_uuid
  FROM rooms 
  WHERE share_code = share_code_param;
  
  RETURN room_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get recent messages for a room (for initial load)
CREATE OR REPLACE FUNCTION get_recent_room_messages(
  room_id_param uuid,
  limit_param integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  sender_name text,
  content text,
  is_ai_response boolean,
  created_at timestamptz,
  room_chat_session_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rm.id,
    rm.room_id,
    rm.sender_name,
    rm.content,
    rm.is_ai_response,
    rm.created_at,
    rm.room_chat_session_id
  FROM room_messages rm
  WHERE rm.room_id = room_id_param
  ORDER BY rm.created_at DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Verify realtime is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('room_messages', 'room_participants');