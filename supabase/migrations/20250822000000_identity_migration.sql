-- Identity Migration System: Handle anonymous → authenticated user transitions
-- This fixes the issue where users who join as anonymous then authenticate 
-- should have their room participation and messages migrated to their authenticated identity

-- Enhanced join_room_safely function with identity migration
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
  anonymous_participant record;
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
      -- This handles cases where anonymous user later authenticates
      SELECT rp.* INTO anonymous_participant
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
        RAISE NOTICE 'Identity migration detected: anonymous participant % will be migrated to user_id %', 
          anonymous_participant.display_name, p_user_id;
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
    WHERE room_id = p_room_id 
      AND user_id IS NULL
      AND (
        (p_previous_session_id IS NOT NULL AND session_id = p_previous_session_id) OR
        (p_previous_session_id IS NULL AND session_id LIKE 'session_%') OR
        (p_previous_session_id IS NULL AND display_name = p_display_name)
      );
    
    -- Step 2: Update message ownership (migrate anonymous messages to authenticated user)
    -- Note: This is a best-effort migration based on display name matching
    UPDATE room_messages 
    SET sender_name = p_display_name,
        migrated_from_anonymous = true
    WHERE room_id = p_room_id 
      AND sender_name = (
        SELECT display_name FROM room_participants 
        WHERE room_id = p_room_id 
          AND user_id IS NULL
          AND (
            (p_previous_session_id IS NOT NULL AND session_id = p_previous_session_id) OR
            (p_previous_session_id IS NULL AND session_id LIKE 'session_%') OR
            (p_previous_session_id IS NULL AND display_name = p_display_name)
          )
        LIMIT 1
      )
      AND created_at >= (
        SELECT joined_at FROM room_participants 
        WHERE room_id = p_room_id 
          AND user_id IS NULL
          AND (
            (p_previous_session_id IS NOT NULL AND session_id = p_previous_session_id) OR
            (p_previous_session_id IS NULL AND session_id LIKE 'session_%') OR
            (p_previous_session_id IS NULL AND display_name = p_display_name)
          )
        LIMIT 1
      );
    
    RETURN json_build_object(
      'success', true, 
      'message', 'Identity migrated successfully',
      'migration', json_build_object(
        'from_display_name', anonymous_participant.display_name,
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

-- Add migration tracking columns to room_participants if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'room_participants' AND column_name = 'migrated_from_anonymous') THEN
    ALTER TABLE room_participants ADD COLUMN migrated_from_anonymous boolean DEFAULT false;
  END IF;
END $$;

-- Add migration tracking columns to room_messages if they don't exist  
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'room_messages' AND column_name = 'migrated_from_anonymous') THEN
    ALTER TABLE room_messages ADD COLUMN migrated_from_anonymous boolean DEFAULT false;
  END IF;
END $$;

-- Create index for efficient identity migration queries
CREATE INDEX IF NOT EXISTS idx_room_participants_migration 
ON room_participants(room_id, user_id, session_id) 
WHERE user_id IS NULL;

-- Create helper function to find potential anonymous participants for migration
CREATE OR REPLACE FUNCTION find_anonymous_participant_for_migration(
  p_room_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_previous_session_id text DEFAULT NULL
) RETURNS TABLE (
  participant_id uuid,
  session_id text,
  display_name text,
  joined_at timestamptz,
  confidence_score integer
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rp.id,
    rp.session_id,
    rp.display_name,
    rp.joined_at,
    CASE 
      -- Highest confidence: exact session match
      WHEN p_previous_session_id IS NOT NULL AND rp.session_id = p_previous_session_id THEN 100
      -- High confidence: session pattern match
      WHEN rp.session_id LIKE 'session_%' THEN 80
      -- Medium confidence: display name match
      WHEN rp.display_name = p_display_name THEN 60
      -- Low confidence: recent participant
      WHEN rp.joined_at > NOW() - INTERVAL '1 hour' THEN 40
      ELSE 20
    END as confidence_score
  FROM room_participants rp
  WHERE rp.room_id = p_room_id 
    AND rp.user_id IS NULL  -- Only anonymous participants
    AND (
      (p_previous_session_id IS NOT NULL AND rp.session_id = p_previous_session_id) OR
      (rp.session_id LIKE 'session_%') OR
      (rp.display_name = p_display_name) OR
      (rp.joined_at > NOW() - INTERVAL '1 hour')  -- Recent participants
    )
  ORDER BY confidence_score DESC, rp.joined_at DESC
  LIMIT 5;
END $$;