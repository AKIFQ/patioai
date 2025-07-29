-- Fix room chat issues: participant verification and session context

BEGIN;

-- Create function to set session context for RLS policies
CREATE OR REPLACE FUNCTION set_session_context(session_id_param text)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.session_id', session_id_param, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to be more permissive for room participants
-- Allow participants to create messages if they're in the room OR if session context matches
DROP POLICY IF EXISTS "Participants can create room messages" ON room_messages;
CREATE POLICY "Participants can create room messages" ON room_messages
FOR INSERT WITH CHECK (
  -- User is authenticated and is a participant in this room
  (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM room_participants rp 
    WHERE rp.room_id = room_messages.room_id 
    AND rp.user_id = auth.uid()
  ))
  OR
  -- Session context matches (for non-authenticated users)
  EXISTS (
    SELECT 1 FROM room_participants rp 
    WHERE rp.room_id = room_messages.room_id 
    AND rp.session_id = current_setting('app.session_id', true)
  )
);

-- Update room chat sessions policy to allow creation by participants
DROP POLICY IF EXISTS "Participants can create room chat sessions" ON room_chat_sessions;
CREATE POLICY "Participants can create room chat sessions" ON room_chat_sessions
FOR INSERT WITH CHECK (
  -- User is authenticated and is a participant in this room
  (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM room_participants rp 
    WHERE rp.room_id = room_chat_sessions.room_id 
    AND rp.user_id = auth.uid()
  ))
  OR
  -- Session context matches (for non-authenticated users)
  EXISTS (
    SELECT 1 FROM room_participants rp 
    WHERE rp.room_id = room_chat_sessions.room_id 
    AND rp.session_id = current_setting('app.session_id', true)
  )
);

COMMIT;