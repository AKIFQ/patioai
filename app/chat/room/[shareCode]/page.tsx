import ChatComponent from '../../components/Chat';
import { cookies } from 'next/headers';
import { fetchRoomMessages, getRoomInfo } from './fetch';
import { getUserInfo } from '@/lib/server/supabase';
// Removed unused UUID import
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import RoomChatWrapper from './components/RoomChatWrapper';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
}) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { shareCode } = params;

    // Check if user has joined the room
    if (!searchParams.displayName) {
        redirect(`/room/${shareCode}`);
    }

    // Get thread ID from URL (prioritize threadId over legacy chatSession)
    let chatSessionId = searchParams.threadId || searchParams.chatSession;
    if (!chatSessionId) {
        // Create deterministic main thread using a simple but valid UUID
        // Convert share code to a deterministic UUID
        const shareCodeHash = shareCode.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        const hashStr = Math.abs(shareCodeHash).toString(16).padStart(8, '0');
        chatSessionId = `${hashStr.substring(0, 8)}-0000-4000-8000-${hashStr.padEnd(12, '0').substring(0, 12)}`;
    }

    // Get current user info to check if they're the creator
    const userInfo = await getUserInfo();
    
    // Ensure the user is added to the room participants
    await ensureUserInRoom(shareCode, searchParams.displayName, userInfo?.id);
    
    const roomInfo = await getRoomInfo(shareCode, userInfo?.id);
    if (!roomInfo) {
        // Room not found or deleted - redirect to main chat page
        redirect(`/chat`);
    }

    // For group chat: Show all messages from all threads (like WhatsApp group)
    // This ensures new users see the complete chat history
    let roomMessages: any[] = [];
    
    try {
        // Load ALL messages from the room, regardless of thread
        // This gives new users the complete chat history
        const { data: allMessages } = await (supabase as any)
            .from('room_messages')
            .select('*')
            .eq('room_id', roomInfo.room.id)
            .order('created_at', { ascending: true });
        
        if (allMessages && allMessages.length > 0) {
            // Convert to Message format
            roomMessages = allMessages.map((msg: any) => ({
                id: msg.id,
                role: msg.is_ai_response ? 'assistant' : 'user',
                content: msg.is_ai_response ? msg.content : `${msg.sender_name}: ${msg.content}`,
                createdAt: new Date(msg.created_at)
            }));
            
            console.log('Loaded ALL room messages:', roomMessages.length);
        } else {
            console.log('No messages found in room');
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

    return (
        <RoomChatWrapper
            shareCode={shareCode}
            roomInfo={roomInfo}
            initialMessages={roomMessages}
            initialModelType={modelType}
            initialSelectedOption={selectedOption}
        />
    );
}