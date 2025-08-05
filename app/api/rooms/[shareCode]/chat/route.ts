import { type NextRequest, NextResponse } from 'next/server';
import type { Message } from 'ai';
import { streamText, convertToCoreMessages } from 'ai';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { openai } from '@ai-sdk/openai';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { anthropic } from '@ai-sdk/anthropic';
import { getSession } from '@/lib/server/supabase';
import { websiteSearchTool } from '@/app/api/chat/tools/WebsiteSearchTool';
import { google } from '@ai-sdk/google';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';
import { createClient } from '@supabase/supabase-js';
import { SocketDatabaseService } from '@/lib/database/socketQueries';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const getRoomSystemPrompt = (roomName: string, participantNames: string[]) => {
  const basePrompt = `You are a helpful AI assistant participating in a group chat room called "${roomName}". 

IMPORTANT CONTEXT:
- You are chatting with multiple participants: ${participantNames.join(', ')}
- When responding, you can address participants by name when relevant
- Be conversational and acknowledge the group nature of the chat
- Messages are formatted as "DisplayName: message content" so you know who said what

FORMATTING: Your responses are rendered using react-markdown with the following capabilities:
- GitHub Flavored Markdown (GFM) support through remarkGfm plugin
- Syntax highlighting for code blocks through rehypeHighlight plugin
- All standard markdown formatting

Answer questions to the best of your ability and use tools when necessary.`;

  return basePrompt;
};

