-- Debug: Check what threads exist in rooms and their message counts
SELECT 
    r.name as room_name,
    r.share_code,
    rm.thread_id,
    COUNT(rm.id) as message_count,
    MIN(rm.created_at) as first_message,
    MAX(rm.created_at) as last_message,
    STRING_AGG(DISTINCT rm.sender_name, ', ') as participants
FROM rooms r
LEFT JOIN room_messages rm ON r.id = rm.room_id
WHERE r.name ILIKE '%football%'
GROUP BY r.id, r.name, r.share_code, rm.thread_id
ORDER BY r.name, first_message;

-- Also check room participants
SELECT 
    r.name as room_name,
    r.share_code,
    rp.display_name,
    rp.user_id,
    rp.joined_at
FROM rooms r
LEFT JOIN room_participants rp ON r.id = rp.room_id
WHERE r.name ILIKE '%football%'
ORDER BY rp.joined_at;