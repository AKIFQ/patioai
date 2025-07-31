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
  threadId: string,
  senderName: string,
  content: string,
  isAiResponse = false,
  sources?: any,
  reasoning?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('room_messages')
      .insert({
        room_id: roomId,
        thread_id: threadId, // Direct thread reference
        sender_name: senderName,
        content,
        is_ai_response: isAiResponse,
        sources,
        reasoning
      })
      .select();

    if (error) {
      console.error('Error saving message to thread:', error);
      return false;
    }

    console.log('Message saved to thread:', threadId);
    return true;
  } catch (error) {
    console.error('Exception saving room message:', error);
    return false;
  }
}

// Removed unused daily usage functions - can be re-added later if needed

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    
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
    const { messages, displayName, option, threadId } = body;

    console.log('Room chat API received:', {
      shareCode,
      displayName,
      threadId,
      messagesCount: messages?.length
    });

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
    const now = new Date();
    const expiresAt = new Date(room.expires_at);
    if (now > expiresAt) {
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

    // Simplified: Save message directly to thread
    const messageSaved = await saveRoomMessage(room.id, threadId, displayName, message, false);
    if (!messageSaved) {
      return new NextResponse('Failed to save message', {
        status: 500,
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

        // Save AI response to thread
        await saveRoomMessage(
          room.id,
          threadId,
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

    // Simplified error logging
    console.error('Room chat error:', error);

    return new NextResponse('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}