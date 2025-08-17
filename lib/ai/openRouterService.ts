import { createOpenAI } from '@ai-sdk/openai';
import { getModelInfo } from './modelConfig';

export class OpenRouterService {
  private client: ReturnType<typeof createOpenAI>;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    
    this.client = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      headers: {
        'HTTP-Referer': process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'PatioAI'
      }
    });
  }

  /**
   * Get model instance for AI SDK
   */
  getModel(modelId: string) {
    // Validate model exists in our config
    const modelInfo = getModelInfo(modelId);
    if (!modelInfo) {
      console.warn(`Invalid model ID: ${modelId}, falling back to google/gemini-2.0-flash-exp:free`);
      return this.client('google/gemini-2.0-flash-exp:free');
    }

    // Handle special routing for free models
    if (modelId.includes(':free')) {
      return this.client(modelId);
    }

    // Regular OpenRouter models
    return this.client(modelId);
  }

  /**
   * Get provider options for reasoning models
   */
  getProviderOptions(modelId: string): any {
    const modelInfo = getModelInfo(modelId);
    
    // Base: enable unified reasoning when model supports it (OpenRouter normalizes this)
    const baseReasoning = modelInfo?.reasoning
      ? {
          openai: {
            // OpenRouter normalizes this to the top-level `reasoning` param
            reasoning: { enabled: true, effort: 'high' as const }
          }
        }
      : {};
    
    if (!modelInfo?.reasoning) {
      // For non-reasoning models, return any provider-specific overrides only
      // (none by default)
    }

    // Configure reasoning for different providers
    if (modelId.includes('claude')) {
      return {
        ...baseReasoning,
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 12000 }
        }
      };
    }

    if (modelId.includes('gemini')) {
      return {
        ...baseReasoning,
        google: {
          thinkingConfig: {
            thinkingBudget: 4096,
            includeThoughts: true
          }
        }
      };
    }

    if (modelId.includes('o1') || modelId.includes('o3')) {
      return {
        ...baseReasoning,
        openai: {
          reasoning: { enabled: true, effort: 'high' }
        }
      };
    }

    // DeepSeek R1 reasoning configuration with cost controls
    if (modelId.includes('deepseek/deepseek-r1')) {
      return {
        // OpenRouter-specific configuration for DeepSeek R1
        openai: {
          // These parameters may not work with OpenRouter, but we'll try
          max_reasoning_tokens: 512,
          // DeepSeek R1 reasoning appears in <think> tags within the response
          stream: true,
          temperature: 0.7
        }
      };
    }

    // Default
    return baseReasoning;
  }

  /**
   * Check if model supports reasoning
   */
  supportsReasoning(modelId: string): boolean {
    const modelInfo = getModelInfo(modelId);
    return modelInfo?.reasoning || false;
  }

  /**
   * Estimate cost for request
   */
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = getModelInfo(modelId);
    if (!modelInfo) return 0;

    const inputCost = (inputTokens / 1000) * modelInfo.inputCost;
    const outputCost = (outputTokens / 1000) * modelInfo.outputCost;
    
    return inputCost + outputCost;
  }
}

// Singleton instance
export const openRouterService = new OpenRouterService();