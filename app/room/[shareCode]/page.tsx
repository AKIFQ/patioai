import JoinRoomForm from './components/JoinRoomForm';
import { getUserInfo } from '@/lib/server/supabase';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RoomPageProps {
  params: Promise<{
    shareCode: string;
  }>;
}

async function getRoomInfo(shareCode: string) {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('share_code', shareCode)
    .single();

  if (error || !room) {
    return null;
  }

  // Check if room has expired
  const now = new Date();
  const expiresAt = new Date(room.expires_at);
  if (now > expiresAt) {
    return null;
  }

  return room;
}

async function autoJoinAuthenticatedUser(shareCode: string, userId: string, displayName: string) {
  const room = await getRoomInfo(shareCode);
  if (!room) return false;

  // Generate a session ID for the authenticated user
  const sessionId = `auth_${userId}`;

  try {
    // Check if user is already in the room
    const { data: existingParticipant } = await supabase
      .from('room_participants')
      .select('session_id')
      .eq('room_id', room.id)
      .eq('session_id', sessionId)
      .single();

    if (!existingParticipant) {
      // Check room capacity
      const { data: participants } = await supabase
        .from('room_participants')
        .select('session_id')
        .eq('room_id', room.id);

      if (participants && participants.length >= room.max_participants) {
        return false; // Room is full
      }

      // Add user to room
      const { error: insertError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          session_id: sessionId,
          display_name: displayName
        });

      if (insertError) {
        console.error('Error adding authenticated user to room:', insertError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error auto-joining authenticated user:', error);
    return false;
  }
}

export default async function RoomPage(props: RoomPageProps) {
  const params = await props.params;
  const { shareCode } = params;

  // Check if user is authenticated
  const userInfo = await getUserInfo();

  if (userInfo) {
    // User is authenticated, try to auto-join them
    const displayName = userInfo.full_name || userInfo.email?.split('@')[0] || 'User';
    const sessionId = `auth_${userInfo.id}`;
    
    const joinSuccess = await autoJoinAuthenticatedUser(shareCode, userInfo.id, displayName);
    
    if (joinSuccess) {
      // Redirect to chat interface with authenticated user context
      redirect(`/chat/room/${shareCode}?displayName=${encodeURIComponent(displayName)}&sessionId=${encodeURIComponent(sessionId)}`);
    }
  }

  // If user is not authenticated or auto-join failed, show join form
  return (
    <div className="min-h-screen bg-background">
      <JoinRoomForm shareCode={shareCode} />
    </div>
  );
}