-- Enable realtime for regular chat messages
-- This migration enables realtime subscriptions for chat_messages table

BEGIN;

-- Enable realtime replication for chat_messages table (skip if already exists)
DO $
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
    EXCEPTION WHEN duplicate_object THEN
        -- Table already in publication, skip
        NULL;
    END;
END $;

-- Enable realtime replication for chat_sessions table (skip if already exists)
DO $
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
    EXCEPTION WHEN duplicate_object THEN
        -- Table already in publication, skip
        NULL;
    END;
END $;

-- Create indexes to optimize realtime queries for chat messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_realtime 
ON chat_messages (chat_session_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_realtime 
ON chat_sessions (user_id, created_at DESC, id);

COMMIT;