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
    if (!finalThreadId) {
      // Create deterministic main thread using a simple but valid UUID
      // Convert share code to a deterministic UUID
      const shareCodeHash = shareCode.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
      }, 0);
      const hashStr = Math.abs(shareCodeHash).toString(16).padStart(8, '0');
      finalThreadId = `${hashStr.substring(0, 8)}-0000-4000-8000-${hashStr.padEnd(12, '0').substring(0, 12)}`;
      
      // Update URL to include the thread ID (use threadId parameter for consistency)
      const currentParams = new URLSearchParams(searchParams.toString());
      currentParams.set('threadId', finalThreadId);
      // Remove legacy chatSession param if it exists
      currentParams.delete('chatSession');
      const newUrl = `/chat/room/${shareCode}?${currentParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }

    // Create simplified room context
    const context: RoomContext = {
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

    setRoomContext(context);
    setIsInitialized(true);

    console.log('🎯 Room initialized:', {
      shareCode,
      threadId: finalThreadId,
      displayName
    });

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

  return (
    <div className="flex w-full h-full overflow-hidden">
      <div className="flex-1">
        <ChatComponent
          key={`room_${shareCode}_${roomContext.sessionId}_${roomContext.chatSessionId}`}
          currentChat={initialMessages}
          chatId={`room_session_${roomContext.chatSessionId}`}
          initialModelType={initialModelType}
          initialSelectedOption={initialSelectedOption}
          roomContext={roomContext}
        />
      </div>
    </div>
  );
}