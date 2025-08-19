import JoinRoomForm from './components/JoinRoomForm';
import { getUserInfo } from '@/lib/server/supabase';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import ExpiredRoomHandler from '@/app/chat/room/[shareCode]/components/ExpiredRoomHandler';

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
    return { ...room, expired: true };
  }

  return { ...room, expired: false };
}

async function autoJoinAuthenticatedUser(shareCode: string, userId: string, displayName: string) {
  const room = await getRoomInfo(shareCode);
  if (!room || room.expired) return false;

  // Since all rooms now require passwords, we can't auto-join without password verification
  // This ensures security and consistency across all join methods
  return false;
}

export default async function RoomPage(props: RoomPageProps) {
  const params = await props.params;
  const { shareCode } = params;

  // Check if user is authenticated
  const userInfo = await getUserInfo();

  // Check room status first
  const roomInfo = await getRoomInfo(shareCode);
  
  if (!roomInfo) {
    // Room not found
    redirect('/chat');
  }

  if (roomInfo.expired) {
    // Room is expired, show modal
    const isCreator = userInfo && roomInfo.created_by === userInfo.id;
    return (
      <ExpiredRoomHandler 
        shareCode={shareCode}
        roomName={roomInfo.name || 'Unknown Room'}
        isCreator={isCreator || false}
      />
    );
  }

  // Since all rooms now require passwords, always show the join form
  // This ensures password verification for all users (authenticated or not)
  return (
    <div className="min-h-screen bg-background">
      <JoinRoomForm shareCode={shareCode} />
    </div>
  );
}