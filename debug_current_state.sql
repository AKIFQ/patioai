-- Debug current state to see what's happening

-- 1. Check room participants for football room
SELECT 
    r.name as room_name,
    r.share_code,
    rp.display_name,
    rp.user_id,
    rp.session_id,
    rp.joined_at
FROM rooms r
LEFT JOIN room_participants rp ON r.id = rp.room_id
WHERE r.name ILIKE '%football%'
ORDER BY rp.joined_at DESC;

-- 2. Check what the function returns for john depp's user ID
-- First, find john depp's user ID
SELECT 
    id as user_id,
    full_name,
    email
FROM users 
WHERE full_name ILIKE '%john%' OR email ILIKE '%john%'
LIMIT 5;

-- 3. Test the function with a known user ID (replace with actual ID)
-- SELECT * FROM get_user_rooms_with_counts('USER_ID_HERE');

-- 4. Check current authentication
SELECT 
    auth.uid() as current_auth_uid,
    current_user as db_user;