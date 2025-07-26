import ChatComponent from '../../components/Chat';
import { cookies } from 'next/headers';
import { fetchRoomMessages, getRoomInfo } from './fetch';
import { getUserInfo } from '@/lib/server/supabase';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureUserInRoom(shareCode: string, displayName: string, sessionId: string) {
    try {
        const roomInfo = await getRoomInfo(shareCode);
        if (!roomInfo) return;

        // Check if this session is already in the participants
        const { data: existingParticipant } = await (supabase as any)
            .from('room_participants')
            .select('session_id')
            .eq('room_id', roomInfo.room.id)
            .eq('session_id', sessionId)
            .single();

        // If not already a participant, add them
        if (!existingParticipant) {
            await (supabase as any)
                .from('room_participants')
                .insert({
                    room_id: roomInfo.room.id,
                    session_id: sessionId,
                    display_name: displayName
                });
        }
    } catch (error) {
        console.error('Error ensuring user in room:', error);
    }
}

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

    // Ensure the user is added to the room participants
    await ensureUserInRoom(shareCode, searchParams.displayName, searchParams.sessionId);

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