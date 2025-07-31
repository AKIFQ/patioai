-- Check what's in the room_messages table
SELECT 
  id,
  room_id,
  thread_id,
  sender_name,
  content,
  is_ai_response,
  created_at
FROM room_messages 
WHERE room_id IN (
  SELECT id FROM rooms WHERE share_code = 'LIBRARY-2024'
)
ORDER BY created_at DESC
LIMIT 10;