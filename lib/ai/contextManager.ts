interface RoomMessage {
  id: string;
  sender_name: string;
  content: string;
  is_ai_response: boolean;
  created_at: string;
  thread_id: string;
}

interface CompressedContext {
  recentMessages: RoomMessage[];
  summarizedHistory: string;
  codeBlocks: Map<string, string>; // hash -> code
  totalTokens: number;
}

export class ContextManager {
  private readonly MAX_CONTEXT_TOKENS = 24000; // Reserve 8k for response
  private readonly RECENT_MESSAGE_COUNT = 10;
  private codeBlockCache = new Map<string, string>();

  /**
   * Compress conversation context to fit within token limits
   */
  compressContext(messages: RoomMessage[]): CompressedContext {
    // Always keep recent messages full
    const recentMessages = messages.slice(-this.RECENT_MESSAGE_COUNT);
    const olderMessages = messages.slice(0, -this.RECENT_MESSAGE_COUNT);

    // Extract and deduplicate code blocks
    this.extractCodeBlocks(messages);

    // Summarize older messages
    const summarizedHistory = this.summarizeMessages(olderMessages);

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const recentTokens = this.estimateTokens(recentMessages.map(m => m.content).join(' '));
    const summaryTokens = this.estimateTokens(summarizedHistory);
    const totalTokens = recentTokens + summaryTokens;

    return {
      recentMessages,
      summarizedHistory,
      codeBlocks: this.codeBlockCache,
      totalTokens
    };
  }

  /**
   * Extract and cache code blocks to avoid repetition
   */
  private extractCodeBlocks(messages: RoomMessage[]): void {
    messages.forEach(msg => {
      const codeBlocks = msg.content.match(/```[\s\S]*?```/g);
      if (codeBlocks) {
        codeBlocks.forEach(block => {
          const hash = this.hashCode(block);
          this.codeBlockCache.set(hash, block);
        });
      }
    });
  }

  /**
   * Summarize older messages to reduce token usage
   */
  private summarizeMessages(messages: RoomMessage[]): string {
    if (messages.length === 0) return '';

    const participants = [...new Set(messages.map(m => m.sender_name))];
    const topics = this.extractTopics(messages);
    const keyDecisions = this.extractKeyDecisions(messages);

    return `Previous conversation summary:
- Participants: ${participants.join(', ')}
- Topics discussed: ${topics.join(', ')}
- Key decisions/conclusions: ${keyDecisions.join('; ')}
- Message count: ${messages.length}`;
  }

  /**
   * Extract main topics from messages
   */
  private extractTopics(messages: RoomMessage[]): string[] {
    const content = messages.map(m => m.content).join(' ').toLowerCase();
    const commonTopics = ['code', 'bug', 'feature', 'design', 'api', 'database', 'frontend', 'backend'];
    
    return commonTopics.filter(topic => content.includes(topic));
  }

  /**
   * Extract key decisions or conclusions
   */
  private extractKeyDecisions(messages: RoomMessage[]): string[] {
    const decisions: string[] = [];
    
    messages.forEach(msg => {
      const content = msg.content.toLowerCase();
      if (content.includes('decided') || content.includes('agreed') || content.includes('conclusion')) {
        decisions.push(msg.content.substring(0, 100) + '...');
      }
    });

    return decisions.slice(0, 3); // Keep top 3 decisions
  }

  /**
   * Simple hash function for code blocks
   */
  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Rough token estimation (1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Clean old cache entries
   */
  cleanCache(): void {
    if (this.codeBlockCache.size > 100) {
      // Keep only the 50 most recent entries
      const entries = Array.from(this.codeBlockCache.entries());
      this.codeBlockCache.clear();
      entries.slice(-50).forEach(([key, value]) => {
        this.codeBlockCache.set(key, value);
      });
    }
  }
}