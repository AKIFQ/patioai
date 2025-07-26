import ChatComponent from '../../components/Chat';
import { cookies } from 'next/headers';
import { fetchRoomMessages, getRoomInfo } from './fetch';
import { getUserInfo } from '@/lib/server/supabase';
import { redirect } from 'next/navigation';

export default async function RoomChatPage(props: {
    params: Promise<{ shareCode: string }>;
    searchParams: Promise<{ displayName?: string; sessionId?: string }>;
}) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { shareCode } = params;

    // Check if user has joined the room
    if (!searchParams.displayName || !searchParams.sessionId) {
        redirect(`/room/${shareCode}`);
    }

    const roomInfo = await getRoomInfo(shareCode);
    if (!roomInfo) {
        redirect(`/room/${shareCode}`);
    }

    const roomMessages = await fetchRoomMessages(shareCode);

    const cookieStore = await cookies();
    const modelType = cookieStore.get('modelType')?.value ?? 'standart';
    const selectedOption =
        cookieStore.get('selectedOption')?.value ?? 'gpt-3.5-turbo-1106';

    return (
        <div className="flex w-full h-[calc(100vh-48px)] overflow-hidden">
            <div className="flex-1">
                <ChatComponent
                    currentChat={roomMessages}
                    chatId={`room_${shareCode}`}
                    initialModelType={modelType}
                    initialSelectedOption={selectedOption}
                    roomContext={{
                        shareCode,
                        roomName: roomInfo.room.name,
                        displayName: searchParams.displayName,
                        sessionId: searchParams.sessionId,
                        participants: roomInfo.participants,
                        maxParticipants: roomInfo.room.maxParticipants,
                        tier: roomInfo.room.tier
                    }}
                />
            </div>
        </div>
    );
}