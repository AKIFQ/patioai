import { createClient } from '@/lib/client/client';
import type { Message } from 'ai';

const supabase = createClient();

export async function getRoomInfo(shareCode: string, currentUserId?: string) {
  try {
    // Direct query to rooms table
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      console.error('Room not found or error:', roomError);
      return null;
    }

    // Check if room has expired
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
      console.error('Room has expired');
      return null;
    }

    // Try to get participants with fallback handling
    let participants: Array<{
      sessionId: string;
      displayName: string;
      joinedAt: string;
      userId: string | null;
    }> = [];
    let participantCount = 0;
    
    try {
      const { data: participantData, error: participantsError } = await supabase
        .from('room_participants')
        .select('session_id, display_name, joined_at, user_id')
        .eq('room_id', room.id)
        .order('joined_at', { ascending: true });

      if (!participantsError && participantData) {
        participants = participantData.map((p: any) => ({
          sessionId: p.session_id,
          displayName: p.display_name,
          joinedAt: p.joined_at,
          userId: p.user_id
        }));
        participantCount = participants.length;
      }
    } catch (error) {
      console.warn('Could not fetch participants due to RLS policies');
      participants = [];
      participantCount = 0;
    }

    return {
      room: {
        id: room.id,
        name: room.name,
        shareCode: room.share_code,
        maxParticipants: 10, // Default value since column doesn't exist
        tier: 'free', // Default value since column doesn't exist
        expiresAt: room.expires_at,
        createdAt: room.created_at,
        createdBy: currentUserId && room.created_by === currentUserId ? room.created_by : undefined
      },
      participants: participants,
      participantCount: participantCount
    };
  } catch (error) {
    console.error('Error fetching room info:', error);
    return null;
  }
}

export interface PaginatedMessages {
  messages: Message[];
  hasMore: boolean;
  nextCursor?: string;
  totalCount?: number;
}

export async function fetchRoomMessages(shareCode: string, chatSessionId?: string): Promise<Message[]> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return [];
    }

    let query = supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', roomInfo.room.id);

    // If chatSessionId is provided, filter by it (correct column is thread_id)
    if (chatSessionId) {
      query = query.eq('thread_id', chatSessionId);
    }

    const { data: messages, error } = await query
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching room messages:', error);
      return [];
    }

    // Convert room messages to Enhanced Message format (with senderName/reasoning/sources)
    return (messages || []).map((msg: any) => ({
      id: msg.id,
      role: msg.is_ai_response ? 'assistant' : 'user',
      content: msg.content || '',
      createdAt: new Date(msg.created_at),
      // Extra fields consumed by the room UI
      ...(msg.sender_name && { senderName: msg.sender_name }),
      ...(msg.reasoning && { reasoning: msg.reasoning }),
      ...(msg.sources && { sources: typeof msg.sources === 'string' ? JSON.parse(msg.sources) : msg.sources })
    })) as unknown as Message[];
  } catch (error) {
    console.error('Error in fetchRoomMessages:', error);
    return [];
  }
}

export async function fetchRoomMessagesPaginated(
  shareCode: string, 
  chatSessionId?: string,
  cursor?: string,
  limit: number = 50
): Promise<PaginatedMessages> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return { messages: [], hasMore: false };
    }

    let query = supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', roomInfo.room.id);

    // If chatSessionId is provided, filter by it (correct column is thread_id)
    if (chatSessionId) {
      query = query.eq('thread_id', chatSessionId);
    }

    // For cursor-based pagination, we'll use created_at timestamp
    if (cursor) {
      // When loading older messages, we want messages created BEFORE the cursor
      query = query.lt('created_at', cursor);
    }

    // Order by created_at descending to get latest messages first, then reverse
    const { data: messages, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Get one extra to check if there are more

    if (error) {
      console.error('Error fetching paginated room messages:', error);
      return { messages: [], hasMore: false };
    }

    if (!messages || messages.length === 0) {
      return { messages: [], hasMore: false };
    }

    // Check if there are more messages
    const hasMore = messages.length > limit;
    const actualMessages = hasMore ? messages.slice(0, limit) : messages;

    // Get the cursor for the next page (oldest message's timestamp)
    const nextCursor = hasMore ? actualMessages[actualMessages.length - 1].created_at : undefined;

    // Reverse the messages to display in chronological order (oldest first)
    const chronologicalMessages = actualMessages.reverse();

    // Convert room messages to Enhanced Message format
    const formattedMessages = chronologicalMessages.map((msg: any) => ({
      id: msg.id,
      role: msg.is_ai_response ? 'assistant' : 'user',
      content: msg.content || '',
      createdAt: new Date(msg.created_at),
      // Extra fields consumed by the room UI
      ...(msg.sender_name && { senderName: msg.sender_name }),
      ...(msg.reasoning && { reasoning: msg.reasoning }),
      ...(msg.sources && { sources: typeof msg.sources === 'string' ? JSON.parse(msg.sources) : msg.sources })
    })) as unknown as Message[];

    return {
      messages: formattedMessages,
      hasMore,
      nextCursor,
      totalCount: undefined // We could add a count query if needed
    };
  } catch (error) {
    console.error('Error in fetchRoomMessagesPaginated:', error);
    return { messages: [], hasMore: false };
  }
}

export async function fetchRoomChatSessions(shareCode: string, userId?: string): Promise<any[]> {
  // Note: room_chat_sessions table doesn't exist in current schema
  // This function is disabled until the proper table is created
  console.warn('fetchRoomChatSessions: room_chat_sessions table not found in schema');
  return [];
}