-- ============================================================================
-- MISSING FUNCTIONS FOR ROOM OPERATIONS
-- ============================================================================
-- These functions are referenced in your code but may not exist in the database

-- ============================================================================
-- 1. SET SESSION CONTEXT FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_session_context(session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Set the session context that RLS policies can access
    PERFORM set_config('my.session_id', session_id, false);
END;
$$;

-- ============================================================================
-- 2. JOIN ROOM SAFELY FUNCTION (Atomic operation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_room_safely(
    p_room_id uuid,
    p_user_id uuid DEFAULT NULL,
    p_session_id text,
    p_display_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_capacity integer;
    max_capacity integer;
    participant_exists boolean;
BEGIN
    -- Get room capacity info
    SELECT capacity INTO max_capacity 
    FROM rooms 
    WHERE id = p_room_id;
    
    IF max_capacity IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;
    
    -- Check if participant already exists
    SELECT EXISTS(
        SELECT 1 FROM room_participants 
        WHERE room_id = p_room_id 
        AND (
            (p_user_id IS NOT NULL AND user_id = p_user_id) 
            OR session_id = p_session_id
        )
    ) INTO participant_exists;
    
    IF participant_exists THEN
        -- Update existing participant
        UPDATE room_participants 
        SET display_name = p_display_name,
            joined_at = NOW()
        WHERE room_id = p_room_id 
        AND (
            (p_user_id IS NOT NULL AND user_id = p_user_id) 
            OR session_id = p_session_id
        );
        RETURN true;
    END IF;
    
    -- Count current participants
    SELECT COUNT(*) INTO current_capacity
    FROM room_participants 
    WHERE room_id = p_room_id;
    
    -- Check capacity
    IF current_capacity >= max_capacity THEN
        RETURN false;
    END IF;
    
    -- Insert new participant
    INSERT INTO room_participants (room_id, user_id, session_id, display_name)
    VALUES (p_room_id, p_user_id, p_session_id, p_display_name);
    
    RETURN true;
END;
$$;

-- ============================================================================
-- 3. INCREMENT DAILY USAGE FUNCTION (Atomic operation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.increment_daily_usage(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_usage integer;
    usage_date date;
BEGIN
    usage_date := CURRENT_DATE;
    
    -- Try to increment existing record
    UPDATE daily_message_usage 
    SET message_count = message_count + 1
    WHERE user_id = p_user_id AND date = usage_date
    RETURNING message_count INTO current_usage;
    
    -- If no record exists, create one
    IF NOT FOUND THEN
        INSERT INTO daily_message_usage (user_id, date, message_count)
        VALUES (p_user_id, usage_date, 1)
        RETURNING message_count INTO current_usage;
    END IF;
    
    RETURN current_usage;
END;
$$;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================
-- Allow authenticated users to execute these functions
GRANT EXECUTE ON FUNCTION public.set_session_context(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_safely(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_usage(uuid) TO authenticated;

-- Allow anonymous users to execute session context
GRANT EXECUTE ON FUNCTION public.set_session_context(text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_room_safely(uuid, uuid, text, text) TO anon;
