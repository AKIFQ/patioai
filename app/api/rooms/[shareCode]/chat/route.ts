import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SocketDatabaseService } from '@/lib/database/socketQueries';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';
export const maxDuration = 60;

// Room chat API - handles message persistence only
// AI responses are handled via Socket.IO streaming

// Simplified: Save message directly to thread
async function saveRoomMessage(
  roomId: string,
  shareCode: string,
  threadId: string,
  senderName: string,
  content: string,
  isAiResponse = false,
  sources?: any,
  reasoning?: string
): Promise<boolean> {
  const messageId = Math.random().toString(36).substring(7);
  console.log(`💾 [${messageId}] SAVING MESSAGE:`, {
    sender: senderName,
    isAI: isAiResponse,
    contentPreview: content.substring(0, 30),
    threadId: threadId.substring(0, 8) + '...'
  });

  try {
    // First, check if this thread already has messages (to detect first message)
    const { data: existingMessages } = await supabase
      .from('room_messages')
      .select('id')
      .eq('thread_id', threadId)
      .limit(1);

    const isFirstMessage = !existingMessages || existingMessages.length === 0;

    // Use optimized database service for message insertion
    const result = await SocketDatabaseService.insertRoomMessage({
      roomId,
      threadId,
      senderName,
      content,
      isAiResponse,
      sources,
      reasoning
    });

    if (!result.success) {
      console.error(`❌ [${messageId}] Error saving message:`, result.error);
      return false;
    }

    console.log(`✅ [${messageId}] Message saved successfully:`, {
      dbId: result.messageId,
      sender: senderName,
      isAI: isAiResponse,
      isFirstMessage
    });

    // Emit Socket.IO event for room message (use share code for room identification)
    const { emitRoomMessageCreated, emitRoomEvent, getSocketIOInstance } = await import('@/lib/server/socketEmitter');
    emitRoomMessageCreated(shareCode, {
      id: result.messageId || `msg-${Date.now()}`,
      room_id: roomId,
      thread_id: threadId,
      sender_name: senderName,
      content,
      is_ai_response: isAiResponse,
      reasoning: reasoning || null,
      sources: sources ? JSON.stringify(sources) : null,
      created_at: new Date().toISOString()
    });

    // CRITICAL: Emit specific new thread event for sidebar refresh
    if (isFirstMessage && !isAiResponse) {
      console.log(`🆕 NEW THREAD CREATED - emitting thread-created event for ${shareCode}`);
      
      // Emit to room channel for users currently in the room
      // This will reach all users who have joined the room via socket
      emitRoomEvent(shareCode, 'thread-created', {
        threadId,
        roomId,
        shareCode,
        senderName,
        firstMessage: content,
        createdAt: new Date().toISOString()
      });

      console.log(`📢 Emitted thread-created event to room:${shareCode} for new thread ${threadId}`);
    }

    // Trigger AI response for user messages
    if (!isAiResponse && isFirstMessage) {
      try {
        const io = getSocketIOInstance();
        if (io) {
          // Get room info and participants for AI context
          const { data: roomData } = await supabase
            .from('rooms')
            .select('name')
            .eq('id', roomId)
            .single();

          const { data: participants } = await supabase
            .from('room_participants')
            .select('display_name')
            .eq('room_id', roomId);

          // Get recent messages for context (last 10 messages)
          const { data: recentMessages } = await supabase
            .from('room_messages')
            .select('*')
            .eq('room_id', roomId)
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true })
            .limit(10);

          // Format messages for AI context
          const chatHistory = (recentMessages || [])
            .filter(msg => msg.id !== result.messageId) // Exclude the message we just saved
            .map(msg => ({
              role: msg.is_ai_response ? 'assistant' as const : 'user' as const,
              content: msg.is_ai_response ? msg.content : `${msg.sender_name}: ${msg.content}`
            }));

          const participantNames = participants?.map(p => p.display_name) || [];

          console.log(`🧠 Passing ${chatHistory.length} messages as context to AI`);

          // Emit AI trigger event via streaming path
          io.to(`room:${shareCode}`).emit('invoke-ai', {
            shareCode,
            threadId,
            prompt: `${senderName}: ${content}`,
            roomName: roomData?.name || 'Room',
            participants: participantNames,
            chatHistory
          });
        }
      } catch (aiError) {
        console.warn('Failed to trigger AI response:', aiError);
      }
    }

    // Mark if this is the first message for potential sidebar updates
    if (isFirstMessage && !isAiResponse) {
      console.log(`🎉 [${messageId}] First message in thread - will trigger sidebar update via Socket.IO`);
    }

    return true;
  } catch (error) {
    console.error(`💥 [${messageId}] Exception saving message:`, error);
    return false;
  }
}


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`🚀 [${requestId}] API CALL START - Room chat request received`);

  try {
    const { shareCode } = await params;
    console.log(`📝 [${requestId}] Share code: ${shareCode}`);

    // Room chats work for both authenticated and anonymous users
    // Anonymous users are identified by sessionId parameter

    const body = await req.json();
    const { messages, displayName, threadId, triggerAI = true } = body;

    console.log(`📨 [${requestId}] Room chat API received:`, {
      shareCode,
      displayName,
      threadId,
      triggerAI,
      messagesCount: messages?.length,
      lastMessage: messages?.[messages.length - 1]?.content?.substring(0, 50)
    });

    // Duplicate request handling removed - using new tier-based system

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new NextResponse('No messages provided', {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract the last message (current user message)
    const lastMessage = messages[messages.length - 1];
    const message = lastMessage?.content;

    if (!message || !displayName || !threadId) {
      return new NextResponse('Missing required fields', {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find the room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('share_code', shareCode)
      .single();

    if (roomError || !room) {
      return new NextResponse('Room not found', {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if room has expired
    const currentTime = new Date();
    const expiresAt = new Date(room.expires_at);
    if (currentTime > expiresAt) {
      return new NextResponse('Room has expired', {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Simplified: Skip daily usage limits for now (can be re-added later if needed)

    // Check if user was removed from the room
    const { data: removedParticipant } = await supabase
      .from('removed_room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('removed_display_name', displayName)
      .single();

    if (removedParticipant) {
      return new NextResponse(JSON.stringify({ 
        error: 'REMOVED_FROM_ROOM',
        roomName: room.name 
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Simplified: Just check if display name is in the room
    const { data: participant } = await supabase
      .from('room_participants')
      .select('display_name')
      .eq('room_id', room.id)
      .eq('display_name', displayName)
      .single();

    if (!participant) {
      return new NextResponse('Not a participant in this room', {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Save user message to thread
    console.log(`💾 [${requestId}] Saving user message: "${message.substring(0, 50)}" (triggerAI: ${triggerAI})`);
    const messageSaved = await saveRoomMessage(room.id, shareCode, threadId, displayName, message, false);
    if (!messageSaved) {
      console.log(`❌ [${requestId}] Failed to save user message`);
      return new NextResponse('Failed to save message', {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    console.log(`✅ [${requestId}] User message saved successfully`);

    // Room chats always use triggerAI: false and handle AI via Socket.IO streaming
    // Return success after saving user message
    console.log(`📤 [${requestId}] Message saved successfully (AI handled via Socket.IO)`);
    return new NextResponse('Message saved successfully', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Error in room chat:`, error);

    return new NextResponse('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}