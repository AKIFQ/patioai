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

interface GroupChatRoom {
  id: string;
  name: string;
  shareCode: string;
  participantCount: number;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
  isCreator: boolean;
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

    // Fetch group chat rooms where user is creator or participant
    const { data: createdRooms, error: createdRoomsError } = await supabase
      .from('rooms')
      .select(`
        id,
        name,
        share_code,
        max_participants,
        creator_tier,
        expires_at,
        created_at
      `)
      .eq('created_by', userInfo.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    // Get session ID from localStorage (this will be handled client-side)
    // For now, we'll fetch rooms where user might be a participant
    // This is a simplified approach - in production, you'd want better session tracking
    const { data: participantRooms, error: participantRoomsError } = await supabase
      .from('room_participants')
      .select(`
        room_id,
        rooms!inner(
          id,
          name,
          share_code,
          max_participants,
          creator_tier,
          expires_at,
          created_at,
          created_by
        )
      `)
      .gt('rooms.expires_at', new Date().toISOString());

    if (chatError) {
      console.error('Chat Error:', chatError);
    }
    if (docsError) {
      console.error('Documents Error:', docsError);
    }
    if (createdRoomsError) {
      console.error('Created Rooms Error:', createdRoomsError);
    }
    if (participantRoomsError) {
      console.error('Participant Rooms Error:', participantRoomsError);
    }

    // Transform chat data
    const chatPreviews = (chatData || []).map((session) => ({
      id: session.id,
      firstMessage:
        session.chat_title ??
        session.first_message[0]?.content ??
        'No messages yet',
      created_at: session.created_at
    }));

    // Transform documents data
    const documents = (documentsData || []).map((doc) => ({
      id: doc.id,
      title: doc.title,
      created_at: doc.created_at,
      total_pages: doc.total_pages,
      filter_tags: doc.filter_tags
    }));

    // Transform group chat rooms data
    const allRooms = new Map<string, any>();

    // Add created rooms
    (createdRooms || []).forEach(room => {
      allRooms.set(room.id, {
        ...room,
        isCreator: true,
        participantCount: 0 // Will be updated below
      });
    });

    // Add participant rooms
    (participantRooms || []).forEach(({ rooms: room }) => {
      if (room && !allRooms.has(room.id)) {
        allRooms.set(room.id, {
          ...room,
          isCreator: room.created_by === userInfo.id,
          participantCount: 0 // Will be updated below
        });
      }
    });

    // Get participant counts for all rooms
    const roomIds = Array.from(allRooms.keys());
    const participantCounts = new Map<string, number>();

    if (roomIds.length > 0) {
      const { data: participantCountData } = await supabase
        .from('room_participants')
        .select('room_id')
        .in('room_id', roomIds);

      (participantCountData || []).forEach(({ room_id }) => {
        participantCounts.set(room_id, (participantCounts.get(room_id) || 0) + 1);
      });
    }

    // Update participant counts and transform to final format
    const groupChatRooms: GroupChatRoom[] = Array.from(allRooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      shareCode: room.share_code,
      participantCount: participantCounts.get(room.id) || 0,
      maxParticipants: room.max_participants,
      tier: room.creator_tier,
      expiresAt: room.expires_at,
      createdAt: room.created_at,
      isCreator: room.isCreator
    }));

    return {
      id: userInfo.id,
      full_name: userInfo.full_name,
      email: userInfo.email,
      chatPreviews,
      documents,
      groupChatRooms
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
          initialChatPreviews={userData?.chatPreviews || []}
          categorizedChats={categorizeChats(userData?.chatPreviews || [])}
          documents={userData?.documents || []}
          groupChatRooms={userData?.groupChatRooms || []}
        />
        {props.children}
      </UploadProvider>
    </SidebarProvider>
  );
}
