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

        // Get authenticated user info if available
        const userInfo = await getUserInfo();

        // Check if this session is already in the participants
        const { data: existingParticipant } = await (supabase as any)
            .from('room_participants')
            .select('session_id, user_id')
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
                    display_name: displayName,
                    user_id: userInfo?.id || null // Link to authenticated user
                });
        } else {
            // Update display name, last seen, and user_id if participant exists
            await (supabase as any)
                .from('room_participants')
                .update({
                    display_name: displayName,
                    user_id: userInfo?.id || existingParticipant.user_id, // Preserve or set user_id
                    joined_at: new Date().toISOString() // Update last seen
                })
                .eq('room_id', roomInfo.room.id)
                .eq('session_id', sessionId);
        }
    } catch (error) {
        console.error('Error ensuring user in room:', error);
    }
}

export default async function RoomChatPage(props: {
    params: Promise<{ shareCode: string }>;
    searchParams: Promise<{ displayName?: string; sessionId?: string; loadHistory?: string; chatSession?: string }>;
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

    // Get current user info to check if they're the creator
    const userInfo = await getUserInfo();
    
    const roomInfo = await getRoomInfo(shareCode, userInfo?.id);
    if (!roomInfo) {
        // Room not found or deleted - redirect to main chat page
        redirect(`/chat`);
    }

    // Load messages based on context:
    // 1. If chatSession is specified, load that specific session
    // 2. If loadHistory is true, load all room messages (legacy)
    // 3. Otherwise load recent room messages (default behavior)
    let roomMessages: any[] = [];
    if (searchParams.chatSession) {
        // Check if this is a legacy session (virtual session for old messages)
        if (searchParams.chatSession.startsWith('legacy_')) {
            // Extract sender name from legacy session ID
            const parts = searchParams.chatSession.split('_');
            const encodedSenderName = parts.slice(2).join('_'); // Handle names with underscores
            const senderName = decodeURIComponent(encodedSenderName); // Decode URL encoding
            
            // Load legacy messages for this sender
            try {
                const { data: legacyMessages } = await (supabase as any)
                    .from('room_messages')
                    .select('*')
                    .eq('room_id', roomInfo.room.id)
                    .eq('sender_name', senderName)
                    .is('room_chat_session_id', null)
                    .order('created_at', { ascending: true });
                
                if (legacyMessages) {
                    // Convert to Message format
                    roomMessages = legacyMessages.map((msg: any) => ({
                        id: msg.id,
                        role: msg.is_ai_response ? 'assistant' : 'user',
                        content: msg.is_ai_response ? msg.content : `${msg.sender_name}: ${msg.content}`,
                        createdAt: new Date(msg.created_at)
                    }));
                }
            } catch (error) {
                console.error('Error loading legacy messages:', error);
            }
        } else {
            // Load specific chat session messages (new format)
            try {
                const { data: sessionMessages } = await (supabase as any)
                    .from('room_messages')
                    .select('*')
                    .eq('room_chat_session_id', searchParams.chatSession)
                    .order('created_at', { ascending: true });
                
                if (sessionMessages) {
                    // Convert to Message format
                    roomMessages = sessionMessages.map((msg: any) => ({
                        id: msg.id,
                        role: msg.is_ai_response ? 'assistant' : 'user',
                        content: msg.is_ai_response ? msg.content : `${msg.sender_name}: ${msg.content}`,
                        createdAt: new Date(msg.created_at)
                    }));
                }
            } catch (error) {
                console.error('Error loading chat session:', error);
            }
        }
    } else if (searchParams.loadHistory === 'true') {
        // Load all room messages (legacy behavior)
        const fetchedMessages = await fetchRoomMessages(shareCode);
        roomMessages = fetchedMessages || [];
    } else {
        // Default: Load recent room messages (last 20 messages)
        const fetchedMessages = await fetchRoomMessages(shareCode);
        roomMessages = fetchedMessages || [];
    }

    const cookieStore = await cookies();
    const modelType = cookieStore.get('modelType')?.value ?? 'standart';
    const selectedOption =
        cookieStore.get('selectedOption')?.value ?? 'gpt-3.5-turbo-1106';

    return (
        <div className="flex w-full h-full overflow-hidden">
            <div className="flex-1">
                <ChatComponent
                    key={`room_${shareCode}_${searchParams.sessionId}_${searchParams.chatSession || 'default'}`}
                    currentChat={roomMessages}
                    chatId={searchParams.chatSession ? `room_session_${searchParams.chatSession}` : `room_${shareCode}_default`}
                    initialModelType={modelType}
                    initialSelectedOption={selectedOption}
                    roomContext={{
                        shareCode,
                        roomName: roomInfo.room.name,
                        displayName: searchParams.displayName,
                        sessionId: searchParams.sessionId,
                        participants: roomInfo.participants,
                        maxParticipants: roomInfo.room.maxParticipants,
                        tier: roomInfo.room.tier,
                        createdBy: roomInfo.room.createdBy,
                        expiresAt: roomInfo.room.expiresAt
                    }}
                />
            </div>
        </div>
    );
}