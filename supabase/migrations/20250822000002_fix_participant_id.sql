-- Fix the participant ID reference in migration
CREATE OR REPLACE FUNCTION "public"."join_room_safely"(
  "p_room_id" "uuid", 
  "p_session_id" "text", 
  "p_display_name" "text", 
  "p_user_id" "uuid", 
  "p_password" text DEFAULT NULL,
  "p_previous_session_id" text DEFAULT NULL
) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_count integer;
  max_count integer;
  existing_participant boolean;
  room_expired boolean;
  room_password text;
  anonymous_participant_id uuid;
  anonymous_participant_name text;
  anonymous_participant_joined timestamptz;
  migration_needed boolean := false;
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
  
  -- ENHANCED LOGIC: Check for identity migration scenario
  IF p_user_id IS NOT NULL THEN
    -- Check if authenticated user already exists
    SELECT EXISTS(
      SELECT 1 FROM room_participants 
      WHERE room_id = p_room_id AND user_id = p_user_id
    ) INTO existing_participant;
    
    -- If authenticated user doesn't exist, check for anonymous participant to migrate
    IF NOT existing_participant THEN
      -- Look for anonymous participant with similar session pattern or previous session
      SELECT rp.id, rp.display_name, rp.joined_at 
      INTO anonymous_participant_id, anonymous_participant_name, anonymous_participant_joined
      FROM room_participants rp
      WHERE rp.room_id = p_room_id 
        AND rp.user_id IS NULL  -- Anonymous participant
        AND (
          -- Match by previous session ID if provided
          (p_previous_session_id IS NOT NULL AND rp.session_id = p_previous_session_id)
          OR 
          -- Match by session pattern (e.g., session_123 → auth_user-id)
          (p_previous_session_id IS NULL AND rp.session_id LIKE 'session_%')
          OR
          -- Match by display name as fallback (less reliable but better than nothing)
          (p_previous_session_id IS NULL AND rp.display_name = p_display_name)
        )
      LIMIT 1;
      
      IF FOUND THEN
        migration_needed := true;
        RAISE NOTICE 'Identity migration detected: anonymous participant % (id: %) will be migrated to user_id %', 
          anonymous_participant_name, anonymous_participant_id, p_user_id;
      END IF;
    END IF;
  ELSE
    -- For anonymous users, check by session_id
    SELECT EXISTS(
      SELECT 1 FROM room_participants 
      WHERE room_id = p_room_id AND session_id = p_session_id
    ) INTO existing_participant;
  END IF;
  
  -- Handle existing participants or identity migration
  IF existing_participant THEN
    -- Update existing authenticated participant
    IF p_user_id IS NOT NULL THEN
      UPDATE room_participants 
      SET display_name = p_display_name,
          session_id = p_session_id,
          joined_at = NOW()
      WHERE room_id = p_room_id AND user_id = p_user_id;
    ELSE
      -- Update existing anonymous participant
      UPDATE room_participants 
      SET display_name = p_display_name,
          joined_at = NOW()
      WHERE room_id = p_room_id AND session_id = p_session_id;
    END IF;
    
    RETURN json_build_object('success', true, 'message', 'Updated existing participation');
    
  ELSIF migration_needed THEN
    -- IDENTITY MIGRATION: Convert anonymous participant to authenticated
    
    -- Step 1: Update the participant record
    UPDATE room_participants 
    SET user_id = p_user_id,
        session_id = p_session_id,
        display_name = p_display_name,  -- User can choose to keep or change display name
        joined_at = NOW(),
        migrated_from_anonymous = true  -- Track that this was migrated
    WHERE id = anonymous_participant_id;
    
    -- Step 2: Update message ownership (migrate anonymous messages to authenticated user)
    UPDATE room_messages 
    SET sender_name = p_display_name,
        migrated_from_anonymous = true
    WHERE room_id = p_room_id 
      AND sender_name = anonymous_participant_name
      AND created_at >= anonymous_participant_joined;  -- Only messages after they joined
    
    RETURN json_build_object(
      'success', true, 
      'message', 'Identity migrated successfully',
      'migration', json_build_object(
        'from_display_name', anonymous_participant_name,
        'to_display_name', p_display_name,
        'migration_type', 'anonymous_to_authenticated'
      )
    );
    
  ELSE
    -- New participant: Check room capacity
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