import { cookies } from 'next/headers';
import { fetchRoomMessages, getRoomInfo } from './fetch';
import { getUserInfo } from '@/lib/server/supabase';
// Removed unused UUID import
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import RoomChatWrapper from './components/RoomChatWrapper';
import ExpiredRoomHandler from './components/ExpiredRoomHandler';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Check if room is expired
async function checkRoomExpiration(shareCode: string) {
    try {
        const { data: room, error } = await supabase
            .from('rooms')
            .select('name, expires_at, created_by')
            .eq('share_code', shareCode)
            .single();

        if (error || !room) {
            return { expired: false, notFound: true };
        }

        const now = new Date();
        const expiresAt = new Date(room.expires_at);
        const isExpired = now > expiresAt;

        return {
            expired: isExpired,
            notFound: false,
            roomName: room.name,
            createdBy: room.created_by
        };
    } catch (error) {
        return { expired: false, notFound: true };
    }
}

// Ensure user is properly added to room with correct user_id
async function ensureUserInRoom(shareCode: string, displayName: string, userId?: string) {
    try {
        const roomInfo = await getRoomInfo(shareCode);
        if (!roomInfo) return;

        // Check if user is already a participant (by user_id if authenticated, or display_name if anonymous)
        let existingParticipant;
        if (userId) {
            // For authenticated users, check by user_id
            const { data } = await (supabase as any)
                .from('room_participants')
                .select('*')
                .eq('room_id', roomInfo.room.id)
                .eq('user_id', userId)
                .single();
            existingParticipant = data;
        } else {
            // For anonymous users, check by display_name
            const { data } = await (supabase as any)
                .from('room_participants')
                .select('*')
                .eq('room_id', roomInfo.room.id)
                .eq('display_name', displayName)
                .single();
            existingParticipant = data;
        }

        if (!existingParticipant) {
            // Add new participant with proper user linking
            await (supabase as any)
                .from('room_participants')
                .insert({
                    room_id: roomInfo.room.id,
                    session_id: userId ? `auth_${userId}` : displayName,
                    display_name: displayName,
                    user_id: userId || null // Link to authenticated user if available
                });

            console.log('Added user to room:', { userId, displayName, roomId: roomInfo.room.id });
        } else {
            console.log('User already in room:', { userId, displayName });
        }
    } catch (error) {
        console.error('Error ensuring user in room:', error);
    }
}

export default async function RoomChatPage(props: {
    params: Promise<{ shareCode: string }>;
    searchParams: Promise<{ displayName?: string; sessionId?: string; threadId?: string; loadHistory?: string; chatSession?: string }>;
    sidebarData?: any;
}) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { shareCode } = params;

    // Check if user has joined the room
    if (!searchParams.displayName) {
        redirect(`/room/${shareCode}`);
    }

    // Check if room is expired first
    const expirationCheck = await checkRoomExpiration(shareCode);

    if (expirationCheck.notFound) {
        redirect(`/chat`);
    }

    if (expirationCheck.expired) {
        const userInfo = await getUserInfo();
        const isCreator = userInfo && expirationCheck.createdBy === userInfo.id;

        return (
            <ExpiredRoomHandler
                shareCode={shareCode}
                roomName={expirationCheck.roomName || 'Unknown Room'}
                isCreator={isCreator || false}
            />
        );
    }

    // Get thread ID from URL (prioritize threadId over legacy chatSession)
    let chatSessionId = searchParams.threadId || searchParams.chatSession;
    if (!chatSessionId) {
        // Always generate a new thread ID - no persistent main thread
        // This ensures every room entry starts a fresh conversation
        chatSessionId = crypto.randomUUID();
        console.log('🆕 Generated new thread for room entry:', chatSessionId);
    }

    // Get current user info to check if they're the creator
    const userInfo = await getUserInfo();

    // Ensure the user is added to the room participants
    await ensureUserInRoom(shareCode, searchParams.displayName, userInfo?.id);

    // If user just signed in (has auth but was previously anonymous), update their participant record
    if (userInfo && searchParams.sessionId && searchParams.sessionId.startsWith('session_')) {
        try {
            // Update the anonymous participant to authenticated
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/rooms/update-participant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomId: roomInfo?.room.id,
                    sessionId: searchParams.sessionId,
                    displayName: userInfo.user_metadata?.full_name || userInfo.email?.split('@')[0] || searchParams.displayName
                })
            });
        } catch (error) {
            console.warn('Could not update participant record:', error);
        }
    }

    const roomInfo = await getRoomInfo(shareCode, userInfo?.id);
    if (!roomInfo) {
        // Room not found or deleted - redirect to main chat page
        redirect(`/chat`);
    }

    // Load messages for the specific thread only
    let roomMessages: any[] = [];

    try {
        // Load messages for this specific thread only
        const { data: threadMessages } = await (supabase as any)
            .from('room_messages')
            .select('*')
            .eq('room_id', roomInfo.room.id)
            .eq('thread_id', chatSessionId) // Filter by specific thread
            .order('created_at', { ascending: true });

        if (threadMessages && threadMessages.length > 0) {
            // Convert to Message format
            roomMessages = threadMessages.map((msg: any) => ({
                id: msg.id,
                role: msg.is_ai_response ? 'assistant' : 'user',
                content: msg.content || '',
                createdAt: new Date(msg.created_at),
                // Preserve sender information for proper message alignment
                ...(msg.sender_name && { senderName: msg.sender_name }),
                ...(msg.reasoning && { reasoning: msg.reasoning }),
                ...(msg.sources && { sources: typeof msg.sources === 'string' ? JSON.parse(msg.sources) : msg.sources })
            }));

            console.log(`Loaded messages for thread ${chatSessionId}:`, roomMessages.length);
        } else {
            console.log(`No messages found for thread ${chatSessionId}`);
        }
    } catch (error) {
        console.error('Error loading room messages:', error);
        roomMessages = [];
    }

    const cookieStore = await cookies();
    const modelType = cookieStore.get('modelType')?.value ?? 'standart';
    const selectedOption =
        cookieStore.get('selectedOption')?.value ?? 'gpt-3.5-turbo-1106';

    console.log('Room page rendering with chatSessionId:', chatSessionId);
    console.log('Room messages count:', roomMessages.length);

    // Create sidebar data for anonymous users
    let finalSidebarData = props.sidebarData;

    if (!userInfo && searchParams.displayName) {
        // For anonymous users, create minimal sidebar data with room info
        finalSidebarData = {
            userInfo: {
                id: '',
                full_name: searchParams.displayName,
                email: ''
            },
            initialChatPreviews: [],
            categorizedChats: { today: [], yesterday: [], last7Days: [], last30Days: [], last2Months: [], older: [] },
            documents: [],
            rooms: [{
                shareCode: roomInfo.room.shareCode,
                name: roomInfo.room.name,
                id: roomInfo.room.id,
                maxParticipants: roomInfo.room.maxParticipants,
                tier: roomInfo.room.tier,
                expiresAt: roomInfo.room.expiresAt,
                createdAt: roomInfo.room.createdAt
            }],
            roomChatsData: []
        };
    }

    return (
        <RoomChatWrapper
            shareCode={shareCode}
            roomInfo={roomInfo}
            initialMessages={roomMessages}
            initialModelType={modelType}
            initialSelectedOption={selectedOption}
            userData={userInfo}
            sidebarData={finalSidebarData}
        />
    );
}