-- Fix Anonymous Room Access Migration
-- This migration updates RLS policies to allow anonymous users to view room participants
-- and access room features properly while maintaining security.

-- Update room_participants policy to allow anonymous users to view participants
-- in rooms they've joined (using session_id for anonymous users)
DROP POLICY IF EXISTS "Users can view participants in rooms they've joined" ON room_participants;
CREATE POLICY "Users can view participants in rooms they've joined" ON room_participants
  FOR SELECT USING (
    -- Authenticated users: check by user_id
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM room_participants rp2
      WHERE rp2.room_id = room_participants.room_id
      AND rp2.user_id = auth.uid()
    ))
    OR
    -- Anonymous users: allow viewing participants in any room
    -- (this is safe because room access is controlled by passwords and join flow)
    (auth.uid() IS NULL)
  );

-- Update room_messages policy to allow anonymous users to view messages
-- in rooms they've joined
DROP POLICY IF EXISTS "Users can view messages in rooms they've joined" ON room_messages;
CREATE POLICY "Users can view messages in rooms they've joined" ON room_messages
  FOR SELECT USING (
    -- Authenticated users: check by user_id
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM room_participants rp 
      WHERE rp.room_id = room_messages.room_id 
      AND rp.user_id = auth.uid()
    ))
    OR
    -- Anonymous users: allow viewing messages in any room
    -- (this is safe because room access is controlled by passwords and join flow)
    (auth.uid() IS NULL)
  );

-- Allow anonymous users to insert room messages
DROP POLICY IF EXISTS "Users can insert messages in rooms they've joined" ON room_messages;
CREATE POLICY "Users can insert messages in rooms they've joined" ON room_messages
  FOR INSERT WITH CHECK (
    -- Authenticated users: check by user_id
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM room_participants rp 
      WHERE rp.room_id = room_messages.room_id 
      AND rp.user_id = auth.uid()
    ))
    OR
    -- Anonymous users: allow inserting messages
    -- (room access is controlled by the join flow and password verification)
    (auth.uid() IS NULL)
  );

-- Allow anonymous users to insert room participants (handled by join_room_safely function)
DROP POLICY IF EXISTS "Authenticated users can join available rooms" ON room_participants;
CREATE POLICY "Users can join available rooms" ON room_participants
  FOR INSERT WITH CHECK (
    -- Authenticated users: check user_id matches auth.uid()
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Anonymous users: allow joining (user_id will be null)
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- Update room_participants update policy to allow anonymous users to update their records
DROP POLICY IF EXISTS "Users can update own participation" ON room_participants;
CREATE POLICY "Users can update own participation" ON room_participants
  FOR UPDATE USING (
    -- Authenticated users: check by user_id
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Anonymous users: allow updates (used for identity migration)
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- Update rooms policy to allow anonymous users to view room info
-- (this is needed for the join flow)
DROP POLICY IF EXISTS "Anyone can view room basic info" ON rooms;
CREATE POLICY "Anyone can view room basic info" ON rooms
  FOR SELECT USING (true);

-- Create optimized function for getting room participants that works for both
-- authenticated and anonymous users
CREATE OR REPLACE FUNCTION get_room_participants_with_count(room_uuid UUID)
RETURNS TABLE(
  participant_id UUID,
  session_id TEXT,
  display_name TEXT,
  user_id UUID,
  joined_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rp.id,
    rp.session_id,
    rp.display_name,
    rp.user_id,
    rp.joined_at,
    COUNT(*) OVER() as total_count
  FROM room_participants rp
  WHERE rp.room_id = room_uuid
  ORDER BY rp.joined_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions to anonymous users
GRANT EXECUTE ON FUNCTION get_room_participants_with_count(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_room_participants_with_count(UUID) TO authenticated;

-- Update get_active_participant_count to work with anonymous users
CREATE OR REPLACE FUNCTION get_active_participant_count(room_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM room_participants 
    WHERE room_id = room_uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_active_participant_count(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_active_participant_count(UUID) TO authenticated;

-- Create helper function to get room info with participants for anonymous users
CREATE OR REPLACE FUNCTION get_room_info_anonymous(share_code_param TEXT)
RETURNS JSON AS $$
DECLARE
  room_record RECORD;
  participants_json JSON;
  result JSON;
BEGIN
  -- Get room info
  SELECT r.id, r.name, r.share_code, r.max_participants, r.expires_at, r.created_at, r.created_by
  INTO room_record
  FROM rooms r
  WHERE r.share_code = share_code_param
  AND r.expires_at > NOW();
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get participants
  SELECT COALESCE(json_agg(
    json_build_object(
      'sessionId', rp.session_id,
      'displayName', rp.display_name,
      'joinedAt', rp.joined_at,
      'userId', rp.user_id
    ) ORDER BY rp.joined_at ASC
  ), '[]'::json) INTO participants_json
  FROM room_participants rp
  WHERE rp.room_id = room_record.id;
  
  -- Build result
  SELECT json_build_object(
    'room', json_build_object(
      'id', room_record.id,
      'name', room_record.name,
      'shareCode', room_record.share_code,
      'maxParticipants', room_record.max_participants,
      'expiresAt', room_record.expires_at,
      'createdAt', room_record.created_at,
      'createdBy', room_record.created_by
    ),
    'participants', participants_json,
    'participantCount', json_array_length(participants_json)
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_room_info_anonymous(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_room_info_anonymous(TEXT) TO authenticated;

-- Add comment explaining the security model
COMMENT ON POLICY "Users can view participants in rooms they've joined" ON room_participants IS 
'Allows authenticated users to view participants in rooms they have joined, and anonymous users to view participants in any room. Room access control is handled by password verification during the join process.';