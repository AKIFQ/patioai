import { type NextRequest, NextResponse } from 'next/server';
import type { Message, Attachment } from 'ai';
import { streamText, convertToCoreMessages } from 'ai';
import { Ratelimit } from '@upstash/ratelimit';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { openai } from '@ai-sdk/openai';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { anthropic } from '@ai-sdk/anthropic';
import { redis } from '@/lib/server/server';
import { getSession } from '@/lib/server/supabase';
import { websiteSearchTool } from '@/app/api/chat/tools/WebsiteSearchTool';
import { google } from '@ai-sdk/google';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';
import { createClient } from '@supabase/supabase-js';

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

async function getRoomMessages(roomId: string, limit: number = 30) {
  const { data: messages, error } = await supabase
    .from('room_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching room messages:', error);
    return [];
  }

  return messages || [];
}

async function getOrCreateRoomChatSession(
  roomId: string,
  sessionId: string,
  displayName: string
): Promise<string | null> {
  try {
    // First try to find existing chat session for this user in this room
    const { data: existingSession, error: findError } = await supabase
      .from('room_chat_sessions')
      .select('id')
      .eq('room_id', roomId)
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession && !findError) {
      // Update the existing session timestamp
      await supabase
        .from('room_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existingSession.id);
      
      return existingSession.id;
    }

    // Create new chat session
    const { data: newSession, error: createError } = await supabase
      .from('room_chat_sessions')
      .insert({
        room_id: roomId,
        session_id: sessionId,
        display_name: displayName
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Error creating room chat session:', createError);
      return null;
    }

    return newSession.id;
  } catch (error) {
    console.error('Error in getOrCreateRoomChatSession:', error);
    return null;
  }
}

async function saveRoomMessage(
  roomId: string,
  roomChatSessionId: string,
  senderName: string,
  content: string,
  isAiResponse: boolean = false,
  sources?: any,
  reasoning?: string
) {
  const { error } = await supabase
    .from('room_messages')
    .insert({
      room_id: roomId,
      room_chat_session_id: roomChatSessionId,
      sender_name: senderName,
      content,
      is_ai_response: isAiResponse,
      sources,
      reasoning
    });

  if (error) {
    console.error('Error saving room message:', error);
  }
}

async function getUserTier(userId: string): Promise<'free' | 'pro'> {
  const { data, error } = await supabase
    .from('user_tiers')
    .select('tier')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return 'free';
  }
  
  return data.tier as 'free' | 'pro';
}

async function checkDailyUsage(userId: string, roomId: string): Promise<{ canSend: boolean; usage: number; limit: number }> {
  const today = new Date().toISOString().split('T')[0];
  
  // Get current usage
  const { data: usage, error } = await supabase
    .from('daily_message_usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .eq('date', today)
    .single();

  const currentUsage = usage?.message_count || 0;
  
  // Get user tier to determine limit
  const tier = await getUserTier(userId);
  const limit = tier === 'pro' ? 100 : 30;
  
  return {
    canSend: currentUsage < limit,
    usage: currentUsage,
    limit
  };
}

async function incrementDailyUsage(userId: string, roomId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // First try to get existing record
  const { data: existing } = await supabase
    .from('daily_message_usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .eq('date', today)
    .single();

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from('daily_message_usage')
      .update({ message_count: existing.message_count + 1 })
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .eq('date', today);

    if (error) {
      console.error('Error updating daily usage:', error);
    }
  } else {
    // Insert new record
    const { error } = await supabase
      .from('daily_message_usage')
      .insert({
        user_id: userId,
        room_id: roomId,
        date: today,
        message_count: 1
      });

    if (error) {
      console.error('Error inserting daily usage:', error);
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const session = await getSession();

    if (!session) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { messages, displayName, sessionId, option } = body;
    
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

    if (!message || !displayName || !sessionId) {
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
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
      return new NextResponse('Room has expired', {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check daily usage limits
    const { canSend, usage, limit } = await checkDailyUsage(session.id, room.id);
    if (!canSend) {
      return new NextResponse(`Daily message limit reached (${usage}/${limit})`, {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify participant is in the room
    const { data: participant } = await supabase
      .from('room_participants')
      .select('display_name')
      .eq('room_id', room.id)
      .eq('session_id', sessionId)
      .single();

    if (!participant) {
      return new NextResponse('Not a participant in this room', {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get or create room chat session
    const roomChatSessionId = await getOrCreateRoomChatSession(room.id, sessionId, displayName);
    if (!roomChatSessionId) {
      return new NextResponse('Failed to create chat session', {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Save user message
    await saveRoomMessage(room.id, roomChatSessionId, displayName, message, false);
    
    // Increment daily usage
    await incrementDailyUsage(session.id, room.id);

    // Get recent room messages for context (last 30 messages)
    const recentMessages = await getRoomMessages(room.id, 30);
    
    // Get current participants for system prompt
    const { data: participants } = await supabase
      .from('room_participants')
      .select('display_name')
      .eq('room_id', room.id);

    const participantNames = participants?.map(p => p.display_name) || [];

    // Format messages for AI context
    const contextMessages: Message[] = recentMessages.map(msg => ({
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
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'api_room_chat',
        metadata: {
          userId: session.id,
          roomId: room.id,
          shareCode
        },
        recordInputs: true,
        recordOutputs: true
      },
      onFinish: async (event) => {
        const { text, reasoning, sources } = event;
        
        // Save AI response to room messages
        await saveRoomMessage(
          room.id,
          roomChatSessionId,
          'AI Assistant',
          text,
          true,
          sources,
          reasoning
        );
        
        console.log('Room message saved:', room.id);
      },
      onError: async (error) => {
        console.error('Error processing room chat:', error);
      }
    });

    result.consumeStream();

    return result.toDataStreamResponse({
      sendReasoning: false,
      sendSources: true,
      getErrorMessage: errorHandler
    });

  } catch (error) {
    console.error('Error in room chat:', error);
    return new NextResponse('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}