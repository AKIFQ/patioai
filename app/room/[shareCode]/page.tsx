import JoinRoomForm from './components/JoinRoomForm';

interface RoomPageProps {
  params: Promise<{
    shareCode: string;
  }>;
}

export default async function RoomPage(props: RoomPageProps) {
  const params = await props.params;
  const { shareCode } = params;

  return (
    <div className="min-h-screen bg-background">
      <JoinRoomForm shareCode={shareCode} />
    </div>
  );
}