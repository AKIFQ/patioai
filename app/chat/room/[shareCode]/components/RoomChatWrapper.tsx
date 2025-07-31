'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatComponent from '../../../components/Chat';
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
}

export default function RoomChatWrapper({
  shareCode,
  roomInfo,
  initialMessages,
  initialModelType,
  initialSelectedOption
}: RoomChatWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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

    // Use thread ID from URL, or create main thread if none specified
    let finalThreadId = threadId;
    let shouldUpdateUrl = false;
    
    if (!finalThreadId) {
      // Create deterministic main thread using a simple but valid UUID
      // Convert share code to a deterministic UUID
      const shareCodeHash = shareCode.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
      }, 0);
      const hashStr = Math.abs(shareCodeHash).toString(16).padStart(8, '0');
      finalThreadId = `${hashStr.substring(0, 8)}-0000-4000-8000-${hashStr.padEnd(12, '0').substring(0, 12)}`;
      shouldUpdateUrl = true;
      
      console.log('🏠 Creating main thread for room:', finalThreadId);
    } else {
      console.log('🆕 Using existing thread ID:', finalThreadId);
    }
    
    // Only update URL if we're creating the main thread (not for new chat sessions)
    if (shouldUpdateUrl) {
      const currentParams = new URLSearchParams(searchParams.toString());
      currentParams.set('threadId', finalThreadId);
      // Remove legacy chatSession param if it exists
      currentParams.delete('chatSession');
      const newUrl = `/chat/room/${shareCode}?${currentParams.toString()}`;
      console.log('🔄 Updating URL to include main thread ID');
      window.history.replaceState({}, '', newUrl);
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

  // Determine if this is a new chat session (not the main thread)
  const isMainThread = roomContext.chatSessionId?.includes('-0000-4000-8000-');
  const isNewChatSession = !isMainThread;
  
  // For new chat sessions, start with empty messages
  // For main thread, use the loaded historical messages
  const chatMessages = isNewChatSession ? [] : initialMessages;

  console.log('🎯 Room chat rendering:', {
    threadId: roomContext.chatSessionId,
    isMainThread,
    isNewChatSession,
    messageCount: chatMessages.length
  });

  return (
    <div className="flex w-full h-full overflow-hidden">
      <div className="flex-1">
        <ChatComponent
          key={`room_${shareCode}_${roomContext.chatSessionId}_${isNewChatSession ? Date.now() : 'main'}`}
          currentChat={chatMessages}
          chatId={`room_session_${roomContext.chatSessionId}`}
          initialModelType={initialModelType}
          initialSelectedOption={initialSelectedOption}
          roomContext={roomContext}
        />
      </div>
    </div>
  );
}