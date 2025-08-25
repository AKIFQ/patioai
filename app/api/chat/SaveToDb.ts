import 'server-only';
import { createServerSupabaseClient } from '@/lib/server/server';
import type { Attachment } from 'ai';
import type { LanguageModelV1Source } from '@ai-sdk/provider';
import type { ToolResult } from '@/app/chat/types/tooltypes';
import { SocketDatabaseService } from '@/lib/database/socketQueries';

export interface OpenAiLog {
  id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export const saveChatToSupbabase = async (
  chatSessionId: string,
  userId: string,
  currentMessageContent: string,
  completion: string,
  attachments?: Attachment[],
  reasoning?: string,
  sources?: LanguageModelV1Source[],
  toolInvocations?: ToolResult[]
): Promise<void> => {
  if (!chatSessionId) {
    console.warn('Chat session ID is empty. Skipping saving chat to Supabase.');
    return;
  }
  const supabase = await createServerSupabaseClient();
  try {
    // Upsert the chat session
    const { error: sessionError } = await supabase.from('chat_sessions').upsert(
      {
        id: chatSessionId,
        user_id: userId,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

    if (sessionError) throw sessionError;

    // Use optimized batch insert with proper ordering (user message first, then AI message)
    // The SocketDatabaseService.insertChatMessages handles proper sequencing
    const result = await SocketDatabaseService.insertChatMessages([
      {
        chatSessionId,
        content: currentMessageContent,
        isUserMessage: true,
        attachments: attachments
      },
      {
        chatSessionId,
        content: completion,
        isUserMessage: false,
        attachments: undefined,
        reasoning: reasoning,
        sources: sources && sources.length > 0 ? sources : null,
        toolInvocations: toolInvocations
      }
    ]);

    if (!result.success) {
      throw new Error(result.error || 'Failed to insert chat messages');
    }

    // Emit Socket.IO events for both messages
    try {
      const { emitChatMessageCreated } = await import('@/lib/server/socketEmitter');
      
      if (result.messageIds && result.messageIds.length >= 2) {
        // Emit user message event
        emitChatMessageCreated(userId, {
          id: result.messageIds[0],
          chat_session_id: chatSessionId,
          content: currentMessageContent,
          is_user_message: true,
          attachments: attachments ? JSON.stringify(attachments) : null,
          created_at: new Date().toISOString()
        });
        
        // Emit AI message event
        emitChatMessageCreated(userId, {
          id: result.messageIds[1],
          chat_session_id: chatSessionId,
          content: completion,
          is_user_message: false,
          reasoning: reasoning || null,
          sources: sources && sources.length > 0 ? sources : null,
          tool_invocations: toolInvocations ? JSON.stringify(toolInvocations) : null,
          created_at: new Date().toISOString()
        });
      }
    } catch (socketError) {
      console.warn('Failed to emit Socket.IO events for chat messages:', socketError);
    }
  } catch (error) {
    console.error('Error saving chat to Supabase:', error);
  }
};
