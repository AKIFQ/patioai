/**
 * Thread Auto-Management System
 * Handles context window monitoring, thread compression, and automatic new thread creation
 */

import { createClient } from '@supabase/supabase-js';
import { tokenManager } from '@/lib/utils/tokenCounter';
import { type UserTier } from '@/lib/limits/tierLimits';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ThreadStatus {
  threadId: string;
  tokenCount: number;
  messageCount: number;
  contextUsage: number; // percentage
  recommendedAction: ThreadAction;
  warningLevel: 'none' | 'info' | 'warning' | 'critical';
}

export type ThreadAction = 
  | 'continue'
  | 'show_warning'
  | 'suggest_new_thread'
  | 'force_new_thread'
  | 'compress_context';

export interface ThreadWarning {
  type: 'context_warning' | 'thread_limit' | 'new_thread_suggested';
  message: string;
  currentUsage: number;
  limit: number;
  percentage: number;
  actionRequired: boolean;
  upgradePrompt?: string;
}

export interface ThreadCompressionResult {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  summary: string;
  success: boolean;
}

/**
 * Main Thread Manager Class
 */
export class ThreadManager {
  /**
   * Analyze thread status and determine recommended actions
   */
  async analyzeThreadStatus(
    chatSessionId: string,
    userTier: UserTier,
    newMessageContent?: string
  ): Promise<ThreadStatus> {
    try {
      // Get recent messages from the thread
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('content, is_user_message')
        .eq('chat_session_id', chatSessionId)
        .order('created_at', { ascending: true })
        .limit(50); // Get last 50 messages for analysis

      if (error || !messages) {
        throw new Error('Failed to fetch thread messages');
      }

      // Include new message if provided
      const allMessages = [
        ...messages.map(m => ({
          content: m.content || '',
          role: m.is_user_message ? 'user' as const : 'assistant' as const
        })),
        ...(newMessageContent ? [{ content: newMessageContent, role: 'user' as const }] : [])
      ];

      // Calculate token usage
      const tokenCount = tokenManager.estimate(allMessages.map(m => m.content).join(' '));
      const contextValidation = tokenManager.validateContext(allMessages, userTier);
      
      const messageCount = allMessages.length;
      const contextUsage = contextValidation.percentage;

      // Determine recommended action
      let recommendedAction: ThreadAction = 'continue';
      let warningLevel: ThreadStatus['warningLevel'] = 'none';

      if (contextValidation.action === 'new_thread') {
        recommendedAction = userTier === 'premium' ? 'compress_context' : 'force_new_thread';
        warningLevel = 'critical';
      } else if (contextValidation.action === 'compress' && userTier === 'premium') {
        recommendedAction = 'compress_context';
        warningLevel = 'warning';
      } else if (contextValidation.action === 'warn') {
        recommendedAction = 'show_warning';
        warningLevel = contextUsage > 90 ? 'warning' : 'info';
      }

      // Special handling for free/basic users at 85%
      if ((userTier === 'free' || userTier === 'basic') && contextUsage > 85) {
        recommendedAction = 'suggest_new_thread';
        warningLevel = 'warning';
      }

      return {
        threadId: chatSessionId,
        tokenCount,
        messageCount,
        contextUsage,
        recommendedAction,
        warningLevel
      };

    } catch (error) {
      console.error('Error analyzing thread status:', error);
      return {
        threadId: chatSessionId,
        tokenCount: 0,
        messageCount: 0,
        contextUsage: 0,
        recommendedAction: 'continue',
        warningLevel: 'none'
      };
    }
  }

