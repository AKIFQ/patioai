-- Fix the room sidebar issue by updating the function to find rooms by session_id pattern too

CREATE OR REPLACE FUNCTION get_user_rooms_with_counts(user_id_param UUID)
RETURNS TABLE (
    room_id UUID,
    room_name TEXT,
    share_code TEXT,
    max_participants INTEGER,
    creator_tier VARCHAR,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    created_by UUID,
    participant_count BIGINT,
    is_creator BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as room_id,
        r.name as room_name,
        r.share_code,
        r.max_participants,
        r.creator_tier,
        r.expires_at,
        r.created_at,
        r.created_by,
        COALESCE(COUNT(rp.room_id), 0) as participant_count,
        (r.created_by = user_id_param) as is_creator
    FROM rooms r
    LEFT JOIN room_participants rp ON r.id = rp.room_id
    WHERE r.created_by = user_id_param
       OR EXISTS (
           SELECT 1 FROM room_participants rp2 
           WHERE rp2.room_id = r.id 
           AND (
               rp2.user_id = user_id_param 
               OR rp2.session_id = ('auth_' || user_id_param::text)
           )
       )
    GROUP BY r.id, r.name, r.share_code, r.max_participants, r.creator_tier, 
             r.expires_at, r.created_at, r.created_by
    ORDER BY r.created_at DESC;
END;
$$;