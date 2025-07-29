-- Cleanup function for any orphaned data after room deletion
-- This ensures complete cleanup when rooms are deleted

BEGIN;

-- Function to clean up orphaned room data
CREATE OR REPLACE FUNCTION cleanup_orphaned_room_data()
RETURNS json AS $$
DECLARE
  orphaned_participants integer;
  orphaned_messages integer;
  orphaned_sessions integer;
  orphaned_usage integer;
BEGIN
  -- Clean up orphaned room participants (participants for non-existent rooms)
  DELETE FROM room_participants 
  WHERE room_id NOT IN (SELECT id FROM rooms);
  GET DIAGNOSTICS orphaned_participants = ROW_COUNT;
  
  -- Clean up orphaned room messages (messages for non-existent rooms)
  DELETE FROM room_messages 
  WHERE room_id NOT IN (SELECT id FROM rooms);
  GET DIAGNOSTICS orphaned_messages = ROW_COUNT;
  
  -- Clean up orphaned room chat sessions (sessions for non-existent rooms)
  DELETE FROM room_chat_sessions 
  WHERE room_id NOT IN (SELECT id FROM rooms);
  GET DIAGNOSTICS orphaned_sessions = ROW_COUNT;
  
  -- Clean up orphaned daily usage records (usage for non-existent rooms)
  DELETE FROM daily_message_usage 
  WHERE room_id NOT IN (SELECT id FROM rooms);
  GET DIAGNOSTICS orphaned_usage = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'cleaned_participants', orphaned_participants,
    'cleaned_messages', orphaned_messages,
    'cleaned_sessions', orphaned_sessions,
    'cleaned_usage_records', orphaned_usage,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced cleanup function that also removes expired rooms
CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS json AS $$
DECLARE
  deleted_count integer;
  cleanup_result json;
BEGIN
  -- Delete expired rooms first
  DELETE FROM rooms WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Clean up any orphaned data
  SELECT cleanup_orphaned_room_data() INTO cleanup_result;
  
  RETURN json_build_object(
    'success', true, 
    'deleted_rooms', deleted_count,
    'cleanup_details', cleanup_result,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- You can run this manually to clean up any existing orphaned data:
-- SELECT cleanup_orphaned_room_data();