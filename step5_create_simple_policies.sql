-- Step 5: Create simple, non-recursive policies

-- ROOM_PARTICIPANTS: Ultra-simple policies
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can view participants (needed for room functionality)
CREATE POLICY "public_read_participants" ON room_participants
FOR SELECT USING (true);

-- Anyone can join rooms (we'll handle limits in application logic)
CREATE POLICY "public_join_rooms" ON room_participants
FOR INSERT WITH CHECK (true);

-- Users can leave rooms they joined
CREATE POLICY "users_can_leave" ON room_participants
FOR DELETE USING (
    user_id = auth.uid() OR session_id = current_setting('app.session_id', true)
);

-- ROOM_MESSAGES: Ultra-simple policies for thread-based approach
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read messages (needed for room chat functionality)
CREATE POLICY "public_read_messages" ON room_messages
FOR SELECT USING (true);

-- Anyone can create messages (we'll validate in application)
CREATE POLICY "public_create_messages" ON room_messages
FOR INSERT WITH CHECK (true);

-- ROOMS: Keep existing simple policies (they work fine)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;