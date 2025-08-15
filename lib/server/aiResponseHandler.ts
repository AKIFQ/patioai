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
    console.log(`🔍 getModel called with modelId: "${modelId}"`);

    // Handle auto routing for free users
    if (modelId === 'auto') {
      console.log(`🔄 Auto routing triggered in getModel`);
      const context = this.modelRouter.analyzeMessageContext(messageContent || '', 1);
      const routedModel = this.modelRouter.routeModel({ tier: 'free' }, context, 'auto');
      console.log(`🔄 Auto routing result: ${routedModel}`);
      return openRouterService.getModel(routedModel);
    }

    // All models go through OpenRouter
    console.log(`🔄 Using model directly: ${modelId}`);
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
    chatHistory: Array<{ role: 'user' | 'assistant', content: string }> = [],
    reasoningMode: boolean = false
  ): Promise<void> {
    try {
      console.log(`🤖 Starting AI stream for room ${shareCode}, model: ${modelId}, REASONING MODE: ${reasoningMode}`);
      this.io.to(`room:${shareCode}`).emit('ai-stream-start', { threadId, timestamp: Date.now(), modelId });

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
      // Build richer analysis text from the latest few messages so short follow-ups like
      // "any other way to prove it?" consider prior mathematical context
      const recentHistoryText = chatHistory
        .slice(-4)
        .map(m => (typeof m.content === 'string' ? m.content : ''))
        .join(' ');
      const analysisText = `${currentMessage} ${recentHistoryText}`.trim();
      const messageContext = this.modelRouter.analyzeMessageContext(analysisText, chatHistory.length);
      const routedModelId = this.modelRouter.routeModel({ tier: 'free' }, messageContext, modelId, undefined, reasoningMode);

      console.log(`🎯 Model routing: ${modelId} → ${routedModelId} (${messageContext.complexity} complexity, reasoning: ${reasoningMode})`);

      // Debug: Log reasoning mode details
      if (reasoningMode) {
        console.log(`🧠 REASONING MODE ENABLED - Should use deepseek/deepseek-r1`);
      } else {
        console.log(`🚫 REASONING MODE DISABLED - Using regular routing`);
      }

      // Get provider options for reasoning models
      const providerOptions = openRouterService.getProviderOptions(routedModelId);

      console.log(`🔍 FINAL MODEL BEING USED: ${routedModelId}`);
      console.log(`🔍 getModel will be called with: ${routedModelId}`);

      // Set appropriate token limits based on model and context
      const getMaxTokens = (modelId: string, messageContext: string): number => {
        // For reasoning models, limit to prevent excessive costs
        if (modelId.includes('deepseek')) return 2000;
        
        // For premium models, allow more tokens
        if (modelId.includes('claude') || modelId.includes('gpt-4o') || modelId.includes('o1')) return 4000;
        
        // For general models like Gemini, set generous limits for quality responses
        // Analyze message complexity to determine appropriate response length
        const messageLength = messageContext.length;
        const isComplexQuery = messageContext.toLowerCase().includes('explain') || 
                              messageContext.toLowerCase().includes('how') ||
                              messageContext.toLowerCase().includes('why') ||
                              messageContext.toLowerCase().includes('what') ||
                              messageContext.includes('?');
        
        if (isComplexQuery || messageLength > 100) {
          return 3000; // Allow detailed responses for complex queries
        } else if (messageLength > 50) {
          return 2000; // Medium responses for medium queries
        } else {
          return 1500; // Still generous for short queries
        }
      };

      const maxTokens = getMaxTokens(routedModelId, currentMessage);
      console.log(`🎯 Setting maxTokens to ${maxTokens} for model ${routedModelId} (message length: ${currentMessage.length})`);
      
      // Debug: Log the actual prompt being sent
      console.log(`🔍 SYSTEM PROMPT (first 500 chars):`, promptResult.system.substring(0, 500));
      console.log(`🔍 LAST MESSAGE:`, promptResult.messages[promptResult.messages.length - 1]?.content?.substring(0, 200));

      const result = streamText({
        model: this.getModel(routedModelId, currentMessage),
        system: promptResult.system,
        messages: promptResult.messages,
        providerOptions,
        maxTokens,
        temperature: 0.7, // Add some creativity for more engaging responses
        abortSignal: routedModelId.includes('deepseek') ?
          AbortSignal.timeout(45000) : undefined // 45 second timeout for reasoning
      });

      let fullText = '';
      let fullReasoning = '';
      let hasReasoningStarted = false;
      let usageTotals: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};
      let inThinkBlock = false;
      // DeepSeek R1 uses <think> tags, other models may use different formats
      const startMarkers = ['<think>', '<thinking>', '<reasoning>', '<thought>', '<chain_of_thought>'];
      const endMarkers = ['</think>', '</thinking>', '</reasoning>', '</thought>', '</chain_of_thought>'];

      if (process.env.NODE_ENV === 'development') console.log(`🧠 Starting AI stream for model: ${routedModelId}`);

      // Use AI SDK's proper streaming interface with error handling
      console.log(`🔄 Starting streaming loop for model: ${routedModelId}`);

      for await (const delta of result.fullStream) {
        console.log(`📦 Received delta:`, delta.type);
        // Debug: Log all delta types for DeepSeek R1 to understand the format
        if (routedModelId.includes('deepseek')) {
          const deltaAny = delta as any;
          console.log(`🔍 DeepSeek delta:`, delta.type, deltaAny.textDelta ? `"${deltaAny.textDelta.substring(0, 50)}..."` : 'no text');
        }

        if (delta.type === 'text-delta') {
          const chunk = delta.textDelta;
          fullText += chunk;

          // OpenRouter-specific: Extract reasoning from streaming text chunks
          // DeepSeek R1 includes <think> tags in the normal text stream
          if (routedModelId.includes('deepseek') && chunk.includes('<think>')) {
            console.log(`🧠 Found <think> tag in chunk:`, chunk.substring(0, 100));

            // Extract reasoning content between <think> tags
            const thinkMatch = chunk.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
            if (thinkMatch) {
              const reasoningContent = thinkMatch[1];
              if (reasoningContent.trim()) {
                fullReasoning += reasoningContent;

                if (!hasReasoningStarted) {
                  hasReasoningStarted = true;
                  console.log(`🧠 Starting reasoning UI for DeepSeek`);
                  this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', {
                    threadId,
                    timestamp: Date.now(),
                    modelUsed: routedModelId
                  });
                }

                this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
                  threadId,
                  reasoning: fullReasoning,
                  timestamp: Date.now(),
                  modelUsed: routedModelId
                });
              }
            }
          }

          // Stream main content
          this.io.to(`room:${shareCode}`).emit('ai-stream-chunk', {
            threadId,
            chunk,
            timestamp: Date.now(),
            modelUsed: routedModelId
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
                timestamp: Date.now(),
                modelUsed: routedModelId
              });
            }

            // Stream cumulative reasoning for smooth UI updates
            this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
              threadId,
              reasoning: fullReasoning,
              timestamp: Date.now(),
              modelUsed: routedModelId
            });
          }
        }
        else if (delta.type === 'step-finish' || delta.type === 'finish') {
          const anyDelta = delta as any;
          const u = anyDelta.usage || anyDelta.response?.usage;
          if (u) {
            usageTotals = {
              promptTokens: u.promptTokens ?? usageTotals.promptTokens,
              completionTokens: u.completionTokens ?? usageTotals.completionTokens,
              totalTokens: (u.promptTokens ?? 0) + (u.completionTokens ?? 0)
            };
          }

          // Debug: Log finish delta for DeepSeek to see if reasoning is included
          if (routedModelId.includes('deepseek')) {
            console.log(`🔍 DeepSeek finish delta:`, JSON.stringify(anyDelta, null, 2));

            // Check for reasoning tokens in OpenRouter response
            const reasoningTokens = anyDelta.providerMetadata?.openai?.reasoningTokens ||
              anyDelta.experimental_providerMetadata?.openai?.reasoningTokens;

            if (reasoningTokens && reasoningTokens > 0) {
              console.log(`🧠 Found ${reasoningTokens} reasoning tokens - creating synthetic reasoning UI`);

              // Create informative reasoning indicator since OpenRouter doesn't expose the actual reasoning
              const syntheticReasoning = `🧠 **DeepSeek R1 Reasoning Process**

The model engaged in ${reasoningTokens} tokens of internal reasoning to analyze your question. While the specific reasoning steps aren't exposed by OpenRouter, the model considered:

• Multiple philosophical perspectives
• Logical connections and implications  
• Relevant examples and counterarguments
• How to structure a comprehensive response

*Note: This represents the reasoning process that occurred, though the actual reasoning content isn't accessible through OpenRouter's API.*`;

              if (!hasReasoningStarted) {
                hasReasoningStarted = true;
                this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', {
                  threadId,
                  timestamp: Date.now(),
                  modelUsed: routedModelId
                });
              }

              this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
                threadId,
                reasoning: syntheticReasoning,
                timestamp: Date.now(),
                modelUsed: routedModelId
              });

              fullReasoning = syntheticReasoning;
            }
          }

          // Some providers (or routes) include reasoning only at the end
          let finalReasoning: string | undefined;
          const r =
            anyDelta.reasoning ??
            anyDelta.reasoningText ??
            anyDelta.response?.reasoning ??
            anyDelta.response?.message?.reasoning ??
            undefined;
          if (Array.isArray(r)) {
            finalReasoning = r.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('');
          } else if (typeof r === 'string') {
            finalReasoning = r;
          }
          if (finalReasoning && finalReasoning.trim().length > 0) {
            console.log(`🧠 Found reasoning in finish delta:`, finalReasoning.substring(0, 100));
            fullReasoning = finalReasoning;
            if (!hasReasoningStarted) {
              hasReasoningStarted = true;
              this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', {
                threadId,
                timestamp: Date.now(),
                modelUsed: routedModelId
              });
            }
            this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
              threadId,
              reasoning: fullReasoning,
              timestamp: Date.now(),
              modelUsed: routedModelId
            });
          }
        }

        // Handle other delta types that might contain reasoning/thought content
        else {
          // Quiet by default

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
            if (process.env.NODE_ENV === 'development') console.debug(`💭 thought from ${delta.type}`);

            // For delta types, append; for complete types, replace
            if (delta.type.includes('delta') || delta.type.includes('chunk')) {
              fullReasoning += thoughtContent;
            } else {
              fullReasoning = thoughtContent;
            }

            // Start reasoning if not already started
            if (!hasReasoningStarted) {
              hasReasoningStarted = true;
              if (process.env.NODE_ENV === 'development') console.debug(`🧠 thoughts started for ${routedModelId} (${delta.type})`);
              this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', {
                threadId,
                timestamp: Date.now(),
                modelUsed: routedModelId
              });
            }

            // Stream thought content
            this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
              threadId,
              reasoning: fullReasoning,
              timestamp: Date.now(),
              modelUsed: routedModelId
            });
          }
        }
      }

      // End reasoning if it was started
      if (hasReasoningStarted && fullReasoning) {
        console.log(`🧠 Completing reasoning UI (${fullReasoning.length} chars total)`);
        this.io.to(`room:${shareCode}`).emit('ai-reasoning-end', {
          threadId,
          reasoning: fullReasoning,
          timestamp: Date.now(),
          modelUsed: routedModelId
        });
      }

      // Signal that main content is starting
      this.io.to(`room:${shareCode}`).emit('ai-content-start', {
        threadId,
        timestamp: Date.now(),
        modelUsed: routedModelId
      });

      // Final check: Extract reasoning from fullText if not found during streaming
      // This handles cases where reasoning comes in large chunks or at the end
      if (routedModelId.includes('deepseek') && fullText.includes('<think>')) {
        console.log(`🔍 Final extraction: Found <think> tags in complete response`);

        // Extract all reasoning content
        const thinkMatches = fullText.match(/<think>([\s\S]*?)<\/think>/g);
        if (thinkMatches) {
          const allReasoning = thinkMatches
            .map(match => match.replace(/<\/?think>/g, ''))
            .join('\n\n')
            .trim();

          if (allReasoning && allReasoning !== fullReasoning) {
            fullReasoning = allReasoning;
            console.log(`🧠 Final reasoning extracted (${allReasoning.length} chars):`, allReasoning.substring(0, 100));

            // Clean the display text
            fullText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

            // Emit reasoning events if not already started
            if (!hasReasoningStarted) {
              this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', {
                threadId,
                timestamp: Date.now(),
                modelUsed: routedModelId
              });
            }

            this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
              threadId,
              reasoning: fullReasoning,
              timestamp: Date.now(),
              modelUsed: routedModelId
            });
          }
        }
      }

      this.io.to(`room:${shareCode}`).emit('ai-stream-end', {
        threadId,
        text: fullText,
        reasoning: fullReasoning || undefined,
        timestamp: Date.now(),
        modelUsed: routedModelId,
        usage: usageTotals
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