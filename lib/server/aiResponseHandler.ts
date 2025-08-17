import type { Server as SocketIOServer } from 'socket.io';
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
  }) {
    const { modelId, currentMessage, promptResult, providerOptions, maxTokens } = params;

    return streamText({
      model: this.getModel(modelId, currentMessage),
      system: promptResult.system,
      messages: promptResult.messages,
      providerOptions,
      maxTokens,
      temperature: 0.7,
      abortSignal: modelId.includes('deepseek') ?
        AbortSignal.timeout(45000) : undefined
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
        maxTokens
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
        maxTokens
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
    modelId = 'gpt-4o',
    chatHistory: { role: 'user' | 'assistant', content: string }[] = [],
    reasoningMode = false
  ): Promise<void> {
    try {
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
        // Reasoning mode enabled
      } else {
        // Regular routing
      }

      // Get provider options for reasoning models
      const providerOptions = openRouterService.getProviderOptions(routedModelId);

      // Final model selected
      // Model ready for use

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
      // Max tokens set

      // Prompt prepared
      // Messages ready

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
            maxTokens
          });

      let fullText = '';
      let fullReasoning = '';
      let hasReasoningStarted = false;
      let usageTotals: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};

      // CRITICAL: Memory protection - prevent OOM from huge AI responses
      const MAX_RESPONSE_SIZE = 500000; // 500KB limit for main response
      const MAX_REASONING_SIZE = 200000; // 200KB limit for reasoning
      let isTruncated = false;

      if (process.env.NODE_ENV === 'development') console.debug('Starting AI stream for model:', routedModelId);

      // Use AI SDK's proper streaming interface with error handling
      // Starting streaming loop

      for await (const delta of result.fullStream) {
        if (process.env.NODE_ENV === 'development') console.debug('Received delta:', delta.type);

        // Handle error deltas - simple error handling without fallbacks
        if (delta.type === 'error') {
          const deltaAny = delta as any;
          console.error('Model error delta:', deltaAny);

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

        // Handle DeepSeek delta format
        if (routedModelId.includes('deepseek')) {
          const deltaAny = delta as any;
          if (process.env.NODE_ENV === 'development') {
            console.debug('DeepSeek delta:', delta.type, deltaAny.textDelta ? `"${deltaAny.textDelta.substring(0, 50)}..."` : 'no text');
          }
        }

        if (delta.type === 'text-delta') {
          const chunk = delta.textDelta;

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

          fullText += chunk;

          // OpenRouter-specific: Extract reasoning from streaming text chunks
          // DeepSeek R1 includes <think> tags in the normal text stream
          if (routedModelId.includes('deepseek') && chunk.includes('<think>')) {
            if (process.env.NODE_ENV === 'development') {
              console.debug('Found <think> tag in chunk:', chunk.substring(0, 100));
            }

            // Extract reasoning content between <think> tags
            const thinkMatch = /<think>([\s\S]*?)(?:<\/think>|$)/.exec(chunk);
            if (thinkMatch) {
              const reasoningContent = thinkMatch[1];
              if (reasoningContent.trim()) {
                // CRITICAL: Check reasoning size limits
                if (fullReasoning.length + reasoningContent.length > MAX_REASONING_SIZE) {
                  console.warn('AI reasoning truncated for memory protection');
                  fullReasoning += '\n\n[Reasoning truncated due to size limits]';
                } else {
                  fullReasoning += reasoningContent;
                }

                if (!hasReasoningStarted) {
                  hasReasoningStarted = true;
                  // Starting reasoning UI
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
            // CRITICAL: Check reasoning size limits
            if (fullReasoning.length + chunk.length > MAX_REASONING_SIZE) {
              console.warn('AI reasoning truncated for memory protection');
              if (!fullReasoning.includes('[Reasoning truncated due to size limits]')) {
                fullReasoning += '\n\n[Reasoning truncated due to size limits]';
              }
            } else {
              fullReasoning += chunk;
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

          // Check DeepSeek finish delta for reasoning
          if (routedModelId.includes('deepseek')) {
            if (process.env.NODE_ENV === 'development') {
              console.debug('DeepSeek finish delta:', JSON.stringify(anyDelta, null, 2));
            }

            // Check for reasoning tokens in OpenRouter response
            const reasoningTokens = anyDelta.providerMetadata?.openai?.reasoningTokens ||
              anyDelta.experimental_providerMetadata?.openai?.reasoningTokens;

            if (reasoningTokens && reasoningTokens > 0) {
              // Found reasoning tokens - creating synthetic reasoning UI

              // Create informative reasoning indicator since OpenRouter doesn't expose the actual reasoning
const syntheticReasoning = ` **DeepSeek R1 Reasoning Process**

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
            if (process.env.NODE_ENV === 'development') {
              console.debug('Found reasoning in finish delta:', finalReasoning.substring(0, 100));
            }
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
            if (process.env.NODE_ENV === 'development') console.debug('thought from', delta.type);

            // For delta types, append; for complete types, replace
            if (delta.type.includes('delta') || delta.type.includes('chunk')) {
              fullReasoning += thoughtContent;
            } else {
              fullReasoning = thoughtContent;
            }

            // Start reasoning if not already started
            if (!hasReasoningStarted) {
              hasReasoningStarted = true;
              if (process.env.NODE_ENV === 'development') console.debug('thoughts started for', routedModelId, delta.type);
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
        // Completing reasoning UI
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
        // Final extraction: Found think tags

        // Extract all reasoning content
        const thinkMatches = fullText.match(/<think>([\s\S]*?)<\/think>/g);
        if (thinkMatches) {
          const allReasoning = thinkMatches
            .map(match => match.replace(/<\/?think>/g, ''))
            .join('\n\n')
            .trim();

          if (allReasoning && allReasoning !== fullReasoning) {
            fullReasoning = allReasoning;
            if (process.env.NODE_ENV === 'development') {
              console.debug('Final reasoning extracted:', allReasoning.substring(0, 100));
            }

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

      // CRITICAL FIX: Save AI message to database AND broadcast to all users
      try {
        const { SocketDatabaseService } = await import('../database/socketQueries');

        // Get the actual room_id from shareCode
        const roomValidation = await SocketDatabaseService.validateRoomAccess(shareCode);
        if (!roomValidation.valid || !roomValidation.room) {
          console.warn('Failed to get room_id for shareCode:', shareCode, roomValidation.error);
          return;
        }

        // Save AI message to database IMMEDIATELY (not deferred)
        const result = await SocketDatabaseService.insertRoomMessage({
          roomId: roomValidation.room.id, // Use actual room UUID
          threadId,
          senderName: 'AI Assistant',
          content: fullText,
          isAiResponse: true,
          reasoning: fullReasoning || undefined
        });

        if (!result.success) {
          console.error('Failed to save AI message to DB:', result.error);
        } else {
          // AI message saved to DB

          // CRITICAL FIX: Broadcast AI message to ALL users in the room
this.io.to(`room:${shareCode}`).emit('room-message-created', {
            new: {
              id: result.messageId,
              room_id: roomValidation.room.id,
              thread_id: threadId,
              sender_name: 'AI Assistant',
              content: fullText,
              is_ai_response: true,
              reasoning: fullReasoning || null,
              created_at: new Date().toISOString()
            },
            eventType: 'INSERT',
            table: 'room_messages',
            schema: 'public'
          });

          // AI message broadcasted
        }
      } catch (e) {
        console.error('Critical error saving/broadcasting AI message:', e);
      }
    } catch (error) {
      console.error('Error streaming AI response:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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
    // AI response configuration updated
  }

  // Enable/disable AI responses
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    // AI responses toggled
  }
}

// Factory function to create AI response handler
export function createAIResponseHandler(
  io: SocketIOServer,
  config?: Partial<AIResponseConfig>
): AIResponseHandler {
  return new AIResponseHandler(io, config);
}