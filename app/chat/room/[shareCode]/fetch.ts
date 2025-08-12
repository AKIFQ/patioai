import { createClient } from '@supabase/supabase-js';
import type { Message } from 'ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getRoomInfo(shareCode: string, currentUserId?: string) {
  try {
    // Try to use the database function first (bypasses RLS issues)
    try {
      const { data: roomData, error: functionError } = await (supabase as any)
        .rpc('get_room_info_by_share_code', { share_code_param: shareCode });

      if (!functionError && roomData && roomData.length > 0) {
        const room = roomData[0];
        
        // Check if room has expired
        if (room.is_expired) {
          console.error('Room has expired');
          return null;
        }

        // Try to get participant details
        let participants = [];
        try {
          const { data: participantData } = await (supabase as any)
            .from('room_participants')
            .select('session_id, display_name, joined_at, user_id')
            .eq('room_id', room.room_id)
            .order('joined_at', { ascending: true });

          if (participantData) {
            participants = participantData.map((p: any) => ({
              sessionId: p.session_id,
              displayName: p.display_name,
              joinedAt: p.joined_at,
              userId: p.user_id
            }));
          }
        } catch (error) {
          console.warn('Could not fetch participant details, using placeholder data');
          // Create placeholder participants based on count
          participants = Array(room.participant_count).fill(null).map((_, index) => ({
            sessionId: `placeholder_${index}`,
            displayName: 'Participant',
            joinedAt: new Date().toISOString(),
            userId: null
          }));
        }

        return {
          room: {
            id: room.room_id,
            name: room.room_name,
            shareCode: room.share_code,
            maxParticipants: room.max_participants,
            tier: room.creator_tier,
            expiresAt: room.expires_at,
            createdAt: room.created_at,
            createdBy: currentUserId && room.created_by === currentUserId ? room.created_by : undefined
          },
          participants: participants,
          participantCount: room.participant_count
        };
      }
    } catch (error) {
      console.warn('Database function not available, falling back to direct queries');
    }

    // Fallback to direct queries if function doesn't exist
    const { data: room, error: roomError } = await (supabase as any)
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
    let participants = [];
    let participantCount = 0;
    
    try {
      const { data: participantData, error: participantsError } = await (supabase as any)
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
        maxParticipants: room.max_participants,
        tier: room.creator_tier,
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

export async function fetchRoomMessages(shareCode: string, chatSessionId?: string): Promise<Message[]> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return [];
    }

    let query = (supabase as any)
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

export async function fetchRoomChatSessions(shareCode: string, userId?: string): Promise<any[]> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
      return [];
    }

    let query = (supabase as any)
      .from('room_chat_sessions')
      .select('id, chat_title, display_name, created_at, updated_at')
      .eq('room_id', roomInfo.room.id);

    // If userId is provided, filter to sessions where the user is a participant
    if (userId) {
      query = query.eq('session_id', `auth_${userId}`);
    }

    const { data: sessions, error } = await query
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching room chat sessions:', error);
      return [];
    }

    return sessions || [];
  } catch (error) {
    console.error('Error in fetchRoomChatSessions:', error);
    return [];
  }
}