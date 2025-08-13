import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket } from '../../types/socket';
import { streamText } from 'ai';
import { RoomPromptEngine } from '../ai/roomPromptEngine';
import { ContextManager } from '../ai/contextManager';
import { ModelRouter } from '../ai/modelRouter';
import { openRouterService } from '../ai/openRouterService';

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
  private promptEngine: RoomPromptEngine;
  private contextManager: ContextManager;
  private modelRouter: ModelRouter;

  constructor(io: SocketIOServer, config: Partial<AIResponseConfig> = {}) {
    this.io = io;
    this.config = { ...defaultConfig, ...config };
    this.promptEngine = new RoomPromptEngine();
    this.contextManager = new ContextManager();
    this.modelRouter = new ModelRouter();
  }

  // Get model through OpenRouter service
  private getModel(modelId: string, messageContent?: string) {
    // Handle auto routing for free users
    if (modelId === 'auto') {
      const context = this.modelRouter.analyzeMessageContext(messageContent || '', 1);
      const routedModel = this.modelRouter.routeModel({ tier: 'free' }, context, 'auto');
      return openRouterService.getModel(routedModel);
    }

    // All models go through OpenRouter
    return openRouterService.getModel(modelId);
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

  // Streaming AI over Socket.IO with reasoning support
  async streamAIResponse(
    shareCode: string,
    threadId: string,
    prompt: string,
    roomName: string,
    participants: string[],
    modelId: string = 'gpt-4o',
    chatHistory: Array<{role: 'user' | 'assistant', content: string}> = []
  ): Promise<void> {
    try {
      console.log(`🤖 Starting AI stream for room ${shareCode}, model: ${modelId}`);
      this.io.to(`room:${shareCode}`).emit('ai-stream-start', { threadId, timestamp: Date.now() });

      // Extract current user from prompt (format: "User: message")
      const promptMatch = prompt.match(/^(.+?):\s*(.+)$/);
      const currentUser = promptMatch ? promptMatch[1] : 'User';
      const currentMessage = promptMatch ? promptMatch[2] : prompt;

      // Convert chat history to message format for prompt engine
      const messages = chatHistory.map(msg => ({
        id: `msg-${Date.now()}-${Math.random()}`,
        sender_name: msg.role === 'assistant' ? 'AI Assistant' : currentUser,
        content: msg.content,
        is_ai_response: msg.role === 'assistant',
        created_at: new Date().toISOString(),
        thread_id: threadId
      }));

      // Compress context to reduce token usage
      const compressedContext = this.contextManager.compressContext(messages);
      console.log(`🗜️ Context compressed: ${messages.length} messages → ${compressedContext.totalTokens} tokens`);

      // Use sophisticated prompt engine for context-aware AI with compressed context
      const promptResult = this.promptEngine.generatePrompt(
        compressedContext.recentMessages,
        roomName,
        participants,
        currentUser,
        currentMessage,
        compressedContext.summarizedHistory
      );

      console.log(`🧠 AI context: ${chatHistory.length} previous messages + sophisticated analysis`);

      // Route model based on user tier and context
      const messageContext = this.modelRouter.analyzeMessageContext(currentMessage, chatHistory.length);
      const routedModelId = this.modelRouter.routeModel({ tier: 'free' }, messageContext, modelId);
      
      console.log(`🎯 Model routing: ${modelId} → ${routedModelId} (${messageContext.complexity} complexity)`);

      // Get provider options for reasoning models
      const providerOptions = openRouterService.getProviderOptions(routedModelId);

      const result = streamText({
        model: this.getModel(routedModelId, currentMessage),
        system: promptResult.system,
        messages: promptResult.messages,
        providerOptions
      });

      let fullText = '';
      let fullReasoning = '';
      let hasReasoningStarted = false;

      console.log(`🧠 Starting AI stream for model: ${modelId}`);

      // Use AI SDK's proper streaming interface
      for await (const delta of result.fullStream) {
        console.log(`🔍 Delta type received: ${delta.type}`, JSON.stringify(delta, null, 2));
        
        if (delta.type === 'text-delta') {
          const chunk = delta.textDelta;
          fullText += chunk;
          
          // Stream main content
          this.io.to(`room:${shareCode}`).emit('ai-stream-chunk', { 
            threadId, 
            chunk, 
            timestamp: Date.now() 
          });
        } 
        else if (delta.type === 'reasoning') {
          // Handle reasoning/thought content across providers
          const deltaAny = delta as any;
          const chunk =
            deltaAny.textDelta ?? // Gemini reasoning delta
            deltaAny.reasoning ??
            deltaAny.reasoningDelta ??
            deltaAny.thinkingDelta ??
            deltaAny.thoughtDelta ??
            '';

          if (typeof chunk === 'string' && chunk.length > 0) {
            fullReasoning += chunk;

            // Start reasoning if not already started
            if (!hasReasoningStarted) {
              hasReasoningStarted = true;
              this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', { 
                threadId, 
                timestamp: Date.now() 
              });
            }

            // Stream cumulative reasoning for smooth UI updates
            this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', { 
              threadId, 
              reasoning: fullReasoning, 
              timestamp: Date.now() 
            });
          }
        }

        // Handle other delta types that might contain reasoning/thought content
        else {
          // Log all delta types to understand what we're receiving
          console.log(`🔍 Delta type: ${delta.type}`, JSON.stringify(delta, null, 2));
          
          // Check if this delta contains thought-like content (flexible detection)
          const deltaAny = delta as any;
          
          // Check for various thought/reasoning properties
          const thoughtContent = 
            deltaAny.thoughts || 
            deltaAny.thought || 
            deltaAny.thoughtDelta ||
            deltaAny.thinking || 
            deltaAny.thinkingDelta ||
            deltaAny.reasoning ||
            deltaAny.reasoningDelta ||
            '';
            
          if (thoughtContent) {
            console.log(`💭 Found thought content in ${delta.type}:`, thoughtContent);
            
            // For delta types, append; for complete types, replace
            if (delta.type.includes('delta') || delta.type.includes('chunk')) {
              fullReasoning += thoughtContent;
            } else {
              fullReasoning = thoughtContent;
            }
            
            // Start reasoning if not already started
            if (!hasReasoningStarted) {
              hasReasoningStarted = true;
              console.log(`🧠 Thoughts started for ${modelId} (${delta.type})`);
              this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', { 
                threadId, 
                timestamp: Date.now() 
              });
            }
            
            // Stream thought content
            console.log(`💭 Sending thought from ${delta.type}:`, fullReasoning);
            this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', { 
              threadId, 
              reasoning: fullReasoning, 
              timestamp: Date.now() 
            });
          }
        }
      }

      // End reasoning if it was started
      if (hasReasoningStarted && fullReasoning) {
        this.io.to(`room:${shareCode}`).emit('ai-reasoning-end', { 
          threadId, 
          reasoning: fullReasoning, 
          timestamp: Date.now() 
        });
      }

      // Signal that main content is starting
      this.io.to(`room:${shareCode}`).emit('ai-content-start', { 
        threadId, 
        timestamp: Date.now() 
      });

      this.io.to(`room:${shareCode}`).emit('ai-stream-end', { 
        threadId, 
        text: fullText, 
        reasoning: fullReasoning || undefined,
        timestamp: Date.now() 
      });

      // NOTE: Don't emit room-message-created here as it causes duplicates
      // The client handles the final message via ai-stream-end event
      // The deferred DB save below is just for persistence

      // Defer DB persistence to avoid blocking
      setTimeout(async () => {
        try {
          const { SocketDatabaseService } = await import('../database/socketQueries');
          
          // Get the actual room_id from shareCode
          const roomValidation = await SocketDatabaseService.validateRoomAccess(shareCode);
          if (!roomValidation.valid || !roomValidation.room) {
            console.warn(`Failed to get room_id for shareCode ${shareCode}:`, roomValidation.error);
            return;
          }
          
          const result = await SocketDatabaseService.insertRoomMessage({
            roomId: roomValidation.room.id, // Use actual room UUID
            threadId,
            senderName: 'AI Assistant',
            content: fullText,
            isAiResponse: true,
            reasoning: fullReasoning || undefined
          });
          
          if (!result.success) {
            console.warn('Background insertRoomMessage failed:', result.error);
          } else {
            console.log(`✅ AI message saved to DB: ${result.messageId}`);
          }
        } catch (e) {
          console.warn('Background insertRoomMessage failed:', e);
        }
      }, 0);
    } catch (error) {
      console.error('❌ Error streaming AI response:', error);
      this.io.to(`room:${shareCode}`).emit('ai-error', { error: 'AI streaming failed', threadId });
    }
  }

  // Reasoning is now handled properly through AI SDK's built-in streaming interface

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