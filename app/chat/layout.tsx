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

    // Fetch rooms data - using any type to bypass TypeScript issues with missing table types
    const { data: roomsData, error: roomsError } = await (supabase as any)
      .from('rooms')
      .select(`
        id,
        name,
        share_code,
        max_participants,
        creator_tier,
        expires_at,
        created_at,
        created_by,
        room_participants(session_id)
      `)
      .eq('created_by', userInfo.id)
      .order('created_at', { ascending: false });

    // Fetch room chats for the user (rooms they created)
    // First get the user's rooms
    const userRoomIds = (roomsData || []).map((room: any) => room.id);
    
    let roomChatsData = [];
    let roomChatsError = null;
    
    if (userRoomIds.length > 0) {
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
        .limit(20);
      
      roomChatsData = data;
      roomChatsError = error;
    }

    if (chatError) {
      console.error('Chat Error:', chatError);
    }
    if (docsError) {
      console.error('Documents Error:', docsError);
    }
    if (roomsError) {
      console.error('Rooms Error:', roomsError);
    }
    if (roomChatsError) {
      console.error('Room Chats Error:', roomChatsError);
    }

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

    // Transform room chat data and group by room
    const roomChatPreviews = [];
    const roomChatsGrouped = new Map();
    
    // Create a lookup map for room data
    const roomsLookup = new Map();
    (roomsData || []).forEach((room: any) => {
      roomsLookup.set(room.id, room);
    });
    
    (roomChatsData || []).forEach((msg: any) => {
      const roomKey = msg.room_id;
      const roomData = roomsLookup.get(msg.room_id);
      
      if (roomData && roomData.share_code && !roomChatsGrouped.has(roomKey)) {
        roomChatsGrouped.set(roomKey, {
          id: `room_chat_${msg.room_id}`,
          firstMessage: `${roomData.name}: ${msg.is_ai_response ? 'AI: ' + msg.content : msg.sender_name + ': ' + msg.content}`,
          created_at: msg.created_at,
          type: 'room' as const,
          roomName: roomData.name,
          shareCode: roomData.share_code
        });
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
    const rooms = (roomsData || []).map((room) => ({
      id: room.id,
      name: room.name,
      shareCode: room.share_code,
      participantCount: room.room_participants?.length || 0,
      maxParticipants: room.max_participants,
      tier: room.creator_tier as 'free' | 'pro',
      expiresAt: room.expires_at,
      createdAt: room.created_at,
      isCreator: room.created_by === userInfo.id
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
    <SidebarProvider className="h-screen">
      <UploadProvider userId={userData?.id || ''}>
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
        {props.children}
      </UploadProvider>
    </SidebarProvider>
  );
}
