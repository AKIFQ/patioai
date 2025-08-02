-- Database optimizations for Socket.IO integration
-- These optimizations improve query performance for real-time operations

-- Add indexes for frequently queried columns in Socket.IO operations
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created 
  ON chat_messages(chat_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_thread 
  ON room_messages(room_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_participants_room_active 
  ON room_participants(room_id, joined_at DESC) 
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated 
  ON chat_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rooms_share_code_active 
  ON rooms(share_code) 
  WHERE expires_at > NOW();

-- Optimize room lookup with composite index
CREATE INDEX IF NOT EXISTS idx_rooms_share_code_expires 
  ON rooms(share_code, expires_at, max_participants);

-- Add partial index for active room participants
CREATE INDEX IF NOT EXISTS idx_room_participants_active 
  ON room_participants(room_id, display_name, joined_at) 
  WHERE left_at IS NULL;

-- Optimize sidebar queries with user-specific indexes
CREATE INDEX IF NOT EXISTS idx_user_documents_user_created 
  ON user_documents(user_id, created_at DESC);

-- Add function for efficient room participant counting
CREATE OR REPLACE FUNCTION get_active_participant_count(room_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM room_participants 
    WHERE room_id = room_uuid 
    AND left_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Add function for efficient user room lookup
CREATE OR REPLACE FUNCTION get_user_rooms_optimized(user_id_param TEXT)
RETURNS TABLE(
  share_code TEXT,
  name TEXT,
  participant_count INTEGER,
  max_participants INTEGER,
  expires_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.share_code,
    r.name,
    get_active_participant_count(r.id) as participant_count,
    r.max_participants,
    r.expires_at,
    (
      SELECT MAX(rm.created_at)
      FROM room_messages rm
      WHERE rm.room_id = r.id
    ) as last_message_at
  FROM rooms r
  INNER JOIN room_participants rp ON r.id = rp.room_id
  WHERE rp.user_id = user_id_param
  AND rp.left_at IS NULL
  AND r.expires_at > NOW()
  ORDER BY last_message_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add function for efficient sidebar data retrieval
CREATE OR REPLACE FUNCTION get_sidebar_data_optimized(user_id_param TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'chatSessions', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', cs.id,
          'chat_title', cs.chat_title,
          'created_at', cs.created_at,
          'updated_at', cs.updated_at,
          'message_count', (
            SELECT COUNT(*) 
            FROM chat_messages cm 
            WHERE cm.chat_session_id = cs.id
          )
        ) ORDER BY cs.updated_at DESC
      ), '[]'::json)
      FROM chat_sessions cs
      WHERE cs.user_id = user_id_param
      LIMIT 50
    ),
    'rooms', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'shareCode', share_code,
          'name', name,
          'participantCount', participant_count,
          'maxParticipants', max_participants,
          'expiresAt', expires_at,
          'lastMessageAt', last_message_at
        ) ORDER BY last_message_at DESC NULLS LAST
      ), '[]'::json)
      FROM get_user_rooms_optimized(user_id_param)
    ),
    'documents', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ud.id,
          'title', ud.title,
          'totalPages', ud.total_pages,
          'filterTags', ud.filter_tags,
          'createdAt', ud.created_at
        ) ORDER BY ud.created_at DESC
      ), '[]'::json)
      FROM user_documents ud
      WHERE ud.user_id = user_id_param
      LIMIT 20
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add materialized view for frequently accessed room statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS room_stats AS
SELECT 
  r.id,
  r.share_code,
  r.name,
  COUNT(DISTINCT rp.user_id) FILTER (WHERE rp.left_at IS NULL) as active_participants,
  r.max_participants,
  MAX(rm.created_at) as last_message_at,
  COUNT(rm.id) as total_messages,
  r.expires_at,
  r.created_at
FROM rooms r
LEFT JOIN room_participants rp ON r.id = rp.room_id
LEFT JOIN room_messages rm ON r.id = rm.room_id
WHERE r.expires_at > NOW()
GROUP BY r.id, r.share_code, r.name, r.max_participants, r.expires_at, r.created_at;

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_stats_id ON room_stats(id);
CREATE INDEX IF NOT EXISTS idx_room_stats_share_code ON room_stats(share_code);

-- Function to refresh room stats (call this periodically or on significant changes)
CREATE OR REPLACE FUNCTION refresh_room_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY room_stats;
END;
$$ LANGUAGE plpgsql;