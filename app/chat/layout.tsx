// app/chat/[chatId]/layout.tsx
import React from 'react';
import { createServerSupabaseClient } from '@/lib/server/server';
import { getUserInfo } from '@/lib/server/supabase';
import ChatHistoryDrawer from './components/chat_history/ChatHistorySidebar';
import { unstable_noStore as noStore } from 'next/cache';
import { UploadProvider } from './context/uploadContext';
import { isToday, isYesterday, subDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { SidebarProvider } from '@/components/ui/sidebar';

export const maxDuration = 60;

interface ChatPreview {
  id: string;
  firstMessage: string;
  created_at: string;
}

interface CategorizedChats {
  today: ChatPreview[];
  yesterday: ChatPreview[];
  last7Days: ChatPreview[];
  last30Days: ChatPreview[];
  last2Months: ChatPreview[];
  older: ChatPreview[];
}

// Single combined query with proper authentication check
const fetchUserData = async () => {
  noStore();

  // First check if user is authenticated
  const userInfo = await getUserInfo();
  if (!userInfo) {
    return null;
  }

  const supabase = await createServerSupabaseClient();

  try {
    // Fetch chat sessions and documents for the authenticated user
    const { data: chatData, error: chatError } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        created_at,
        chat_title,
        first_message:chat_messages!inner(content)
      `)
      .eq('user_id', userInfo.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .limit(1, { foreignTable: 'chat_messages' });

    const { data: documentsData, error: docsError } = await supabase
      .from('user_documents')
      .select(`
        id,
        title,
        created_at,
        total_pages,
        filter_tags
      `)
      .eq('user_id', userInfo.id)
      .order('created_at', { ascending: false });

    // IMPROVED: Get rooms with accurate participant counts using database function
    let roomsData = [];

    try {
      const { data, error } = await (supabase as any)
        .rpc('get_user_rooms_with_counts', {
          user_id_param: userInfo.id
        });

      if (data && Array.isArray(data)) {
        roomsData = data
          .filter((room: any) => room.room_id) // Filter out any null/invalid rooms
          .map((room: any) => ({
            id: room.room_id,
            name: room.room_name,
            share_code: room.share_code,
            max_participants: room.max_participants,
            creator_tier: room.creator_tier,
            expires_at: room.expires_at,
            created_at: room.created_at,
            created_by: room.created_by,
            participant_count: room.participant_count,
            is_creator: room.is_creator,
            room_participants: new Array(room.participant_count).fill({ session_id: 'placeholder' }) // For compatibility
          }));
      }
    } catch (error) {
      // Fallback to empty array if function doesn't exist or fails
      console.warn('Could not fetch rooms with counts, using fallback method');
      roomsData = [];
    }
    // Note: We don't combine room errors since they're handled gracefully above

    // PERFORMANCE FIX: Fetch room chats with single optimized query
    let roomChatsData = [];
    let roomChatsError = null;

    if (roomsData && roomsData.length > 0) {
      const userRoomIds = roomsData.map((room: any) => room.id);

      try {
        // Single query to get the most recent message per room
        const { data, error } = await (supabase as any)
          .from('room_messages')
          .select(`
            id,
            created_at,
            content,
            sender_name,
            is_ai_response,
            room_id
          `)
          .in('room_id', userRoomIds)
          .order('created_at', { ascending: false })
          .limit(50); // Get more messages to ensure we have recent ones per room

        roomChatsData = data || [];
        roomChatsError = error;
      } catch (error) {
        // This is expected when RLS policies are working correctly
        roomChatsData = [];
        roomChatsError = null; // Don't treat this as an error
      }
    }

    // Only log critical errors that affect core functionality
    if (chatError) {
      console.error('Chat Error:', chatError);
    }
    if (docsError) {
      console.error('Documents Error:', docsError);
    }
    // Note: Room errors are handled gracefully above and don't need logging
    // since they're expected when RLS policies are working correctly

    // Transform chat data
    const chatPreviews = (chatData || []).map((session) => ({
      id: session.id,
      firstMessage:
        session.chat_title ??
        session.first_message[0]?.content ??
        'No messages yet',
      created_at: session.created_at,
      type: 'regular' as const
    }));

    // Transform room chat data and group by chat session
    const roomChatPreviews = [];
    const roomChatsGrouped = new Map();

    // Create a lookup map for room data
    const roomsLookup = new Map();
    (roomsData || []).forEach((room: any) => {
      roomsLookup.set(room.id, room);
    });

    // Group room messages by chat session
    (roomChatsData || []).forEach((msg: any) => {
      const roomData = roomsLookup.get(msg.room_id);
      
      if (roomData && roomData.share_code) {
        const sessionKey = msg.room_chat_session_id || `room_${msg.room_id}_default`;
        
        if (!roomChatsGrouped.has(sessionKey)) {
          // Use the first user message as the title, not AI responses
          const title = msg.is_ai_response ? 'Room Chat' : msg.content.substring(0, 50);
          
          roomChatsGrouped.set(sessionKey, {
            id: `room_session_${sessionKey}`,
            firstMessage: `${roomData.name}: ${title}`,
            created_at: msg.created_at,
            type: 'room' as const,
            roomName: roomData.name,
            shareCode: roomData.share_code,
            chatSessionId: msg.room_chat_session_id
          });
        }
      }
    });

    roomChatPreviews.push(...Array.from(roomChatsGrouped.values()));

    // Combine and sort all chats by date
    const allChatPreviews = [...chatPreviews, ...roomChatPreviews].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Transform documents data
    const documents = (documentsData || []).map((doc) => ({
      id: doc.id,
      title: doc.title,
      created_at: doc.created_at,
      total_pages: doc.total_pages,
      filter_tags: doc.filter_tags
    }));

    // Transform rooms data
    const rooms = (roomsData || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      shareCode: room.share_code,
      participantCount: room.participant_count || room.room_participants?.length || 0,
      maxParticipants: room.max_participants,
      tier: room.creator_tier as 'free' | 'pro',
      expiresAt: room.expires_at,
      createdAt: room.created_at,
      isCreator: room.is_creator !== undefined ? room.is_creator : (room.created_by === userInfo.id),
      joinedAs: room.joinedAs, // Display name when joined as participant
      joinedAt: room.joinedAt   // When joined as participant
    }));

    return {
      id: userInfo.id,
      full_name: userInfo.full_name,
      email: userInfo.email,
      chatPreviews,
      allChatPreviews,
      documents,
      rooms
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
};

function categorizeChats(chatPreviews: ChatPreview[]): CategorizedChats {
  const getZonedDate = (date: string) =>
    new TZDate(new Date(date), 'Europe/Copenhagen');

  const today = chatPreviews.filter((chat) =>
    isToday(getZonedDate(chat.created_at))
  );

  const yesterday = chatPreviews.filter((chat) =>
    isYesterday(getZonedDate(chat.created_at))
  );

  const last7Days = chatPreviews.filter((chat) => {
    const chatDate = getZonedDate(chat.created_at);
    const sevenDaysAgo = subDays(new Date(), 7);
    return (
      chatDate > sevenDaysAgo && !isToday(chatDate) && !isYesterday(chatDate)
    );
  });

  const last30Days = chatPreviews.filter((chat) => {
    const chatDate = getZonedDate(chat.created_at);
    const thirtyDaysAgo = subDays(new Date(), 30);
    const sevenDaysAgo = subDays(new Date(), 7);
    return chatDate > thirtyDaysAgo && chatDate <= sevenDaysAgo;
  });

  const last2Months = chatPreviews.filter((chat) => {
    const chatDate = getZonedDate(chat.created_at);
    const sixtyDaysAgo = subDays(new Date(), 60);
    const thirtyDaysAgo = subDays(new Date(), 30);
    return chatDate > sixtyDaysAgo && chatDate <= thirtyDaysAgo;
  });

  const older = chatPreviews.filter((chat) => {
    const sixtyDaysAgo = subDays(new Date(), 60);
    return getZonedDate(chat.created_at) <= sixtyDaysAgo;
  });

  return { today, yesterday, last7Days, last30Days, last2Months, older };
}

export default async function Layout(props: { children: React.ReactNode }) {
  const userData = await fetchUserData();

  return (
    <div className="h-screen bg-background" data-chat-page>
      <SidebarProvider className="h-full flex">
        <ChatHistoryDrawer
          userInfo={{
            id: userData?.id || '',
            full_name: userData?.full_name || '',
            email: userData?.email || ''
          }}
          initialChatPreviews={userData?.allChatPreviews || []}
          categorizedChats={categorizeChats(userData?.allChatPreviews || [])}
          documents={userData?.documents || []}
          rooms={userData?.rooms || []}
        />
        <main className="flex-1 overflow-hidden">
          <UploadProvider userId={userData?.id || ''}>
            {props.children}
          </UploadProvider>
        </main>
      </SidebarProvider>
    </div>
  );
}