function errorHandler(error: unknown) {
  if (error == null) {
    return 'unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return JSON.stringify(error);
}

const getModel = (selectedModel: string) => {
  switch (selectedModel) {
    case 'claude-3.7-sonnet':
      return anthropic('claude-4-sonnet-20250514');
    case 'gpt-4.1':
      return openai('gpt-4.1-2025-04-14');
    case 'gpt-4.1-mini':
      return openai('gpt-4.1-mini');
    case 'o3':
      return openai('o3-2025-04-16');
    case 'gemini-2.5-pro':
      return google('gemini-2.5-pro');
    case 'gemini-2.5-flash':
      return google('gemini-2.5-flash');
    default:
      console.error('Invalid model selected:', selectedModel);
      return openai('gpt-4.1-2025-04-14');
  }
};

// Removed unused getRoomMessages function - we load messages directly in the page

// Removed unused session management functions

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
    const { emitRoomMessageCreated, getSocketIOInstance } = await import('@/lib/server/socketEmitter');
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

    // Trigger AI response for user messages
    if (!isAiResponse && isFirstMessage) {
      try {
        const io = getSocketIOInstance();
        if (io) {
          // Get current participants for AI context
          const { data: participants } = await supabase
            .from('room_participants')
            .select('display_name')
            .eq('room_id', roomId);

          const participantNames = participants?.map(p => p.display_name) || [];

          // Emit AI trigger event
          io.to(`room:${shareCode}`).emit('trigger-ai-response', {
            shareCode,
            threadId,
            message: content,
            senderName,
            roomName: room.name,
            participants: participantNames
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

// Removed unused daily usage functions - can be re-added later if needed

// Simple in-memory cache to prevent duplicate requests
const recentRequests = new Map<string, number>();
const REQUEST_DEBOUNCE_MS = 2000; // 2 second debounce

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`🚀 [${requestId}] API CALL START - Room chat request received`);

  try {
    const { shareCode } = await params;
    console.log(`📝 [${requestId}] Share code: ${shareCode}`);

    // Try to get session but don't fail if user is anonymous
    let session = null;
    try {
      session = await getSession();
    } catch (_error) {
      // Anonymous users don't have sessions, this is expected
      console.log('No authenticated session (anonymous user)');
    }

    // Note: Allow both authenticated and anonymous users for room chats
    // Anonymous users are identified by sessionId

    const body = await req.json();
    const { messages, displayName, option, threadId, triggerAI = true } = body;

    console.log(`📨 [${requestId}] Room chat API received:`, {
      shareCode,
      displayName,
      threadId,
      option,
      triggerAI,
      messagesCount: messages?.length,
      lastMessage: messages?.[messages.length - 1]?.content?.substring(0, 50)
    });

    // Create a unique request key for deduplication
    const lastUserMessage = messages?.[messages.length - 1];
    const requestKey = `${shareCode}-${threadId}-${displayName}-${lastUserMessage?.content?.substring(0, 100)}`;
    const now = Date.now();
    
    // Check if we've seen this exact request recently
    if (recentRequests.has(requestKey)) {
      const lastRequestTime = recentRequests.get(requestKey)!;
      if (now - lastRequestTime < REQUEST_DEBOUNCE_MS) {
        console.log(`🚫 [${requestId}] Duplicate request detected, ignoring:`, requestKey);
        return new NextResponse('Duplicate request ignored', { status: 429 });
      }
    }
    
    // Record this request
    recentRequests.set(requestKey, now);
    
    // Clean up old entries (keep only last 100)
    if (recentRequests.size > 100) {
      const entries = Array.from(recentRequests.entries());
      entries.sort((a, b) => b[1] - a[1]); // Sort by timestamp, newest first
      recentRequests.clear();
      entries.slice(0, 50).forEach(([key, time]) => {
        recentRequests.set(key, time);
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new NextResponse('No messages provided', {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract the last message (current user message)
    const lastMessage = messages[messages.length - 1];
    const message = lastMessage?.content;
    const selectedModel = option || 'gpt-4.1';

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

    // If triggerAI is false, just return success without generating AI response
    if (!triggerAI) {
      console.log(`📤 [${requestId}] Message saved without AI response (triggerAI: false)`);
      return new NextResponse('Message saved successfully', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Simplified: Skip daily usage tracking for now

    // Get recent messages from this thread for AI context
    const { data: recentMessages } = await supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', room.id)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(30);

    // Get current participants for system prompt
    const { data: participants } = await supabase
      .from('room_participants')
      .select('display_name')
      .eq('room_id', room.id);

    const participantNames = participants?.map(p => p.display_name) || [];

    // Format messages for AI context
    const contextMessages: Message[] = (recentMessages || []).map(msg => ({
      id: msg.id,
      role: msg.is_ai_response ? 'assistant' : 'user',
      content: msg.is_ai_response ? msg.content : `${msg.sender_name}: ${msg.content}`,
      createdAt: new Date(msg.created_at)
    }));

    // Add the current message
    contextMessages.push({
      id: 'current',
      role: 'user',
      content: `${displayName}: ${message}`,
      createdAt: new Date()
    });

    const providerOptions: LanguageModelV1ProviderMetadata = {};
    if (selectedModel === 'claude-3.7-sonnet') {
      providerOptions.anthropic = {
        thinking: { type: 'enabled', budgetTokens: 12000 }
      } satisfies AnthropicProviderOptions;
    }

    if (selectedModel === 'gemini-2.5-pro' || selectedModel === 'gemini-2.5-flash') {
      providerOptions.google = {
        thinkingConfig: {
          thinkingBudget: 2048,
          includeThoughts: true
        }
      } satisfies GoogleGenerativeAIProviderOptions;
    }

    if (selectedModel === 'o3') {
      providerOptions.openai = {
        reasoningEffort: 'high'
      } satisfies OpenAIResponsesProviderOptions;
    }

    const result = streamText({
      model: getModel(selectedModel),
      system: getRoomSystemPrompt(room.name, participantNames),
      messages: convertToCoreMessages(contextMessages),
      providerOptions,
      tools: {
        websiteSearchTool: websiteSearchTool
      },
      experimental_activeTools: ['websiteSearchTool'],
      maxSteps: 3,
      // Removed telemetry for simplicity
      onFinish: async (event) => {
        const { text, reasoning, sources } = event;

        console.log(`🤖 [${requestId}] AI response generated, saving: "${text.substring(0, 50)}..."`);

        // Save AI response to thread
        const aiSaved = await saveRoomMessage(
          room.id,
          shareCode,
          threadId,
          'AI Assistant',
          text,
          true,
          sources,
          reasoning
        );

        if (aiSaved) {
          console.log(`✅ [${requestId}] AI response saved successfully`);
          // Socket.IO event already emitted by saveRoomMessage function
        } else {
          console.log(`❌ [${requestId}] Failed to save AI response`);
        }
      },
      onError: async (error) => {
        console.error('Error processing room chat:', error);
      }
    });

    result.consumeStream();

    console.log(`🎯 [${requestId}] Returning streaming response`);
    return result.toDataStreamResponse({
      sendReasoning: false,
      sendSources: true,
      getErrorMessage: errorHandler
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Error in room chat:`, error);

    return new NextResponse('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}