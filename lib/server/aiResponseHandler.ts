import type { Server as SocketIOServer } from 'socket.io';
import { streamText } from 'ai';
import { RoomPromptEngine } from '../ai/roomPromptEngine';
import { ContextManager } from '../ai/contextManager';
import { ModelRouter } from '../ai/modelRouter';
import { openRouterService } from '../ai/openRouterService';
import { userTierService } from '../ai/userTierService';
import { tierRateLimiter } from '../limits/rateLimiter';
import { getTierLimits } from '../limits/tierLimits';
import { withMemoryProtection, memoryProtection } from '../monitoring/memoryProtection';
import { roomTierService } from '../rooms/roomTierService';

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
  private activeStreams: Map<string, AbortController> = new Map();

  // Simple token estimation (roughly 4 characters per token)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  constructor(io: SocketIOServer, config: Partial<AIResponseConfig> = {}) {
    this.io = io;
    this.config = { ...defaultConfig, ...config };
    this.promptEngine = new RoomPromptEngine();
    this.contextManager = new ContextManager();
    this.modelRouter = new ModelRouter();
  }

  // Get model through OpenRouter service
  private getModel(modelId: string, messageContent?: string) {
// Get model called

    // Handle auto routing for free users
    if (modelId === 'auto') {
      // Auto routing triggered
      const context = this.modelRouter.analyzeMessageContext(messageContent || '', 1);
      const routedModel = this.modelRouter.routeModel({ tier: 'free' }, context, 'auto');
      // Auto routing completed
      return openRouterService.getModel(routedModel);
    }

    // All models go through OpenRouter
    // Using model directly
    return openRouterService.getModel(modelId);
  }

  // Direct model streaming - no complex fallbacks for free/basic tiers
  private async streamDirectly(params: {
    modelId: string;
    currentMessage: string;
    promptResult: any;
    providerOptions: any;
    maxTokens: number;
    threadId: string;
  }) {
    const { modelId, currentMessage, promptResult, providerOptions, maxTokens, threadId } = params;

    // Create abort controller for this stream
    const abortController = new AbortController();
    this.activeStreams.set(threadId, abortController);

    // Combine timeout and manual abort signals
    const timeoutSignal = modelId.includes('deepseek') ? AbortSignal.timeout(45000) : undefined;
    const abortSignal = timeoutSignal 
      ? AbortSignal.any([abortController.signal, timeoutSignal])
      : abortController.signal;

    return streamText({
      model: this.getModel(modelId, currentMessage) as any,
      system: promptResult.system,
      messages: promptResult.messages,
      providerOptions,
      maxTokens,
      temperature: 0.7,
      abortSignal
    });
  }

  // Premium tier fallback - try secondary model if primary fails
  private async streamWithPremiumFallback(params: {
    primaryModelId: string;
    currentMessage: string;
    promptResult: any;
    providerOptions: any;
    maxTokens: number;
    shareCode: string;
    threadId: string;
  }) {
    const { primaryModelId, currentMessage, promptResult, providerOptions, maxTokens, shareCode, threadId } = params;

    try {
      // Try primary model
      return await this.streamDirectly({
        modelId: primaryModelId,
        currentMessage,
        promptResult,
        providerOptions,
        maxTokens,
        threadId
      });
    } catch (error: any) {
      // For premium users, try fallback to reliable model
      const fallbackModelId = 'openai/gpt-4o'; // Reliable premium fallback

      console.warn(`Premium model ${primaryModelId} failed, falling back to ${fallbackModelId}:`, error.message);

      // Emit fallback notification to premium user
this.io.to(`room:${shareCode}`).emit('ai-fallback-used', {
        threadId,
        primaryModel: primaryModelId,
        fallbackModel: fallbackModelId,
        reason: 'premium_model_error',
        timestamp: Date.now()
      });

      // Try fallback model
      return await this.streamDirectly({
        modelId: fallbackModelId,
        currentMessage,
        promptResult,
        providerOptions,
        maxTokens,
        threadId
      });
    }
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

      // AI response triggered

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

      // AI response sent
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
    userId: string,
    modelId = 'gpt-4o',
    chatHistory: { role: 'user' | 'assistant', content: string }[] = [],
    reasoningMode = false
  ): Promise<void> {
    // Declare these outside try block so they're accessible in catch
    let fullText = '';
    let fullReasoning = '';
    
    try {
      // Check memory protection circuit breaker FIRST
      if (memoryProtection.shouldBlockOperation()) {
        this.io.to(`room:${shareCode}`).emit('ai-error', { 
          error: 'System under high load. Please try again in a few moments.',
          threadId,
          systemOverload: true
        });
        return;
      }

      // Check room-level AI limits FIRST (most restrictive)
      console.log(`🔍 Checking room AI limits for ${shareCode} (reasoning: ${reasoningMode})`);
      const roomLimitCheck = await roomTierService.checkRoomAILimits(shareCode, threadId, reasoningMode);
      
      if (!roomLimitCheck.allowed) {
        console.log(`❌ Room AI limit exceeded:`, roomLimitCheck);
        this.io.to(`room:${shareCode}`).emit('ai-error', { 
          error: `Room ${reasoningMode ? 'reasoning' : 'AI'} response limit exceeded (${roomLimitCheck.currentUsage}/${roomLimitCheck.limit}). Resets ${roomLimitCheck.resetTime ? new Date(roomLimitCheck.resetTime).toLocaleTimeString() : 'soon'}.`,
          threadId,
          roomLimitExceeded: true,
          limitType: 'room',
          currentUsage: roomLimitCheck.currentUsage,
          limit: roomLimitCheck.limit,
          resetTime: roomLimitCheck.resetTime
        });
        return;
      }

      // Get user tier and check individual user rate limits
      const userSubscription = await userTierService.getUserTier(userId);
      const limiterCheck = await tierRateLimiter.check(userId, userSubscription.tier as any, reasoningMode ? 'reasoning_messages' : 'ai_requests');
      
      if (!limiterCheck.allowed) {
        // Rate limit exceeded - notify user
        this.io.to(`room:${shareCode}`).emit('ai-error', { 
          error: limiterCheck.reason || 'Rate limit exceeded. Please try again later.',
          threadId,
          rateLimited: true
        });
        return;
      }

      // Check context window limits based on user tier
      const tierLimits = getTierLimits(userSubscription.tier as any);
      const currentPromptTokens = this.estimateTokens(prompt);
      const historyTokens = chatHistory.reduce((total, msg) => total + this.estimateTokens(msg.content), 0);
      const totalInputTokens = currentPromptTokens + historyTokens;

      // Check per-message input token limit
      if (currentPromptTokens > tierLimits.perMessageInputTokens!) {
        this.io.to(`room:${shareCode}`).emit('ai-error', { 
          error: `Message too long. Maximum ${tierLimits.perMessageInputTokens!.toLocaleString()} tokens allowed per message for ${userSubscription.tier} tier. Your message: ${currentPromptTokens.toLocaleString()} tokens.`,
          threadId,
          tokenLimitExceeded: true
        });
        return;
      }

      // Check total context window limit
      if (totalInputTokens > tierLimits.contextWindowTokens!) {
        this.io.to(`room:${shareCode}`).emit('ai-error', { 
          error: `Context too large. Maximum ${tierLimits.contextWindowTokens!.toLocaleString()} tokens allowed for ${userSubscription.tier} tier. Current context: ${totalInputTokens.toLocaleString()} tokens.`,
          threadId,
          contextLimitExceeded: true
        });
        return;
      }

      // Starting AI stream
      this.io.to(`room:${shareCode}`).emit('ai-stream-start', { threadId, timestamp: Date.now(), modelId });

      // Extract current user from prompt (format: "User: message")
      const promptMatch = /^(.+?):\s*(.+)$/.exec(prompt);
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
      // Context compressed

      // Use sophisticated prompt engine for context-aware AI with compressed context
      const promptResult = this.promptEngine.generatePrompt(
        compressedContext.recentMessages,
        roomName,
        participants,
        currentUser,
        currentMessage,
        compressedContext.summarizedHistory
      );

      // AI context prepared

      // Route model based on user tier and context
      // Build richer analysis text from the latest few messages so short follow-ups like
      // "any other way to prove it?" consider prior mathematical context
      const recentHistoryText = chatHistory
        .slice(-4)
        .map(m => (typeof m.content === 'string' ? m.content : ''))
        .join(' ');
const analysisText = `${currentMessage} ${recentHistoryText}`.trim();
      const messageContext = this.modelRouter.analyzeMessageContext(analysisText, chatHistory.length);

      // Determine user tier (for now assume free, but this should come from user data)
      // TODO: Get actual user tier from session/auth data
      const userTier: 'free' | 'basic' | 'premium' = 'free' as 'free' | 'basic' | 'premium';
      
      // Route model based on tier and context
      const routedModelId = this.modelRouter.routeModel({ tier: userTier }, messageContext, modelId, undefined, reasoningMode);

      // Model routing completed

      // Check reasoning mode
      if (reasoningMode) {
        console.log(`🎯 Starting AI stream for model: ${routedModelId} (reasoning: ${reasoningMode})`);
      } else {
        // Regular routing
      }

      // Get provider options for reasoning models
      const providerOptions = openRouterService.getProviderOptions(routedModelId);

      console.log(`🔧 Provider options for ${routedModelId}:`, JSON.stringify(providerOptions, null, 2));

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

      // Choose streaming strategy based on user tier
      const result = userTier === 'premium' 
        ? await this.streamWithPremiumFallback({
            primaryModelId: routedModelId,
            currentMessage,
            promptResult,
            providerOptions,
            maxTokens,
            shareCode,
            threadId
          })
        : await this.streamDirectly({
            modelId: routedModelId,
            currentMessage,
            promptResult,
            providerOptions,
            maxTokens,
            threadId
          });

      let hasReasoningStarted = false;
      let usageTotals: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};

      // CRITICAL: Memory protection - prevent OOM from huge AI responses
      const MAX_RESPONSE_SIZE = 500000; // 500KB limit for main response
      const MAX_REASONING_SIZE = 200000; // 200KB limit for reasoning
      let isTruncated = false;

      console.log(`🎯 Starting AI stream for model: ${routedModelId} (reasoning: ${reasoningMode})`);

      // Use AI SDK's proper streaming interface with error handling
      // Starting streaming loop

      for await (const delta of result.fullStream) {
        if (process.env.NODE_ENV === 'development') console.debug('Received delta:', delta.type);

        // Handle error deltas - simple error handling without fallbacks
        if (delta.type === 'error') {
          const deltaAny = delta as any;
          console.error('🚨 AI Response Handler Error:', deltaAny);

          const errorMessage = deltaAny.error?.message || JSON.stringify(deltaAny.error);

          // Emit error directly without complex fallback logic
          this.io.to(`room:${shareCode}`).emit('ai-error', {
            threadId,
            error: 'Model failed to generate response',
            details: errorMessage,
            timestamp: Date.now()
          });

          // End the stream with error
          this.io.to(`room:${shareCode}`).emit('ai-stream-end', {
            threadId,
            text: 'Sorry, I encountered an error while processing your request. Please try again.',
            timestamp: Date.now(),
            modelUsed: routedModelId,
            error: true
          });

          return; // Exit early on error
        }

        // Handle main text deltas
        if (delta.type === 'text-delta') {
          let chunk = delta.textDelta || '';

          // CRITICAL: Check size limits to prevent memory explosions
          if (fullText.length + chunk.length > MAX_RESPONSE_SIZE) {
            if (!isTruncated) {
              console.warn('AI response truncated for memory protection');
              isTruncated = true;
              fullText += '\n\n[Response truncated due to size limits]';

              // Emit truncation warning to client
              this.io.to(`room:${shareCode}`).emit('ai-stream-chunk', {
                threadId,
                chunk: '\n\n[Response truncated due to size limits]',
                timestamp: Date.now(),
                modelUsed: routedModelId,
                truncated: true
              });
            }
            // Stop processing more chunks to prevent memory growth
            break;
          }

          // Handle DeepSeek R1 <think> tag processing for reasoning
          if (routedModelId.includes('deepseek') && chunk && chunk.includes('<think>')) {
            const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
            let match: RegExpExecArray | null;
            while ((match = thinkRegex.exec(chunk)) !== null) {
              const reasoningContent = match[1];
              if (reasoningContent && reasoningContent.trim()) {
                if (!hasReasoningStarted) {
                  hasReasoningStarted = true;
                  this.io.to(`room:${shareCode}`).emit('ai-reasoning-start', {
                    threadId,
                    timestamp: Date.now(),
                    modelUsed: routedModelId
                  });
                }
                fullReasoning += reasoningContent;
                this.io.to(`room:${shareCode}`).emit('ai-reasoning-chunk', {
                  threadId,
                  reasoning: reasoningContent,
                  timestamp: Date.now(),
                  modelUsed: routedModelId
                });
              }
            }
            // Strip all <think> blocks from main content
            chunk = chunk ? chunk.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/g, '') : '';
          }

          fullText += chunk;

          // Stream main content (only if chunk has content after think tag removal)
          if (chunk) {
            this.io.to(`room:${shareCode}`).emit('ai-stream-chunk', {
              threadId,
              chunk,
              timestamp: Date.now(),
              modelUsed: routedModelId
            });
          }
        }
        // Handle reasoning deltas from other models
        else if (delta.type === 'reasoning') {
          const deltaAny = delta as any;
          const reasoningChunk = deltaAny.reasoning || deltaAny.textDelta || '';

          if (typeof reasoningChunk === 'string' && reasoningChunk.length > 0) {
            // CRITICAL: Check reasoning size limits
            if (fullReasoning.length + reasoningChunk.length > MAX_REASONING_SIZE) {
              console.warn('AI reasoning truncated for memory protection');
              if (!fullReasoning.includes('[Reasoning truncated due to size limits]')) {
                fullReasoning += '\n\n[Reasoning truncated due to size limits]';
              }
            } else {
              fullReasoning += reasoningChunk;
            }

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
        }
      }

      // End reasoning if it was started
      if (hasReasoningStarted && fullReasoning) {
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

      this.io.to(`room:${shareCode}`).emit('ai-stream-end', {
        threadId,
        text: fullText,
        reasoning: fullReasoning || undefined,
        timestamp: Date.now(),
        modelUsed: routedModelId,
        usage: usageTotals
      });

      // Track usage and cost
      if (usageTotals.totalTokens) {
        const estimatedCost = openRouterService.estimateCost(
          routedModelId, 
          usageTotals.promptTokens || 0, 
          usageTotals.completionTokens || 0
        );
        
        // Update user usage
        await userTierService.updateUsage(userId, usageTotals.totalTokens, estimatedCost, routedModelId, 'room');
        await tierRateLimiter.increment(userId, userSubscription.tier as any, reasoningMode ? 'reasoning_messages' : 'ai_requests', 1);
        
        console.log(`🏠 Room usage tracked: ${usageTotals.totalTokens} tokens, $${estimatedCost.toFixed(6)} cost for user ${userId}`);
      }

      // Track room AI usage
      await roomTierService.incrementRoomAIUsage(shareCode, reasoningMode);
      console.log(`🏠 Room ${reasoningMode ? 'reasoning' : 'AI'} usage incremented for ${shareCode}`);

      // CRITICAL: Save AI message to database
      console.log(`🔍 Attempting to save AI message - fullText length: ${fullText.length}, content: "${fullText.substring(0, 100)}..."`);
      if (fullText.trim()) {
        try {
          // Get room UUID from shareCode
          const roomInfo = await roomTierService.getRoomInfo(shareCode);
          if (!roomInfo) {
            console.error(`❌ Cannot save AI message - room not found for shareCode: ${shareCode}`);
            return;
          }

          const { SocketDatabaseService } = await import('../database/socketQueries');
          const result = await SocketDatabaseService.insertRoomMessage({
            roomId: roomInfo.id, // Use room UUID instead of shareCode
            threadId,
            senderName: 'AI Assistant',
            content: fullText,
            isAiResponse: true,
            sources: undefined,
            reasoning: fullReasoning || undefined
          });
          
          if (result.success) {
            console.log(`💾 AI message saved to database: ${result.messageId} for thread ${threadId}`);
          } else {
            console.error(`💥 Failed to save AI message:`, result.error);
          }
        } catch (dbError) {
          console.error(`💥 Database save error:`, dbError);
        }
      } else {
        console.error(`❌ Cannot save AI message - fullText is empty! Length: ${fullText.length}`);
      }

    } catch (error: any) {
      console.error('🚨 AI Response Handler Error:', error);
      this.io.to(`room:${shareCode}`).emit('ai-error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        threadId,
        timestamp: Date.now()
      });
    } finally {
      // Clean up abort controller
      this.activeStreams.delete(threadId);
    }
  }

  // Stop AI response
  async stopAIResponse(shareCode: string, threadId: string): Promise<void> {
    try {
      // Cancel the stream if it exists
      const abortController = this.activeStreams.get(threadId);
      if (abortController) {
        abortController.abort();
        this.activeStreams.delete(threadId);
        console.log(`AI stream stopped for thread ${threadId}`);
      }

      // Emit stop event to clients
      this.io.to(`room:${shareCode}`).emit('ai-stream-stopped', { 
        threadId,
        timestamp: Date.now() 
      });
      
    } catch (error) {
      console.error('Error stopping AI response:', error);
    }
  }

  // Generate simple AI response based on context
  private generateAIResponse(
    message: string,
    senderName: string,
    roomName: string,
    participants: string[]
  ): string {
    const responses = [
      `Thanks for the question, ${senderName}! Let me think about that...`,
      `Interesting point! In the context of ${roomName}, I'd say...`,
      `Great question! Based on our conversation with ${participants.join(', ')}, here's what I think...`,
      `${senderName}, that's something worth exploring further...`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Update configuration
  updateConfig(newConfig: Partial<AIResponseConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('AI response config updated:', this.config);
  }

  // Enable/disable AI responses
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`AI responses ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Get current configuration
  getConfig(): AIResponseConfig {
    return { ...this.config };
  }
}

// Factory function for creating AI response handler
export function createAIResponseHandler(io: SocketIOServer, config?: Partial<AIResponseConfig>): AIResponseHandler {
  return new AIResponseHandler(io, config);
}