  /**
   * Generate context warnings for UI display
   */
  generateThreadWarning(
    threadStatus: ThreadStatus,
    userTier: UserTier
  ): ThreadWarning | null {
    if (threadStatus.recommendedAction === 'continue') {
      return null;
    }

    const { contextUsage, tokenCount, recommendedAction } = threadStatus;

    switch (recommendedAction) {
      case 'show_warning':
        return {
          type: 'context_warning',
          message: `This conversation is getting long (${Math.round(contextUsage)}% of context window used).`,
          currentUsage: tokenCount,
          limit: this.getTierContextLimit(userTier),
          percentage: contextUsage,
          actionRequired: false,
          upgradePrompt: userTier !== 'premium' ? 'Upgrade for longer conversations!' : undefined
        };

      case 'suggest_new_thread':
        return {
          type: 'new_thread_suggested',
          message: `Conversation is getting very long (${Math.round(contextUsage)}% full). Consider starting a new thread for better AI responses.`,
          currentUsage: tokenCount,
          limit: this.getTierContextLimit(userTier),
          percentage: contextUsage,
          actionRequired: false,
          upgradePrompt: userTier !== 'premium' ? 'Upgrade for longer conversations and smart compression!' : undefined
        };

      case 'force_new_thread':
        return {
          type: 'thread_limit',
          message: `Context window is full (${Math.round(contextUsage)}%). Please start a new conversation thread.`,
          currentUsage: tokenCount,
          limit: this.getTierContextLimit(userTier),
          percentage: contextUsage,
          actionRequired: true,
          upgradePrompt: userTier !== 'premium' ? 'Upgrade to Premium for automatic context compression!' : undefined
        };

      case 'compress_context':
        return {
          type: 'context_warning',
          message: `Context window is full. Premium feature: Smart compression will be applied automatically.`,
          currentUsage: tokenCount,
          limit: this.getTierContextLimit(userTier),
          percentage: contextUsage,
          actionRequired: false
        };

      default:
        return null;
    }
  }

  /**
   * Smart context compression for premium users
   */
  async compressContext(
    chatSessionId: string,
    targetReduction: number = 0.5
  ): Promise<ThreadCompressionResult> {
    try {
      // Get all messages in chronological order
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_session_id', chatSessionId)
        .order('created_at', { ascending: true });

      if (error || !messages || messages.length < 10) {
        throw new Error('Cannot compress thread with fewer than 10 messages');
      }

      const originalTokens = tokenManager.estimate(
        messages.map(m => m.content || '').join(' ')
      );

      // Keep recent messages (last 20% or minimum 5 messages)
      const keepRecentCount = Math.max(5, Math.ceil(messages.length * 0.2));
      const recentMessages = messages.slice(-keepRecentCount);
      const oldMessages = messages.slice(0, -keepRecentCount);

      // Generate summary of older messages
      const summary = this.generateConversationSummary(oldMessages);
      
      // Create compressed version: summary + recent messages
      const compressedContent = [summary, ...recentMessages.map(m => m.content || '')].join(' ');
      const compressedTokens = tokenManager.estimate(compressedContent);
      
      const compressionRatio = (originalTokens - compressedTokens) / originalTokens;

      // If compression isn't effective enough, remove more old messages
      if (compressionRatio < targetReduction && oldMessages.length > 5) {
        // More aggressive compression - keep only last 10 messages + summary
        const veryRecentMessages = messages.slice(-10);
        const veryOldMessages = messages.slice(0, -10);
        const aggressiveSummary = this.generateConversationSummary(veryOldMessages);
        
        // Replace old messages with summary in database
        await this.replaceMessagesWithSummary(chatSessionId, veryOldMessages, aggressiveSummary);
        
        const finalTokens = tokenManager.estimate(
          [aggressiveSummary, ...veryRecentMessages.map(m => m.content || '')].join(' ')
        );
        
        return {
          originalTokens,
          compressedTokens: finalTokens,
          compressionRatio: (originalTokens - finalTokens) / originalTokens,
          summary: aggressiveSummary,
          success: true
        };
      }

      // Apply standard compression
      await this.replaceMessagesWithSummary(chatSessionId, oldMessages, summary);

      return {
        originalTokens,
        compressedTokens,
        compressionRatio,
        summary,
        success: true
      };

    } catch (error) {
      console.error('Error compressing context:', error);
      return {
        originalTokens: 0,
        compressedTokens: 0,
        compressionRatio: 0,
        summary: 'Compression failed',
        success: false
      };
    }
  }

