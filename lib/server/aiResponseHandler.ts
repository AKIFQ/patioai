import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket } from '../../types/socket';

interface AIResponseConfig {
  triggerWords: string[];
  mentionPattern: RegExp;
  questionPattern: RegExp;
  enabled: boolean;
}

const defaultConfig: AIResponseConfig = {
  triggerWords: ['ai', 'assistant', 'help', 'question', 'explain'],
  mentionPattern: /@ai|@assistant/i,
  questionPattern: /\?$/,
  enabled: true
};

export class AIResponseHandler {
  private io: SocketIOServer;
  private config: AIResponseConfig;

  constructor(io: SocketIOServer, config: Partial<AIResponseConfig> = {}) {
    this.io = io;
    this.config = { ...defaultConfig, ...config };
  }

  // Check if a message should trigger an AI response
  shouldTriggerAI(message: string, senderName: string): boolean {
    if (!this.config.enabled) return false;

    // Don't respond to AI messages
    if (senderName === 'AI Assistant') return false;

    const lowerMessage = message.toLowerCase();

    // Check for direct mentions
    if (this.config.mentionPattern.test(message)) {
      return true;
    }

    // Check for questions
    if (this.config.questionPattern.test(message.trim())) {
      return true;
    }

    // Check for trigger words
    return this.config.triggerWords.some(word => 
      lowerMessage.includes(word.toLowerCase())
    );
  }

  // Handle AI response for room messages
  async handleAIResponse(
    shareCode: string, 
    threadId: string, 
    originalMessage: string, 
    senderName: string,
    roomName: string,
    participants: string[]
  ): Promise<void> {
    try {
      if (!this.shouldTriggerAI(originalMessage, senderName)) {
        return;
      }

      console.log(`AI response triggered for room ${shareCode} by ${senderName}`);

      // Emit typing indicator for AI
      this.io.to(`room:${shareCode}`).emit('user-typing', {
        users: ['AI Assistant'],
        roomId: shareCode,
        timestamp: new Date().toISOString()
      });

      // Simulate AI processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate AI response based on context
      const aiResponse = this.generateAIResponse(
        originalMessage, 
        senderName, 
        roomName, 
        participants
      );

      // Stop typing indicator
      this.io.to(`room:${shareCode}`).emit('user-typing', {
        users: [],
        roomId: shareCode,
        timestamp: new Date().toISOString()
      });

      // Emit AI response as room message
      this.io.to(`room:${shareCode}`).emit('room-message-created', {
        new: {
          id: `ai-${Date.now()}`,
          room_id: shareCode, // Using shareCode for consistency
          thread_id: threadId,
          sender_name: 'AI Assistant',
          content: aiResponse,
          is_ai_response: true,
          created_at: new Date().toISOString()
        },
        eventType: 'INSERT',
        table: 'room_messages',
        schema: 'public'
      });

      console.log(`AI response sent to room ${shareCode}`);
    } catch (error) {
      console.error('Error handling AI response:', error);
      
      // Stop typing indicator on error
      this.io.to(`room:${shareCode}`).emit('user-typing', {
        users: [],
        roomId: shareCode,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Generate contextual AI response
  private generateAIResponse(
    message: string, 
    senderName: string, 
    roomName: string, 
    participants: string[]
  ): string {
    const responses = [
      `Hi ${senderName}! I'm here to help. What would you like to know?`,
      `Thanks for the question, ${senderName}. Let me think about that...`,
      `Hello everyone in ${roomName}! ${senderName} asked a great question.`,
      `I see ${participants.length} participants here. ${senderName}, how can I assist?`,
      `That's an interesting point, ${senderName}. Here's what I think...`
    ];

    // Simple response selection based on message content
    if (message.toLowerCase().includes('help')) {
      return `Hi ${senderName}! I'm the AI assistant for ${roomName}. I can help answer questions, provide explanations, or assist with discussions. What would you like to know?`;
    }

    if (message.toLowerCase().includes('question')) {
      return `Great question, ${senderName}! I'm ready to help. Could you provide more details about what you'd like to know?`;
    }

    if (this.config.mentionPattern.test(message)) {
      return `Hello ${senderName}! You mentioned me - how can I assist you and the ${participants.length} participants in ${roomName}?`;
    }

    if (this.config.questionPattern.test(message.trim())) {
      return `That's a thoughtful question, ${senderName}. Let me provide some insights that might help everyone in ${roomName}.`;
    }

    // Default response
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Update configuration
  updateConfig(newConfig: Partial<AIResponseConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('AI response configuration updated:', this.config);
  }

  // Enable/disable AI responses
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`AI responses ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Factory function to create AI response handler
export function createAIResponseHandler(
  io: SocketIOServer, 
  config?: Partial<AIResponseConfig>
): AIResponseHandler {
  return new AIResponseHandler(io, config);
}