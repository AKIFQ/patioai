/**
 * Token Counting and Validation Utilities
 * Provides accurate token counting for different models and message validation
 */

import { type UserTier, getTierLimits } from '@/lib/limits/tierLimits';

/**
 * Estimate tokens from text using GPT-4 tokenization approximation
 * This is a rough estimate: 1 token ≈ 4 characters for English text
 * More accurate for code and structured content
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  
  // Base character-to-token ratio
  let tokens = Math.ceil(text.length / 4);
  
  // Adjust for special content types
  const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
  const inlineCode = text.match(/`[^`]+`/g) || [];
  const jsonContent = text.match(/\{[\s\S]*?\}/g) || [];
  
  // Code and JSON are more token-dense
  codeBlocks.forEach(block => {
    const blockTokens = Math.ceil(block.length / 3); // Code is ~3 chars per token
    tokens += blockTokens - Math.ceil(block.length / 4); // Adjust from base estimate
  });
  
  inlineCode.forEach(code => {
    const codeTokens = Math.ceil(code.length / 3);
    tokens += codeTokens - Math.ceil(code.length / 4);
  });
  
  jsonContent.forEach(json => {
    const jsonTokens = Math.ceil(json.length / 3.5); // JSON is token-dense
    tokens += jsonTokens - Math.ceil(json.length / 4);
  });
  
  return Math.max(1, tokens);
}

/**
 * Calculate tokens for conversation history
 */
export function estimateConversationTokens(messages: Array<{ content: string; role: string }>): number {
  let totalTokens = 0;
  
  // System overhead per message (role, formatting, etc.)
  const perMessageOverhead = 4;
  
  messages.forEach(message => {
    const contentTokens = estimateTokens(message.content);
    totalTokens += contentTokens + perMessageOverhead;
  });
  
  // Additional overhead for conversation structure
  const conversationOverhead = Math.ceil(messages.length * 0.5);
  
  return totalTokens + conversationOverhead;
}

/**
 * Validate message against tier limits
 */
export interface MessageValidationResult {
  valid: boolean;
  tokenCount: number;
  limit: number;
  reason?: string;
  suggestion?: string;
}

export function validateMessageTokens(
  messageContent: string,
  userTier: UserTier
): MessageValidationResult {
  const tokenCount = estimateTokens(messageContent);
  const tierLimits = getTierLimits(userTier);
  const limit = tierLimits.perMessageInputTokens || 8000;
  
  if (tokenCount <= limit) {
    return {
      valid: true,
      tokenCount,
      limit
    };
  }
  
  // Generate appropriate suggestions based on tier
  let suggestion = 'Please shorten your message.';
  
  if (userTier === 'anonymous') {
    suggestion = 'Anonymous users have limited message length. Sign up for longer messages!';
  } else if (userTier === 'free') {
    suggestion = 'Free users can send up to 16K tokens per message. Upgrade to Basic for 32K tokens.';
  } else if (userTier === 'basic') {
    suggestion = 'Basic users can send up to 32K tokens per message. Upgrade to Premium for 128K tokens.';
  } else if (userTier === 'premium') {
    suggestion = 'Even Premium users have a 128K token limit per message. Consider breaking this into multiple messages.';
  }
  
  return {
    valid: false,
    tokenCount,
    limit,
    reason: `Message too long: ${tokenCount} tokens exceeds ${limit} token limit for ${userTier} tier`,
    suggestion
  };
}

/**
 * Validate context window usage
 */
export interface ContextValidationResult {
  valid: boolean;
  currentTokens: number;
  limit: number;
  percentage: number;
  action: 'continue' | 'warn' | 'compress' | 'new_thread';
  reason?: string;
}

export function validateContextWindow(
  messages: Array<{ content: string; role: string }>,
  userTier: UserTier
): ContextValidationResult {
  const currentTokens = estimateConversationTokens(messages);
  const tierLimits = getTierLimits(userTier);
  const limit = tierLimits.contextWindowTokens || 32000;
  
  const percentage = (currentTokens / limit) * 100;
  
  let action: ContextValidationResult['action'] = 'continue';
  let reason: string | undefined;
  
  if (percentage >= 100) {
    action = userTier === 'premium' ? 'compress' : 'new_thread';
    reason = 'Context window full';
  } else if (percentage >= 95) {
    action = userTier === 'premium' ? 'compress' : 'new_thread';
    reason = 'Context window nearly full';
  } else if (percentage >= 80) {
    action = 'warn';
    reason = 'Context window filling up';
  }
  
  return {
    valid: percentage < 100,
    currentTokens,
    limit,
    percentage,
    action,
    reason
  };
}

/**
 * Suggest message compression techniques
 */
export function getCompressionSuggestions(tokenCount: number, limit: number): string[] {
  const suggestions: string[] = [];
  const ratio = tokenCount / limit;
  
  if (ratio > 2) {
    suggestions.push('This message is very long. Consider breaking it into multiple smaller messages.');
  }
  
  suggestions.push('Remove unnecessary details or examples');
  suggestions.push('Use shorter sentences and fewer adjectives');
  suggestions.push('Replace long code blocks with key excerpts');
  suggestions.push('Summarize repetitive content');
  
  return suggestions;
}

/**
 * Count tokens in file content for upload validation
 */
export function validateFileTokens(
  fileContent: string,
  userTier: UserTier
): { valid: boolean; tokens: number; maxTokens: number } {
  const tokens = estimateTokens(fileContent);
  const tierLimits = getTierLimits(userTier);
  
  // File content should fit within context window with room for conversation
  const maxTokens = Math.floor((tierLimits.contextWindowTokens || 32000) * 0.7);
  
  return {
    valid: tokens <= maxTokens,
    tokens,
    maxTokens
  };
}

/**
 * Utility class for token management
 */
export class TokenManager {
  estimate(text: string): number {
    return estimateTokens(text);
  }
  
  validateMessage(content: string, tier: UserTier): MessageValidationResult {
    return validateMessageTokens(content, tier);
  }
  
  validateContext(messages: Array<{ content: string; role: string }>, tier: UserTier): ContextValidationResult {
    return validateContextWindow(messages, tier);
  }
  
  getCompressionHelp(tokenCount: number, limit: number): string[] {
    return getCompressionSuggestions(tokenCount, limit);
  }
  
  validateFile(content: string, tier: UserTier) {
    return validateFileTokens(content, tier);
  }
}

// Export singleton
export const tokenManager = new TokenManager();