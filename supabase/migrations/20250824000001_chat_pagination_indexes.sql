-- Add indexes for optimized chat message pagination queries
-- These indexes will dramatically improve performance for message pagination

-- Index for room_messages pagination by thread_id and created_at
-- This supports: WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?
CREATE INDEX IF NOT EXISTS idx_room_messages_thread_created 
ON room_messages (thread_id, created_at DESC);

-- Index for room_messages pagination by room_id and created_at  
-- This supports: WHERE room_id = ? ORDER BY created_at DESC LIMIT ?
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created 
ON room_messages (room_id, created_at DESC);

-- Composite index for room_messages with thread filtering and pagination
-- This supports: WHERE room_id = ? AND thread_id = ? ORDER BY created_at DESC LIMIT ?
CREATE INDEX IF NOT EXISTS idx_room_messages_room_thread_created 
ON room_messages (room_id, thread_id, created_at DESC);

-- Index for chat_messages pagination by chat_session_id and created_at
-- This supports: WHERE chat_session_id = ? ORDER BY created_at DESC LIMIT ?
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created 
ON chat_messages (chat_session_id, created_at DESC);

-- Index for efficient message counting by thread
-- This supports: SELECT COUNT(*) FROM room_messages WHERE thread_id = ?
CREATE INDEX IF NOT EXISTS idx_room_messages_thread_count 
ON room_messages (thread_id) 
WHERE thread_id IS NOT NULL;

-- Index for efficient message counting by room
-- This supports: SELECT COUNT(*) FROM room_messages WHERE room_id = ?
CREATE INDEX IF NOT EXISTS idx_room_messages_room_count 
ON room_messages (room_id);

-- Index for efficient message counting by chat session
-- This supports: SELECT COUNT(*) FROM chat_messages WHERE chat_session_id = ?
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_count 
ON chat_messages (chat_session_id);

-- Partial index for AI responses for analytics
-- This supports queries filtering for AI vs user messages
CREATE INDEX IF NOT EXISTS idx_room_messages_ai_responses 
ON room_messages (room_id, created_at DESC) 
WHERE is_ai_response = true;

-- Index for efficient sender-based queries (useful for user message filtering)
CREATE INDEX IF NOT EXISTS idx_room_messages_sender 
ON room_messages (sender_name, room_id, created_at DESC) 
WHERE sender_name IS NOT NULL;

-- Update table statistics to help query planner make better decisions
ANALYZE room_messages;
ANALYZE chat_messages;

-- Add comments explaining the indexes
COMMENT ON INDEX idx_room_messages_thread_created IS 'Optimizes pagination queries by thread_id with created_at ordering';
COMMENT ON INDEX idx_room_messages_room_created IS 'Optimizes pagination queries by room_id with created_at ordering';  
COMMENT ON INDEX idx_room_messages_room_thread_created IS 'Optimizes complex pagination queries with both room and thread filtering';
COMMENT ON INDEX idx_chat_messages_session_created IS 'Optimizes regular chat pagination by session with created_at ordering';