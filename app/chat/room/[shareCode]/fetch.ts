import { createClient } from '@supabase/supabase-js';
import type { Message } from 'ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getRoomInfo(shareCode: string) {
  try {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return null;
    }

    // Check if room has expired
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
      return null;
    }

    // Get current participants
    const { data: participants, error: participantsError } = await supabase
      .from('room_participants')
      .select('display_name, joined_at')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return null;
    }

    return {
      room: {
        id: room.id,
        name: room.name,
        shareCode: room.share_code,
        maxParticipants: room.max_participants,
        tier: room.creator_tier,
        expiresAt: room.expires_at,
        createdAt: room.created_at
      },
      participants: participants || [],
      participantCount: participants?.length || 0
    };
  } catch (error) {
    console.error('Error fetching room info:', error);
    return null;
  }
}

export async function fetchRoomMessages(shareCode: string): Promise<Message[] | undefined> {
  try {
    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) return undefined;

    const { data: messages, error } = await supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', roomInfo.room.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Error fetching room messages:', error);
      return undefined;
    }

    if (!messages || messages.length === 0) {
      return [];
    }

    // Convert room messages to AI SDK Message format
    const formattedMessages: Message[] = [];

    for (const msg of messages) {
      if (msg.is_ai_response) {
        // AI message
        formattedMessages.push({
          id: msg.id,
          role: 'assistant',
          content: msg.content,
          createdAt: new Date(msg.created_at)
        });
      } else {
        // User message - format with sender name for room context
        formattedMessages.push({
          id: msg.id,
          role: 'user',
          content: `${msg.sender_name}: ${msg.content}`,
          createdAt: new Date(msg.created_at)
        });
      }
    }

    return formattedMessages;
  } catch (error) {
    console.error('Error in fetchRoomMessages:', error);
    return undefined;
  }
}