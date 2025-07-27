-- Migration to Unified Chat Architecture
-- This aligns with your superior single-interface design

-- Step 1: Add room_id to existing chat_sessions table
ALTER TABLE public.chat_sessions 
ADD COLUMN room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE;

-- Step 2: Create index for room-based queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_room_id ON public.chat_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_room ON public.chat_sessions(user_id, room_id);

-- Step 3: Migrate existing room_messages to unified system
-- (This would be done programmatically to preserve data)

-- Step 4: Update RLS policies for room context
CREATE POLICY "Users can view room chats they participate in" 
ON public.chat_sessions FOR SELECT 
USING (
  room_id IS NULL AND user_id = auth.uid() OR  -- Personal chats
  room_id IS NOT NULL AND EXISTS (              -- Room chats they're in
    SELECT 1 FROM room_participants rp 
    WHERE rp.room_id = chat_sessions.room_id 
    AND rp.session_id = current_setting('app.session_id', true)
  )
);

-- Step 5: Eventually drop room_messages table (after migration)
-- DROP TABLE public.room_messages; -- Do this after data migration