  /**
   * Generate a summary of conversation messages
   */
  private generateConversationSummary(messages: any[]): string {
    if (messages.length === 0) return '';

    // Extract key topics and user requests
    const userMessages = messages.filter(m => m.is_user_message);
    const aiResponses = messages.filter(m => !m.is_user_message);

    const topics = new Set<string>();
    const keyQuestions = [];
    
    // Simple keyword extraction
    for (const msg of userMessages) {
      if (msg.content) {
        const content = msg.content.toLowerCase();
        
        // Extract questions
        if (content.includes('?')) {
          const sentences = content.split(/[.!?]+/);
          const questions = sentences.filter(s => s.includes('?'));
          keyQuestions.push(...questions.slice(0, 2));
        }

        // Extract potential topics (simple keyword matching)
        const words = content.split(/\W+/);
        words.forEach(word => {
          if (word.length > 4 && !['what', 'when', 'where', 'which', 'would', 'could', 'should'].includes(word)) {
            topics.add(word);
          }
        });
      }
    }

    // Build summary
    const topicList = Array.from(topics).slice(0, 5).join(', ');
    const questionList = keyQuestions.slice(0, 3).join(' ');
    
    let summary = `[Previous conversation summary: ${messages.length} messages exchanged`;
    
    if (topicList) {
      summary += `, topics discussed: ${topicList}`;
    }
    
    if (questionList) {
      summary += `. Key questions: ${questionList}`;
    }
    
    summary += ']';

    return summary;
  }

  /**
   * Replace old messages with a summary in the database
   */
  private async replaceMessagesWithSummary(
    chatSessionId: string,
    oldMessages: any[],
    summary: string
  ): Promise<void> {
    if (oldMessages.length === 0) return;

    try {
      // Delete old messages
      const oldMessageIds = oldMessages.map(m => m.id);
      await supabase
        .from('chat_messages')
        .delete()
        .in('id', oldMessageIds);

      // Insert summary message at the beginning
      await supabase
        .from('chat_messages')
        .insert({
          chat_session_id: chatSessionId,
          content: summary,
          is_user_message: false,
          created_at: oldMessages[0].created_at // Use timestamp of first deleted message
        });

      console.log(`Compressed ${oldMessages.length} messages into summary for thread ${chatSessionId}`);

    } catch (error) {
      console.error('Error replacing messages with summary:', error);
      throw error;
    }
  }

  /**
   * Get tier context limit for calculations
   */
  getTierContextLimit(tier: UserTier): number {
    const limits = {
      anonymous: 32000,
      free: 128000,
      basic: 512000,
      premium: 2000000
    };
    return limits[tier] || 32000;
  }

  /**
   * Create a new chat session (thread)
   */
  async createNewThread(userId: string, title?: string): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          chat_title: title || `New Chat - ${new Date().toLocaleDateString()}`
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error('Failed to create new thread');
      }

      return data.id;
    } catch (error) {
      console.error('Error creating new thread:', error);
      throw error;
    }
  }

  /**
   * Get thread statistics for monitoring
   */
  async getThreadStats(chatSessionId: string): Promise<{
    messageCount: number;
    estimatedTokens: number;
    oldestMessage: string;
    newestMessage: string;
  } | null> {
    try {
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('content, created_at')
        .eq('chat_session_id', chatSessionId)
        .order('created_at', { ascending: true });

      if (error || !messages) {
        return null;
      }

      const estimatedTokens = tokenManager.estimate(
        messages.map(m => m.content || '').join(' ')
      );

      return {
        messageCount: messages.length,
        estimatedTokens,
        oldestMessage: messages[0]?.created_at || '',
        newestMessage: messages[messages.length - 1]?.created_at || ''
      };

    } catch (error) {
      console.error('Error getting thread stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const threadManager = new ThreadManager();