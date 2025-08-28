import { type NextRequest, NextResponse } from 'next/server';
import type { Message, Attachment } from 'ai';
import { streamText, convertToCoreMessages } from 'ai';
import { saveChatToSupbabase } from './SaveToDb';
// Rate limiting removed - using new tier-based system
import { getSession } from '@/lib/server/supabase';
import { searchUserDocument } from './tools/documentChat';
import { websiteSearchTool } from './tools/WebsiteSearchTool';
import { openRouterService } from '@/lib/ai/openRouterService';
import { ModelRouter } from '@/lib/ai/modelRouter';
import { userTierService } from '@/lib/ai/userTierService';
import { tierRateLimiter } from '@/lib/limits/rateLimiter';
import { getTierLimits, type UserTier } from '@/lib/limits/tierLimits';
import { withMemoryProtection, memoryProtection } from '@/lib/monitoring/memoryProtection';
import { tokenManager } from '@/lib/utils/tokenCounter';
import { checkCircuitBreakers, trackSystemEvent } from '@/lib/monitoring/circuitBreakers';
import { threadManager } from '@/lib/ai/threadManager';
import { MessageGenerator } from '@/lib/notifications/messageGenerator';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

// Simple token estimation (roughly 4 characters per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const getSystemPrompt = (selectedFiles: string[], reasoningMode = false) => {
  const reasoningGuidelines = reasoningMode ? `

REASONING GUIDELINES (512 Token Limit):
- Think in 2-3 essential steps only
- Maximum 100 words of reasoning
- No repetition or elaboration
- Be extremely concise and direct` : '';

  const basePrompt = `You are a helpful assistant. Answer all questions to the best of your ability. Use tools when necessary. Strive to only use a tool one time per question.${reasoningGuidelines}

FORMATTING: Your responses are rendered using react-markdown with the following capabilities:
- GitHub Flavored Markdown (GFM) support through remarkGfm plugin
- Syntax highlighting for code blocks through rehypeHighlight plugin
- All standard markdown formatting`;

  if (selectedFiles.length > 0) {
    return `${basePrompt}

IMPORTANT: The user has uploaded ${selectedFiles.length
      } document(s): ${selectedFiles.join(', ')}. 

When answering questions that might be addressed in these documents:
1. ALWAYS use the searchUserDocument tool to retrieve relevant information from the uploaded documents
2. Reference the documents properly in your response with the exact format: [Document title, p.X](<?pdf=Document_title&p=X>)
3. Include direct quotes from the documents when appropriate
4. When information from the documents contradicts your general knowledge, prioritize the document content

For questions not related to the uploaded documents, you can respond based on your general knowledge.`;
  }

  return basePrompt;
};

