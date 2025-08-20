-- Fix the trigger function for room_participants table
-- The issue is that room_participants doesn't have an 'id' field, it has composite primary key (room_id, session_id)

CREATE OR REPLACE FUNCTION trigger_refresh_room_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Use pg_notify to signal that room stats need refreshing
  -- For room_participants, use room_id since that's what we care about for stats
  IF TG_TABLE_NAME = 'room_participants' THEN
    PERFORM pg_notify('room_stats_refresh', NEW.room_id::text);
  ELSE
    -- For other tables like room_messages, use the id field
    PERFORM pg_notify('room_stats_refresh', NEW.id::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;