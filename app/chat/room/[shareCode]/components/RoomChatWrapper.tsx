'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatComponent from '../../../components/Chat';
import { ChatErrorBoundary } from '@/components/ErrorBoundary';
import type { Message } from 'ai';


interface RoomContext {
  shareCode: string;
  roomName: string;
  displayName: string;
  sessionId: string;
  participants: Array<{ displayName: string; joinedAt: string; sessionId: string; userId?: string }>;
  maxParticipants: number;
  tier: 'free' | 'pro';
  createdBy?: string;
  expiresAt?: string;
  chatSessionId?: string;
}

interface RoomChatWrapperProps {
  shareCode: string;
  roomInfo: {
    room: any;
    participants: any[];
  };
  initialMessages: Message[];
  initialModelType: string;
  initialSelectedOption: string;
  userData?: any;
  sidebarData?: any;
}

export default function RoomChatWrapper({
  shareCode,
  roomInfo,
  initialMessages,
  initialModelType,
  initialSelectedOption,
  userData,
  sidebarData
}: RoomChatWrapperProps) {
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [roomContext, setRoomContext] = useState<RoomContext | null>(null);

  useEffect(() => {
    // Get URL parameters - simplified to just what we need
    const displayName = searchParams.get('displayName');
    const threadId = searchParams.get('threadId') || searchParams.get('chatSession'); // Support both new and legacy params

    // If no display name, redirect to join page
    if (!displayName) {
      router.push(`/room/${shareCode}`);
      return;
    }

    // Use thread ID from URL, or generate a new one if missing
    let finalThreadId = threadId;
    
    if (!finalThreadId) {
      // Generate a new thread ID for new room entries (like when joining from join page)
      finalThreadId = crypto.randomUUID();
      console.log('🆕 Generated new thread ID for room entry:', finalThreadId);
      
      // Update URL to include the new thread ID
      const currentParams = new URLSearchParams(searchParams.toString());
      currentParams.set('threadId', finalThreadId);
      const newUrl = `/chat/room/${shareCode}?${currentParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
    } else {
      console.log('🆕 Using existing thread ID:', finalThreadId);
    }

    // Only update context if it's actually different to prevent re-renders
    const newContext: RoomContext = {
      shareCode,
      roomName: roomInfo.room.name,
      displayName,
      sessionId: displayName, // Use display name as session identifier
      participants: roomInfo.participants,
      maxParticipants: roomInfo.room.maxParticipants,
      tier: roomInfo.room.tier,
      createdBy: roomInfo.room.createdBy,
      expiresAt: roomInfo.room.expiresAt,
      chatSessionId: finalThreadId
    };

    // Only update if context has actually changed
    setRoomContext(prevContext => {
      if (!prevContext || 
          prevContext.shareCode !== newContext.shareCode ||
          prevContext.displayName !== newContext.displayName ||
          prevContext.chatSessionId !== newContext.chatSessionId) {
        console.log('🎯 Room context updated:', {
          shareCode,
          threadId: finalThreadId,
          displayName
        });
        return newContext;
      }
      return prevContext;
    });
    
    setIsInitialized(true);

  }, [shareCode, searchParams, router, roomInfo]);

  // Show loading state while initializing
  if (!isInitialized || !roomContext) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Connecting to room...</p>
        </div>
      </div>
    );
  }

  // Use the loaded messages (now properly filtered by thread on server-side)
  const chatMessages = initialMessages;

  console.log('🎯 Room chat rendering:', {
    threadId: roomContext.chatSessionId,
    messageCount: chatMessages.length
  });

  return (
    <ChatErrorBoundary 
      critical={true}
      onError={(error, errorInfo, errorId) => {
        console.error('🚨 Room Chat Error:', { error, errorInfo, errorId, shareCode, roomContext });
      }}
    >
      <div className="flex w-full h-full overflow-hidden">
        <div className="flex-1">
          <ChatComponent
            key={`room_${shareCode}_${roomContext.chatSessionId}`}
            currentChat={chatMessages}
            chatId={`room_session_${roomContext.chatSessionId}`}
            initialModelType={initialModelType}
            initialSelectedOption={initialSelectedOption}
            roomContext={roomContext}
            userData={userData}
            sidebarData={sidebarData}
          />
        </div>
      </div>
    </ChatErrorBoundary>
  );
}