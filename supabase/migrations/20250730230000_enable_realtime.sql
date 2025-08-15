-- Deprecated: Supabase Realtime not used (Socket.IO only). Keep helper functions and indexes.

BEGIN;

-- Enable realtime replication for room_messages table (skip if already exists)
-- No-op: do not add room_messages to supabase_realtime

-- Enable realtime replication for room_participants table (skip if already exists)
-- No-op: do not add room_participants to supabase_realtime

-- Create indexes to optimize realtime queries
CREATE INDEX IF NOT EXISTS idx_room_messages_realtime 
ON room_messages (room_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_room_participants_realtime 
ON room_participants (room_id, session_id);

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

-- Create function to set session context for RLS policies
CREATE OR REPLACE FUNCTION set_session_context(session_id_param text)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.session_id', session_id_param, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;