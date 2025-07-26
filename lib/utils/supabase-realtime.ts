import { createClient } from '@/lib/client/client';

export function subscribeToRoomMessages(
  roomId: string,
  onMessage: (message: any) => void,
  onError?: (error: any) => void
) {
  const supabase = createClient();
  
  const channel = supabase
    .channel(`room-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'room_messages',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        onMessage(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to room messages:', roomId);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Error subscribing to room messages:', roomId);
        onError?.(status);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToRoomParticipants(
  roomId: string,
  onParticipantChange: (change: any) => void,
  onError?: (error: any) => void
) {
  const supabase = createClient();
  
  const channel = supabase
    .channel(`room-participants-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_participants',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        onParticipantChange(payload);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to room participants:', roomId);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Error subscribing to room participants:', roomId);
        onError?.(status);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}