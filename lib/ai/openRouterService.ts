import { createOpenAI } from '@ai-sdk/openai';
import { getModelInfo } from './modelConfig';

export class OpenRouterService {
  private client: ReturnType<typeof createOpenAI>;

  constructor() {
    this.client = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
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
    
    if (!modelInfo?.reasoning) {
      return {};
    }

    // Configure reasoning for different providers
    if (modelId.includes('claude')) {
      return {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 12000 }
        }
      };
    }

    if (modelId.includes('gemini')) {
      return {
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
        openai: {
          reasoningEffort: 'high'
        }
      };
    }

    // DeepSeek and other reasoning models
    return {};
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