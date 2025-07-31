-- Step 2: Drop all conflicting room-related policies

-- Drop room_participants policies
DROP POLICY IF EXISTS "Authenticated users can join available rooms" ON room_participants;
DROP POLICY IF EXISTS "Users can leave or be removed by creator" ON room_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON room_participants;
DROP POLICY IF EXISTS "Users can view room participants for accessible rooms" ON room_participants;

-- Drop room_messages policies
DROP POLICY IF EXISTS "Simple create access for room messages" ON room_messages;
DROP POLICY IF EXISTS "Simple read access for room messages" ON room_messages;
DROP POLICY IF EXISTS "Users can view room messages for accessible rooms" ON room_messages;

-- Drop room_chat_sessions policies
DROP POLICY IF EXISTS "Participants can update own chat sessions" ON room_chat_sessions;
DROP POLICY IF EXISTS "Users can view room chat sessions for accessible rooms" ON room_chat_sessions;