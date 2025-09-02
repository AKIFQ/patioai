-- Remove password expiry functionality - keep only manual regeneration
-- This migration removes all automatic expiry-related fields and functions

-- Drop the expiry-related columns from rooms table
ALTER TABLE "public"."rooms" 
DROP COLUMN IF EXISTS "password_generated_at",
DROP COLUMN IF EXISTS "password_expires_at";

-- Update the comment on password column
COMMENT ON COLUMN "public"."rooms"."password" IS 'Room password - manually managed by room creator';

-- Drop the expiry-related indexes
DROP INDEX IF EXISTS "rooms_password_expiry_idx";

-- Simplify the password generation function (no expiry tracking)
CREATE OR REPLACE FUNCTION "public"."generate_secure_password"() RETURNS text
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    result text := '';
    i integer;
BEGIN
    -- Generate 8-character password
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    
    RETURN result;
END;
$$;

-- Drop the expired password regeneration function (not needed)
DROP FUNCTION IF EXISTS "public"."regenerate_expired_passwords"();

-- Drop the auto-regeneration cron function (not needed)
DROP FUNCTION IF EXISTS "public"."auto_regenerate_expired_passwords"();

-- Update the room password retrieval function (no expiry info)
CREATE OR REPLACE FUNCTION "public"."get_room_password"("p_room_id" uuid, "p_user_id" uuid) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    room_record record;
    is_admin boolean := false;
BEGIN
    -- Check if user is the room creator/admin
    SELECT created_by, password
    INTO room_record
    FROM rooms 
    WHERE id = p_room_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Room not found');
    END IF;
    
    -- Check if user is admin
    IF room_record.created_by = p_user_id THEN
        is_admin := true;
    END IF;
    
    IF NOT is_admin THEN
        RETURN json_build_object('success', false, 'error', 'Access denied. Only room admin can view password.');
    END IF;
    
    -- Return password info for admin (no expiry)
    RETURN json_build_object(
        'success', true,
        'password', room_record.password
    );
END;
$$;

-- Update the room joining function (no expiry checks)
CREATE OR REPLACE FUNCTION "public"."join_room_safely"("p_room_id" uuid, "p_session_id" text, "p_display_name" text, "p_user_id" uuid, "p_password" text DEFAULT NULL) RETURNS json
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
    
    -- Check password if room has one set (no expiry check)
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

-- Update the auto-generate room password trigger function (no expiry tracking)
CREATE OR REPLACE FUNCTION "public"."auto_generate_room_password"() RETURNS trigger
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Only generate password if one is not already set
    IF NEW.password IS NULL THEN
        NEW.password := generate_secure_password();
    END IF;
    
    RETURN NEW;
END;
$$;