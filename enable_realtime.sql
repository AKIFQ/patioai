-- Enable Supabase Realtime for group chat functionality
-- This allows real-time message updates and typing indicators

BEGIN;

-- Enable realtime for room_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;

-- Enable realtime for room_participants table (for join/leave notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;

-- Create a function to broadcast typing events (optional, for advanced typing indicators)
CREATE OR REPLACE FUNCTION broadcast_typing_event(
  room_id_param uuid,
  user_name text,
  is_typing boolean
)
RETURNS void AS $$
BEGIN
  -- This function can be used to broadcast typing events
  -- For now, we'll use Supabase presence instead
  PERFORM pg_notify(
    'typing_' || room_id_param::text,
    json_build_object(
      'user_name', user_name,
      'is_typing', is_typing,
      'timestamp', NOW()
    )::text
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Verify realtime is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('room_messages', 'room_participants');