-- Debug: Check if the new user is properly linked to the room
-- Replace 'john depp' with the actual display name and user ID

-- 1. Check room participants table
SELECT 
    rp.display_name,
    rp.user_id,
    rp.session_id,
    r.name as room_name,
    r.share_code,
    rp.joined_at
FROM room_participants rp
JOIN rooms r ON rp.room_id = r.id
WHERE rp.display_name = 'john depp'
   OR r.name ILIKE '%football%';

-- 2. Check what the function returns for a specific user
-- Replace with the actual user_id of john depp
SELECT * FROM get_user_rooms_with_counts('USER_ID_HERE');

-- 3. Check current auth status
SELECT 
    auth.uid() as current_user_id,
    current_user as db_user;