function errorHandler(error: unknown) {
  if (error == null) {
    return 'unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return JSON.stringify(error);
}

const modelRouter = new ModelRouter();

const getModel = (selectedModel: string, userTier = 'free', messageContent?: string, reasoningMode?: boolean) => {
  // Analyze message context for smart routing
  const context = modelRouter.analyzeMessageContext(messageContent || '', 1);
  
  // Route model based on user tier and context
  const routedModel = modelRouter.routeModel({ tier: userTier as any }, context, selectedModel, undefined, reasoningMode);
  
console.log(` Chat model routing: ${selectedModel} → ${routedModel} (tier: ${userTier}, reasoning: ${reasoningMode})`);
  
  return openRouterService.getModel(routedModel);
};

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Chat API: Request started');
    
    // Check memory protection circuit breaker FIRST
    if (memoryProtection.shouldBlockOperation()) {
      console.log('🛡️ Chat API: Memory protection blocking request');
      return new NextResponse(
        JSON.stringify({ error: 'System under high load. Please try again in a few moments.' }),
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

  // Check system-wide circuit breakers
  const circuitBreakers = checkCircuitBreakers();
  
  if (circuitBreakers.isEmergencyMode()) {
    console.log('System in emergency mode, degraded service active');
    
    // For anonymous users, block AI if circuit breaker is active
    const session = await getSession();
    if (!session && circuitBreakers.shouldBlockAnonymousAI()) {
      const notification = MessageGenerator.systemEmergencyMode('ai_disabled');
      return new NextResponse(
        JSON.stringify({ 
          ...notification,
          type: 'emergency_mode'
        }),
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  const session = await getSession();

  if (!session) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Rate limiting now handled by tier-based system in userTierService

  const body = await req.json();
  const messages: Message[] = body.messages ?? [];
  const chatSessionId = body.chatId;
  const signal = body.signal;
  const selectedFiles: string[] = body.selectedBlobs ?? [];
  const webSearch = !!body.webSearch;

  if (!chatSessionId) {
    return new NextResponse('Chat session ID is empty.', {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  let fileAttachments: Attachment[] = [];

  // Check if the last message is from the user and contains attachments
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === 'user' && lastMessage?.experimental_attachments) {
    fileAttachments = lastMessage.experimental_attachments;
  }

  const selectedModel = body.option ?? 'auto';
  const reasoningMode = body.reasoningMode ?? false; // New reasoning toggle
  const userId = session.id;
  
  // Get user tier
  const userSubscription = await userTierService.getUserTier(userId);
  const userTier = userSubscription.tier as UserTier;

  // VALIDATE MESSAGE TOKEN LIMITS
  if (lastMessage?.role === 'user' && lastMessage.content) {
    const messageValidation = tokenManager.validateMessage(lastMessage.content, userTier);
    
    if (!messageValidation.valid) {
      const notification = MessageGenerator.messageTokenLimitExceeded(
        userTier, 
        messageValidation.tokenCount, 
        messageValidation.limit
      );
      
      return new NextResponse(
        JSON.stringify({ 
          ...notification,
          tokenCount: messageValidation.tokenCount,
          limit: messageValidation.limit,
          type: 'token_limit_exceeded'
        }),
        {
          status: 413, // Payload Too Large
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // ADVANCED THREAD MANAGEMENT
  const threadStatus = await threadManager.analyzeThreadStatus(
    chatSessionId,
    userTier,
    lastMessage?.content
  );

  // Generate warning if needed
  const threadWarning = threadManager.generateThreadWarning(threadStatus, userTier);
  
  // Handle critical thread limits
  if (threadStatus.recommendedAction === 'force_new_thread') {
    const notification = MessageGenerator.contextWindowFull(
      userTier, 
      threadStatus.contextUsage, 
      userTier === 'premium'
    );
    
    return new NextResponse(
      JSON.stringify({
        ...notification,
        contextUsage: {
          current: threadStatus.tokenCount,
          limit: threadManager.getTierContextLimit(userTier),
          percentage: threadStatus.contextUsage
        },
        threadWarning,
        action: 'new_thread_required',
        type: 'context_limit_exceeded'
      }),
      {
        status: 413,
        headers: { 
          'Content-Type': 'application/json',
          'X-Context-Usage': threadStatus.contextUsage.toString(),
          'X-Thread-Action': threadStatus.recommendedAction,
          'X-Thread-Warning': threadWarning ? JSON.stringify(threadWarning) : ''
        }
      }
    );
  }

  // Apply automatic compression for premium users
  if (threadStatus.recommendedAction === 'compress_context' && userTier === 'premium') {
    console.log(`Applying automatic context compression for premium user ${userId}`);
    const compressionResult = await threadManager.compressContext(chatSessionId, 0.4);
    
    if (compressionResult.success) {
      console.log(`Context compressed: ${compressionResult.originalTokens} → ${compressionResult.compressedTokens} tokens (${Math.round(compressionResult.compressionRatio * 100)}% reduction)`);
    }
  }

  // Enforce new tier-based request limits
  const limiterCheck = await tierRateLimiter.check(userId, userTier, 'ai_requests');
  if (!limiterCheck.allowed) {
    const notification = MessageGenerator.aiRequestLimitExceeded(userTier, limiterCheck.remaining);
    
    return new NextResponse(
      JSON.stringify({
        ...notification,
        remaining: limiterCheck.remaining,
        type: 'rate_limit_exceeded'
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Track AI request for circuit breakers
  trackSystemEvent.aiRequest();

  // Check context window limits based on user tier
  const tierLimits = getTierLimits(userSubscription.tier as any);
  const lastMessageContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
  const currentPromptTokens = estimateTokens(lastMessageContent);
  
  // Calculate total context tokens from message history
  const historyTokens = messages.slice(0, -1).reduce((total, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : '';
    return total + estimateTokens(content);
  }, 0);
  const totalInputTokens = currentPromptTokens + historyTokens;

  // Check per-message input token limit
  if (currentPromptTokens > tierLimits.perMessageInputTokens!) {
    return new NextResponse(
      JSON.stringify({
        error: `Message too long. Maximum ${tierLimits.perMessageInputTokens!.toLocaleString()} tokens allowed per message for ${userSubscription.tier} tier. Your message: ${currentPromptTokens.toLocaleString()} tokens.`
      }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Check total context window limit
  if (totalInputTokens > tierLimits.contextWindowTokens!) {
    return new NextResponse(
      JSON.stringify({
        error: `Context too large. Maximum ${tierLimits.contextWindowTokens!.toLocaleString()} tokens allowed for ${userSubscription.tier} tier. Current context: ${totalInputTokens.toLocaleString()} tokens.`
      }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // Get last message content for context analysis (already defined above)
  
  // Route model and get provider options
  const context = modelRouter.analyzeMessageContext(lastMessageContent, messages.length);
  const routedModel = modelRouter.routeModel(
    { tier: userSubscription.tier }, 
    context, 
    selectedModel,
    {
      monthlySpend: userSubscription.costSpent,
      requestCount: userSubscription.monthlyUsage,
      warningThreshold: userSubscription.warningThreshold,
      hardLimit: userSubscription.hardLimit
    },
    reasoningMode // Pass reasoning mode flag
  );
  const providerOptions = openRouterService.getProviderOptions(routedModel);

  // Dev visibility: log the final model selection
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🧭 Using OpenRouter model: ${routedModel} (selected=${selectedModel}, tier=${userSubscription.tier})`);
  }

  const result = streamText({
    model: getModel(selectedModel, userSubscription.tier, lastMessageContent, reasoningMode),
    system: getSystemPrompt(selectedFiles, reasoningMode),
    messages: convertToCoreMessages(messages),
    abortSignal: signal,
    providerOptions,
    tools: {
      ...(selectedFiles.length > 0
        ? {
            searchUserDocument: searchUserDocument({
              userId,
              selectedBlobs: selectedFiles
            })
          }
        : {}),
      ...(webSearch ? { websiteSearchTool: websiteSearchTool } : {})
    },
    experimental_activeTools: [
      ...(selectedFiles.length > 0 ? ['searchUserDocument'] as const : []),
      ...(webSearch ? (['websiteSearchTool'] as const) : [])
    ],
    maxSteps: 3,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'api_chat',
      metadata: {
        userId: session.id,
        chatId: chatSessionId,
        modelUsed: routedModel,
        userTier: userSubscription.tier
      },
      recordInputs: true,
      recordOutputs: true
    },
    onFinish: async (event) => {
      const { text, reasoning, steps, sources, usage } = event;
      const lastMessage = messages[messages.length - 1];
      const lastMessageContent =
        typeof lastMessage.content === 'string' ? lastMessage.content : '';

      const foundReasoningStep = event.steps.find((step) => step.reasoning);
      const reasoningText =
        reasoning ||
        (foundReasoningStep?.reasoning
          ? foundReasoningStep.reasoning
          : undefined);

      // Track usage and cost
      if (usage) {
        const totalTokens = (usage.promptTokens || 0) + (usage.completionTokens || 0);
        const estimatedCost = openRouterService.estimateCost(
          routedModel, 
          usage.promptTokens || 0, 
          usage.completionTokens || 0
        );
        
        // Update user usage
        await userTierService.updateUsage(userId, totalTokens, estimatedCost, routedModel, 'chat');
        await tierRateLimiter.increment(userId, userSubscription.tier as any, 'ai_requests', 1);
        
console.log(` Usage tracked: ${totalTokens} tokens, $${estimatedCost.toFixed(6)} cost`);
      }

      await saveChatToSupbabase(
        chatSessionId,
        session.id,
        lastMessageContent,
        text,
        fileAttachments,
        reasoningText,
        sources,
        steps.map((step) => step.toolResults).flat()
      );
      console.log('Chat saved to Supabase:', chatSessionId);

      // Emit Socket.IO event for sidebar updates
      const { emitChatMessageCreated } = await import('@/lib/server/socketEmitter');
      emitChatMessageCreated(session.id, {
        id: `chat-${Date.now()}`,
        chat_session_id: chatSessionId,
        content: lastMessageContent,
        is_user_message: true,
        created_at: new Date().toISOString()
      });
    },
    onError: async (error) => {
      console.error('Error processing chat:', error);
    }
  });

  result.consumeStream(); // We consume the stream if the server is discnnected from the client to ensure the onFinish callback is called

  const response = result.toDataStreamResponse({
    sendReasoning: true, // Enable reasoning streaming for Gemini models
    sendSources: true,
    getErrorMessage: errorHandler
  });
  try { response.headers.set('x-model-used', routedModel); } catch {}
  return response;
  
  } catch (error) {
    console.error('🚨 Chat API: FATAL ERROR occurred:', error);
    console.error('🚨 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return new NextResponse(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
