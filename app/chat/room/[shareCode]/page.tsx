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

// Check if user is removed from room and redirect to removal page
async function checkUserRemovalStatus(shareCode: string, displayName: string, userId?: string) {
    try {
        const roomInfo = await getRoomInfo(shareCode);
        if (!roomInfo) return { isRemoved: false };

        // Check if user was removed from the room
        let removedParticipant = null;
        if (userId) {
            // Check by user_id for authenticated users
            const { data } = await (supabase as any)
                .from('removed_room_participants')
                .select('*')
                .eq('room_id', roomInfo.room.id)
                .eq('removed_user_id', userId)
                .single();
            removedParticipant = data;
        } else {
            // Check by display_name for anonymous users
            const { data } = await (supabase as any)
                .from('removed_room_participants')
                .select('*')
                .eq('room_id', roomInfo.room.id)
                .eq('removed_display_name', displayName)
                .single();
            removedParticipant = data;
        }

        if (removedParticipant) {
            return { 
                isRemoved: true, 
                roomName: roomInfo.room.name,
                shareCode: shareCode 
            };
        }

        return { isRemoved: false };
    } catch (error) {
        console.error('Error checking user removal status:', error);
        return { isRemoved: false };
    }
}

// Ensure user is properly added to room with correct user_id (only if not removed)
async function ensureUserInRoom(shareCode: string, displayName: string, userId?: string) {
    try {
        const roomInfo = await getRoomInfo(shareCode);
        if (!roomInfo) return;

        // First check if user was removed from the room
        const removalStatus = await checkUserRemovalStatus(shareCode, displayName, userId);
        if (removalStatus.isRemoved) {
            throw new Error('REMOVED_FROM_ROOM');
        }

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
        if (error.message === 'REMOVED_FROM_ROOM') {
            throw error;
        }
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
    console.log('🔍 URL Search Params:', { threadId: searchParams.threadId, chatSession: searchParams.chatSession, chatSessionId });
    if (!chatSessionId) {
        // Always generate a new thread ID - no persistent main thread
        // This ensures every room entry starts a fresh conversation
        chatSessionId = crypto.randomUUID();
        console.log('🆕 Generated new thread for room entry:', chatSessionId);
    } else {
        console.log('📌 Using existing thread ID from URL:', chatSessionId);
    }

    // Get current user info to check if they're the creator
    const userInfo = await getUserInfo();

    // Check if user was removed from the room and redirect if so
    try {
        const removalStatus = await checkUserRemovalStatus(shareCode, searchParams.displayName, userInfo?.id);
        if (removalStatus.isRemoved) {
            redirect(`/room/${shareCode}/removed?roomName=${encodeURIComponent(removalStatus.roomName || 'Unknown Room')}`);
        }
    } catch (error) {
        console.error('Error checking removal status:', error);
    }

    // Ensure the user is added to the room participants (only if not removed)
    try {
        await ensureUserInRoom(shareCode, searchParams.displayName, userInfo?.id);
    } catch (error) {
        if (error.message === 'REMOVED_FROM_ROOM') {
            const roomInfo = await getRoomInfo(shareCode);
            redirect(`/room/${shareCode}/removed?roomName=${encodeURIComponent(roomInfo?.room.name || 'Unknown Room')}`);
        }
        console.error('Error ensuring user in room:', error);
    }

        const roomInfo = await getRoomInfo(shareCode, userInfo?.id);
    
    // If user just signed in (has auth but was previously anonymous), update their participant record
    if (userInfo && searchParams.sessionId?.startsWith('session_')) {
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
            displayName: userInfo.full_name || userInfo.email?.split('@')[0] || searchParams.displayName
          })
        });
      } catch (error) {
        console.warn('Could not update participant record:', error);
      }
    }
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
      // For anonymous users, fetch room threads and create sidebar data
      let roomThreads = [];
      
      try {
        const threadsResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/rooms/${shareCode}/threads?displayName=${encodeURIComponent(searchParams.displayName)}`,
          { cache: 'no-store' }
        );
        
        if (threadsResponse.ok) {
          const threadsData = await threadsResponse.json();
          roomThreads = threadsData.threads || [];
        }
      } catch (error) {
        console.warn('Failed to fetch room threads for anonymous user:', error);
      }

      // Create chat previews from room threads
      const roomChatPreviews = roomThreads.map((thread: any) => ({
        id: thread.threadId,
        firstMessage: thread.firstMessage || 'No messages yet',
        created_at: thread.createdAt,
        type: 'room' as const,
        roomName: roomInfo.room.name,
        shareCode: roomInfo.room.shareCode
      }));

      finalSidebarData = {
        userInfo: {
          id: '',
          full_name: searchParams.displayName,
          email: ''
        },
        initialChatPreviews: roomChatPreviews,
        categorizedChats: { 
          today: roomChatPreviews.filter((chat: any) => {
            const chatDate = new Date(chat.created_at);
            const today = new Date();
            return chatDate.toDateString() === today.toDateString();
          }),
          yesterday: roomChatPreviews.filter((chat: any) => {
            const chatDate = new Date(chat.created_at);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return chatDate.toDateString() === yesterday.toDateString();
          }),
          last7Days: roomChatPreviews.filter((chat: any) => {
            const chatDate = new Date(chat.created_at);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return chatDate >= weekAgo && chatDate < new Date();
          }),
          last30Days: roomChatPreviews.filter((chat: any) => {
            const chatDate = new Date(chat.created_at);
            const monthAgo = new Date();
            monthAgo.setDate(monthAgo.getDate() - 30);
            return chatDate >= monthAgo && chatDate < new Date();
          }),
          last2Months: roomChatPreviews.filter((chat: any) => {
            const chatDate = new Date(chat.created_at);
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
            return chatDate >= twoMonthsAgo && chatDate < new Date();
          }),
          older: roomChatPreviews.filter((chat: any) => {
            const chatDate = new Date(chat.created_at);
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
            return chatDate < twoMonthsAgo;
          })
        },
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
        roomChatsData: roomThreads
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