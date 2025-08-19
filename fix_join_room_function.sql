-- Fix the join_room_safely function to handle passwords correctly
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION "public"."join_room_safely"("p_room_id" "uuid", "p_session_id" "text", "p_display_name" "text", "p_user_id" "uuid", "p_password" text DEFAULT NULL) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_count integer;
  max_count integer;
  existing_participant boolean;
  room_expired boolean;
  room_password text;
BEGIN
  -- Check if room exists and get max participants and password
  SELECT max_participants, expires_at < NOW(), password
  INTO max_count, room_expired, room_password
  FROM rooms 
  WHERE id = p_room_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Room not found');
  END IF;
  
  IF room_expired THEN
    RETURN json_build_object('success', false, 'error', 'Room has expired');
  END IF;
  
  -- Check password if room has one set
  IF room_password IS NOT NULL AND room_password != p_password THEN
    RETURN json_build_object('success', false, 'error', 'Incorrect password');
  END IF;
  
  -- Check if participant already exists
  -- For authenticated users, check by user_id
  -- For anonymous users (user_id is null), check by session_id
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM room_participants 
      WHERE room_id = p_room_id AND user_id = p_user_id
    ) INTO existing_participant;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM room_participants 
      WHERE room_id = p_room_id AND session_id = p_session_id
    ) INTO existing_participant;
  END IF;
  
  IF existing_participant THEN
    -- Update existing participant
    IF p_user_id IS NOT NULL THEN
      UPDATE room_participants 
      SET display_name = p_display_name,
          session_id = p_session_id,
          joined_at = NOW()
      WHERE room_id = p_room_id AND user_id = p_user_id;
    ELSE
      UPDATE room_participants 
      SET display_name = p_display_name,
          joined_at = NOW()
      WHERE room_id = p_room_id AND session_id = p_session_id;
    END IF;
    
    RETURN json_build_object('success', true, 'message', 'Updated existing participation');
  ELSE
    -- Check current participant count atomically
    SELECT COUNT(*) FROM room_participants 
    WHERE room_id = p_room_id INTO current_count;
    
    IF current_count >= max_count THEN
      RETURN json_build_object('success', false, 'error', 'Room is full');
    END IF;
    
    -- Insert new participant
    INSERT INTO room_participants (room_id, session_id, display_name, user_id)
    VALUES (p_room_id, p_session_id, p_display_name, p_user_id);
    
    RETURN json_build_object('success', true, 'message', 'Successfully joined room');
  END IF;
  
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Room capacity exceeded due to concurrent joins');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$; 