'use server';

import { getSession } from '@/lib/server/supabase';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/server/server';
import { createAdminClient } from '@/lib/server/admin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { decodeBase64 } from './utils/base64';

export interface ChatPreview {
  id: string;
  firstMessage: string;
  created_at: string;
  type?: 'regular' | 'room';
  roomName?: string;
  shareCode?: string;
  chatSessionId?: string;
}

export async function fetchMoreChatPreviews(offset: number) {
  const session = await getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const supabase = await createServerSupabaseClient();
  const limit = 30;

  try {
    // Get regular chat sessions
    const { data: chatData, error: chatError } = await supabase
      .from('chat_sessions')
      .select(
        `
          id,
          created_at,
          chat_title,
          first_message:chat_messages!inner(content)
        `
      )
      .order('created_at', { ascending: false })
      .limit(1, { foreignTable: 'chat_messages' })
      .range(offset, offset + limit - 1);

    if (chatError) throw chatError;

    // Get ALL room messages and threads (simplified approach)
    let roomChatPreviews: any[] = [];
    
    try {
      // Get all room messages with room info
      const { data: roomMessages } = await supabase
        .from('room_messages')
        .select(`
          id, 
          created_at, 
          content, 
          sender_name, 
          is_ai_response, 
          room_id, 
          thread_id,
          rooms!inner(id, name, share_code)
        `)
        .order('created_at', { ascending: true });

      // Group by thread and get first user message for each thread
      const threadFirstMessages = new Map();
      const threadLatestTimes = new Map();
      
      (roomMessages || []).forEach((msg: any) => {
        if (msg.thread_id && !msg.is_ai_response && msg.content) {
          if (!threadFirstMessages.has(msg.thread_id)) {
            threadFirstMessages.set(msg.thread_id, msg);
          }
        }
        // Track latest message time for each thread
        if (msg.thread_id) {
          const currentLatest = threadLatestTimes.get(msg.thread_id);
          if (!currentLatest || new Date(msg.created_at) > new Date(currentLatest)) {
            threadLatestTimes.set(msg.thread_id, msg.created_at);
          }
        }
      });
      
      // Create chat previews for each thread
      threadFirstMessages.forEach((firstMsg, threadId) => {
        const room = firstMsg.rooms;
        if (room) {
          let title = 'New Chat';
          if (firstMsg.content) {
            const words = firstMsg.content.trim().split(/\s+/);
            title = words.slice(0, 4).join(' ');
            if (words.length > 4) title += '...';
          }
          
          roomChatPreviews.push({
            id: `room_session_${threadId}`,
            firstMessage: title,
            created_at: threadLatestTimes.get(threadId) || firstMsg.created_at,
            type: 'room',
            roomName: room.name,
            shareCode: room.share_code,
            chatSessionId: threadId
          });
        }
      });
    } catch (error) {
      console.error('Error fetching room messages:', error);
    }

    // Combine regular chats and room chats
    const regularChatPreviews: ChatPreview[] = (chatData || []).map((session) => ({
      id: session.id,
      firstMessage:
        session.chat_title ??
        session.first_message[0]?.content ??
        'No messages yet',
      created_at: session.created_at,
      type: 'regular'
    }));

    // Combine and sort all chats by date
    const allChats = [...regularChatPreviews, ...roomChatPreviews].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return allChats.slice(offset, offset + limit);
  } catch (error) {
    console.error('Error fetching chat previews:', error);
    return [];
  }
}

export async function deleteChatData(chatId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }
  const supabase = await createServerSupabaseClient();
  try {
    // Delete chat session
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', chatId);

    if (sessionError) throw sessionError;
    revalidatePath(`/chat/[id]`, 'layout');
    return { message: 'Chat data and references deleted successfully' };
  } catch (error) {
    console.error('Error during deletion:', error);
    return { message: 'Error deleting chat data' };
  }
}

const deleteFileSchema = z.object({
  filePath: z.string()
});

function sanitizeFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function deleteFilterTagAndDocumentChunks(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }
  try {
    const result = deleteFileSchema.safeParse({
      filePath: formData.get('filePath')
    });

    if (!result.success) {
      console.error('Validation failed:', result.error.errors);
      return {
        success: false,
        message: result.error.errors.map((e) => e.message).join(', ')
      };
    }

    const { filePath } = result.data;
    const userId = session.id;

    // Delete the file from storage
    const supabase = await createServerSupabaseClient();
    const fileToDelete = userId + '/' + filePath;

    const { error: deleteError } = await supabase.storage
      .from('userfiles')
      .remove([fileToDelete]);

    if (deleteError) {
      console.error('Error deleting file from Supabase storage:', deleteError);
      return {
        success: false,
        message: 'Error deleting file from storage'
      };
    }

    // Generate the filter tag from the file path
    const prefixToDelete = decodeBase64(filePath);
    const sanitizedFilename = sanitizeFilename(prefixToDelete);

    // Find and delete document records with the matching filter tag
    // Vector records will be deleted automatically via ON DELETE CASCADE
    const { data: deletedData, error: docDeleteError } = await supabase
      .from('user_documents')
      .delete()
      .eq('user_id', userId)
      .like('filter_tags', `${sanitizedFilename}%`)
      .select('id, title');

    if (docDeleteError) {
      console.error('Error deleting document records:', docDeleteError);
      return {
        success: false,
        message: 'Error deleting document metadata'
      };
    }

    const deletedCount = deletedData?.length || 0;
    revalidatePath('/', 'layout');
    revalidatePath('/chat', 'layout');
    return {
      success: true,
      message: `Successfully deleted file and ${deletedCount} associated documents`
    };
  } catch (error) {
    console.error('Error during deletion process:', error);
    return {
      success: false,
      message: 'Error deleting file and document chunks',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

const updateChatTitleSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty'),
  chatId: z.string().uuid('Invalid chat ID format')
});

export async function updateChatTitle(formData: FormData) {
  // Create an object from FormData
  const data = {
    title: formData.get('title'),
    chatId: formData.get('chatId')
  };

  // Validate the input
  const result = updateChatTitleSchema.safeParse(data);
  if (!result.success) {
    console.error('Invalid input:', result.error);
    return {
      success: false,
      error: 'Invalid input data'
    };
  }

  // Continue with the validated data
  const { title, chatId } = result.data;

  const userId = await getSession();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabaseAdmin = createAdminClient();
  const { error: updateError } = await supabaseAdmin
    .from('chat_sessions')
    .update({ chat_title: title })
    .eq('id', chatId)
    .eq('user_id', userId.id);

  if (updateError) {
    return {
      success: false,
      error: 'Error updating chat title'
    };
  }

  revalidatePath(`/chat/[id]`, 'layout');

  return { success: true };
}
export async function setModelSettings(
  modelType: string,
  selectedOption: string
) {
  const cookie = await cookies();
  cookie.set('modelType', modelType, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30 // 30 days
  });

  cookie.set('selectedOption', selectedOption, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30 // 30 days
  });
}
