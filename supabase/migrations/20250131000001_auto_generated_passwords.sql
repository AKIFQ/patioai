-- Add auto-generated password functionality with expiry
-- This migration adds fields to support automatic password generation and expiry

-- Add password generation timestamp and expiry fields
ALTER TABLE "public"."rooms" 
ADD COLUMN "password_generated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "password_expires_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + interval '36 hours');

-- Add comment to explain the new fields
COMMENT ON COLUMN "public"."rooms"."password_generated_at" IS 'Timestamp when the current password was generated';
COMMENT ON COLUMN "public"."rooms"."password_expires_at" IS 'Timestamp when the current password expires (36 hours after generation)';

-- Create index on password expiry for efficient lookups
CREATE INDEX IF NOT EXISTS "rooms_password_expiry_idx" ON "public"."rooms" ("password_expires_at");

-- Create a function to generate secure random passwords
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

-- Create a function to regenerate expired passwords
CREATE OR REPLACE FUNCTION "public"."regenerate_expired_passwords"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    updated_count integer := 0;
    room_record record;
BEGIN
    -- Find rooms with expired passwords
    FOR room_record IN 
        SELECT id, name 
        FROM rooms 
        WHERE password_expires_at < NOW()
    LOOP
        -- Update password and expiry
        UPDATE rooms 
        SET 
            password = generate_secure_password(),
            password_generated_at = NOW(),
            password_expires_at = NOW() + interval '36 hours'
        WHERE id = room_record.id;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN json_build_object(
        'success', true,
        'updated_rooms', updated_count,
        'timestamp', NOW()
    );
END;
$$;

-- Create a function to get current password for room admin
CREATE OR REPLACE FUNCTION "public"."get_room_password"("p_room_id" uuid, "p_user_id" uuid) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    room_record record;
    is_admin boolean := false;
BEGIN
    -- Check if user is the room creator/admin
    SELECT created_by, password, password_expires_at
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
    
    -- Return password info for admin
    RETURN json_build_object(
        'success', true,
        'password', room_record.password,
        'expires_at', room_record.password_expires_at,
        'is_expired', room_record.password_expires_at < NOW()
    );
END;
$$;

-- Update the join_room_safely function to handle password expiry
CREATE OR REPLACE FUNCTION "public"."join_room_safely"("p_room_id" uuid, "p_session_id" text, "p_display_name" text, "p_user_id" uuid, "p_password" text DEFAULT NULL) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_count integer;
    max_count integer;
    existing_participant boolean;
    room_expired boolean;
    room_password text;
    password_expired boolean;
BEGIN
    -- Check if room exists and get max participants, password, and expiry
    SELECT max_participants, expires_at < NOW(), password, password_expires_at < NOW()
    INTO max_count, room_expired, room_password, password_expired
    FROM rooms 
    WHERE id = p_room_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Room not found');
    END IF;
    
    IF room_expired THEN
        RETURN json_build_object('success', false, 'error', 'Room has expired');
    END IF;
    
    -- Check if password has expired
    IF password_expired THEN
        RETURN json_build_object('success', false, 'error', 'Room password has expired. Please contact the room admin for a new password.');
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

-- Create a cron job function to automatically regenerate expired passwords
-- This should be called every hour via a cron job or scheduled task
CREATE OR REPLACE FUNCTION "public"."auto_regenerate_expired_passwords"() RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    PERFORM regenerate_expired_passwords();
END;
$$;

-- Create a trigger function to auto-generate passwords for new rooms
CREATE OR REPLACE FUNCTION "public"."auto_generate_room_password"() RETURNS trigger
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Only generate password if one is not already set
    IF NEW.password IS NULL THEN
        NEW.password := generate_secure_password();
        NEW.password_generated_at := NOW();
        NEW.password_expires_at := NOW() + interval '36 hours';
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create the trigger on the rooms table
CREATE TRIGGER "auto_generate_room_password_trigger"
    BEFORE INSERT ON "public"."rooms"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."auto_generate_room_password"(); 