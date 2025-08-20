import { Suspense } from 'react';
import RemovedFromRoomHandler from '@/app/chat/room/[shareCode]/components/RemovedFromRoomHandler';

interface RemovedPageProps {
  params: Promise<{ shareCode: string }>;
  searchParams: Promise<{ roomName?: string }>;
}

export default async function RemovedPage(props: RemovedPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  const { shareCode } = params;
  const roomName = searchParams.roomName || 'Unknown Room';

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RemovedFromRoomHandler 
        shareCode={shareCode}
        roomName={roomName}
      />
    </Suspense>
  );
}