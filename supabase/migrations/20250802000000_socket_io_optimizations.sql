-- Socket.IO Migration Database Optimizations
-- This migration adds indexes and functions to optimize performance for Socket.IO realtime system

BEGIN;

-- Add critical indexes for Socket.IO performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_time 
ON chat_messages(chat_session_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_user_time 
ON chat_messages(chat_session_id, is_user_message, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_messages_room_thread 
ON room_messages(room_id, thread_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_messages_realtime_optimized 
ON room_messages(room_id, is_ai_response, created_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_participants_active 
ON room_participants(room_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_participants_session 
ON room_participants(room_id, session_id, display_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_updated 
ON chat_sessions(user_id, updated_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rooms_active_by_user 
ON rooms(created_by, expires_at) WHERE expires_at > NOW();

-- Consolidated dashboard query function
CREATE OR REPLACE FUNCTION get_user_dashboard_complete(user_id_param uuid)
RETURNS TABLE (
  -- Chat sessions
  chat_sessions jsonb,
  -- User rooms
  user_rooms jsonb,
  -- Documents
  user_documents jsonb,
  -- Room chat data
  room_chats jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Chat sessions with message counts
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cs.id,
          'chat_title', cs.chat_title,
          'created_at', cs.created_at,
          'updated_at', cs.updated_at,
          'message_count', COALESCE(msg_counts.count, 0),
          'first_message', msg_counts.first_message
        )
      )
      FROM chat_sessions cs
      LEFT JOIN (
        SELECT 
          chat_session_id,
          COUNT(*) as count,
          MIN(CASE WHEN is_user_message THEN content END) as first_message
        FROM chat_messages 
        GROUP BY chat_session_id
      ) msg_counts ON cs.id = msg_counts.chat_session_id
      WHERE cs.user_id = user_id_param
      ORDER BY cs.updated_at DESC
      LIMIT 50
    ) as chat_sessions,
    
    -- User rooms with participant counts
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'shareCode', r.share_code,
          'maxParticipants', r.max_participants,
          'tier', r.creator_tier,
          'expiresAt', r.expires_at,
          'createdAt', r.created_at,
          'isCreator', (r.created_by = user_id_param),
          'participantCount', COALESCE(part_counts.count, 0)
        )
      )
      FROM rooms r
      LEFT JOIN (
        SELECT room_id, COUNT(*) as count
        FROM room_participants
        GROUP BY room_id
      ) part_counts ON r.id = part_counts.room_id
      WHERE (
        r.created_by = user_id_param
        OR EXISTS (
          SELECT 1 FROM room_participants rp 
          WHERE rp.room_id = r.id AND rp.user_id = user_id_param
        )
      )
      AND r.expires_at > NOW()
      ORDER BY r.created_at DESC
    ) as user_rooms,
    
    -- User documents
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ud.id,
          'title', ud.title,
          'totalPages', ud.total_pages,
          'filterTags', ud.filter_tags,
          'createdAt', ud.created_at,
          'aiTitle', ud.ai_title,
          'aiDescription', ud.ai_description
        )
      )
      FROM user_documents ud
      WHERE ud.user_id = user_id_param
      ORDER BY ud.created_at DESC
      LIMIT 20
    ) as user_documents,
    
    -- Room chat threads with message counts
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'threadId', rm.thread_id,
          'roomId', rm.room_id,
          'roomName', r.name,
          'shareCode', r.share_code,
          'messageCount', thread_counts.count,
          'lastMessage', thread_counts.last_message,
          'lastMessageAt', thread_counts.last_message_at,
          'firstMessage', thread_counts.first_message
        )
      )
      FROM (
        SELECT DISTINCT thread_id, room_id
        FROM room_messages rm2
        WHERE EXISTS (
          SELECT 1 FROM room_participants rp2
          WHERE rp2.room_id = rm2.room_id 
          AND rp2.user_id = user_id_param
        )
      ) rm
      JOIN rooms r ON rm.room_id = r.id
      LEFT JOIN (
        SELECT 
          thread_id,
          COUNT(*) as count,
          MAX(content) as last_message,
          MAX(created_at) as last_message_at,
          MIN(CASE WHEN NOT is_ai_response THEN content END) as first_message
        FROM room_messages
        GROUP BY thread_id
      ) thread_counts ON rm.thread_id = thread_counts.thread_id
      WHERE r.expires_at > NOW()
      ORDER BY thread_counts.last_message_at DESC NULLS LAST
      LIMIT 30
    ) as room_chats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimized RLS policies for better performance with indexes
DROP POLICY IF EXISTS "Users can view their own chat messages" ON chat_messages;
CREATE POLICY "Users can view their own chat messages" ON chat_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_sessions 
    WHERE id = chat_session_id 
    AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Participants can read room messages" ON room_messages;
CREATE POLICY "Participants can read room messages" ON room_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM room_participants rp 
    WHERE rp.room_id = room_messages.room_id 
    AND (rp.user_id = auth.uid() OR rp.session_id = current_setting('app.session_id', true))
  )
);

-- Connection pooling configuration (for production)
-- Note: This would typically be configured at the database level
COMMENT ON FUNCTION get_user_dashboard_complete IS 
'Consolidated dashboard query function optimized for Socket.IO realtime system. 
Reduces multiple queries to a single function call for better performance.';

COMMIT;