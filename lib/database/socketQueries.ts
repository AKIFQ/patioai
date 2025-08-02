import { createClient } from '@supabase/supabase-js';

// Optimized database queries for Socket.IO operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class SocketDatabaseService {
  // Optimized room validation with single query
  static async validateRoomAccess(shareCode: string): Promise<{
    valid: boolean;
    room?: any;
    error?: string;
  }> {
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .select(`
          id,
          name,
          share_code,
          max_participants,
          expires_at,
          created_at
        `)
        .eq('share_code', shareCode)
        .single();

      if (error) {
        return { valid: false, error: error.message };
      }

      if (!room) {
        return { valid: false, error: 'Room not found' };
      }

      // Check expiration
      if (new Date(room.expires_at) <= new Date()) {
        return { valid: false, error: 'Room has expired' };
      }

      // Get active participant count
      const { data: participants } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', room.id)
        .is('left_at', null);

      const activeParticipants = participants?.length || 0;

      // Check capacity
      if (activeParticipants >= room.max_participants) {
        return { valid: false, error: 'Room is full' };
      }

      return { 
        valid: true, 
        room: { ...room, active_participants: activeParticipants }
      };
    } catch (error) {
      console.error('Error validating room access:', error);
      return { valid: false, error: 'Database error' };
    }
  }

  // Batch insert room messages with optimized query
  static async insertRoomMessage(data: {
    roomId: string;
    threadId: string;
    senderName: string;
    content: string;
    isAiResponse: boolean;
    sources?: any[];
    reasoning?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { data: result, error } = await supabase
        .from('room_messages')
        .insert({
          room_id: data.roomId,
          thread_id: data.threadId,
          sender_name: data.senderName,
          content: data.content,
          is_ai_response: data.isAiResponse,
          sources: data.sources ? JSON.stringify(data.sources) : null,
          reasoning: data.reasoning || null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, messageId: result.id };
    } catch (error) {
      console.error('Error inserting room message:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Optimized participant management
  static async addRoomParticipant(data: {
    roomId: string;
    userId: string;
    displayName: string;
    sessionId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('room_participants')
        .upsert({
          room_id: data.roomId,
          user_id: data.userId,
          display_name: data.displayName,
          session_id: data.sessionId,
          joined_at: new Date().toISOString(),
          left_at: null
        }, {
          onConflict: 'room_id,user_id',
          ignoreDuplicates: false
        });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding room participant:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Optimized participant removal
  static async removeRoomParticipant(data: {
    roomId: string;
    userId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', data.roomId)
        .eq('user_id', data.userId)
        .is('left_at', null);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing room participant:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Get optimized sidebar data using the database function
  static async getSidebarData(userId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .rpc('get_sidebar_data_optimized', { user_id_param: userId });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error getting sidebar data:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Batch insert chat messages for better performance
  static async insertChatMessages(messages: Array<{
    chatSessionId: string;
    content: string;
    isUserMessage: boolean;
    attachments?: any[];
  }>): Promise<{ success: boolean; messageIds?: string[]; error?: string }> {
    try {
      const insertData = messages.map(msg => ({
        chat_session_id: msg.chatSessionId,
        content: msg.content,
        is_user_message: msg.isUserMessage,
        attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
        created_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('chat_messages')
        .insert(insertData)
        .select('id');

      if (error) {
        return { success: false, error: error.message };
      }

      return { 
        success: true, 
        messageIds: data?.map(row => row.id) || [] 
      };
    } catch (error) {
      console.error('Error inserting chat messages:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Optimized room statistics retrieval
  static async getRoomStats(shareCode: string): Promise<{
    success: boolean;
    stats?: any;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('room_stats')
        .select('*')
        .eq('share_code', shareCode)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, stats: data };
    } catch (error) {
      console.error('Error getting room stats:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Cleanup abandoned sessions with batch operations
  static async cleanupAbandonedSessions(userId: string): Promise<{
    success: boolean;
    cleanedCount?: number;
    error?: string;
  }> {
    try {
      // Find empty chat sessions older than 30 minutes
      const { data: emptySessions, error: findError } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .not('id', 'in', 
          supabase
            .from('chat_messages')
            .select('chat_session_id')
            .not('chat_session_id', 'is', null)
        );

      if (findError) {
        return { success: false, error: findError.message };
      }

      if (!emptySessions || emptySessions.length === 0) {
        return { success: true, cleanedCount: 0 };
      }

      // Delete empty sessions in batch
      const sessionIds = emptySessions.map(s => s.id);
      const { error: deleteError } = await supabase
        .from('chat_sessions')
        .delete()
        .in('id', sessionIds);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      return { success: true, cleanedCount: sessionIds.length };
    } catch (error) {
      console.error('Error cleaning up abandoned sessions:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Refresh materialized views for better performance
  static async refreshMaterializedViews(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { error } = await supabase.rpc('refresh_room_stats');

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error refreshing materialized views:', error);
      return { success: false, error: 'Database error' };
    }
  }
}

// Connection pool management
export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private connectionCount = 0;
  private maxConnections = 50;

  static getInstance(): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager();
    }
    return ConnectionPoolManager.instance;
  }

  async acquireConnection(): Promise<boolean> {
    if (this.connectionCount >= this.maxConnections) {
      return false;
    }
    this.connectionCount++;
    return true;
  }

  releaseConnection(): void {
    if (this.connectionCount > 0) {
      this.connectionCount--;
    }
  }

  getConnectionCount(): number {
    return this.connectionCount;
  }

  getMaxConnections(): number {
    return this.maxConnections;
  }

  setMaxConnections(max: number): void {
    this.maxConnections = max;
  }
}