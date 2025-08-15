export interface ModelTier {
  id: string;
  name: string;
  description: string;
  models: Record<string, ModelInfo>;
  monthlyLimit: number;
  costPerUser: string;
  userChoice: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  costTier: 'free' | 'ultra-low' | 'low' | 'medium' | 'high' | 'premium';
  inputCost: number; // per 1K tokens
  outputCost: number; // per 1K tokens
  reasoning: boolean;
  specialization?: string;
}

export const MODEL_TIERS: Record<string, ModelTier> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Free tier with OpenRouter free models and smart fallbacks',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing with Free Models)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash': {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.10, // $0.10 per 1M input tokens
        outputCost: 0.40, // $0.40 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general tasks, 1M tokens, 20/min rate limit'
      },
      'deepseek-r1': {
        id: 'deepseek/deepseek-r1:free',
        name: 'DeepSeek R1 (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.55, // $0.55 per 1M input tokens
        outputCost: 2.19, // $2.19 per 1M output tokens
        reasoning: true,
        specialization: 'Coding, math, complex reasoning, 128K tokens, 20/min rate limit'
      }
    },
    monthlyLimit: 2000,
    costPerUser: '$0',
    userChoice: false
  },

  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Free models with paid fallbacks and higher usage limits',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing with Fallbacks)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash': {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.10, // $0.10 per 1M input tokens
        outputCost: 0.40, // $0.40 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general tasks, 1M tokens, 20/min rate limit'
      },
      'deepseek-r1': {
        id: 'deepseek/deepseek-r1:free',
        name: 'DeepSeek R1 (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.55, // $0.55 per 1M input tokens
        outputCost: 2.19, // $2.19 per 1M output tokens
        reasoning: true,
        specialization: 'Coding, math, complex reasoning, 128K tokens, 20/min rate limit'
      }
    },
    monthlyLimit: 8000,
    costPerUser: '$10',
    userChoice: true
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Exclusive access to the most advanced AI models',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Premium Model Selection)',
        provider: 'openrouter',
        costTier: 'premium',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gpt-5': {
        id: 'openai/gpt-5',
        name: 'GPT-5',
        provider: 'openrouter',
        costTier: 'premium',
        inputCost: 25.0, // Estimated pricing for GPT-5
        outputCost: 100.0, // Estimated pricing for GPT-5
        reasoning: false,
        specialization: 'Next-generation language model with superior capabilities'
      },
      'claude-4': {
        id: 'anthropic/claude-4',
        name: 'Claude 4',
        provider: 'openrouter',
        costTier: 'premium',
        inputCost: 20.0, // Estimated pricing for Claude 4
        outputCost: 80.0, // Estimated pricing for Claude 4
        reasoning: false,
        specialization: 'Advanced reasoning, analysis, and creative capabilities'
      },
      'deepseek-r1-full': {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1 (Full Version)',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0.55, // $0.55 per 1M input tokens
        outputCost: 2.19, // $2.19 per 1M output tokens
        reasoning: true,
        specialization: 'Full reasoning model - unlimited usage, advanced mathematical and coding capabilities'
      }
    },
    monthlyLimit: 20000,
    costPerUser: '$50',
    userChoice: true
  }
};

// Free tier model routing logic - try free models first with auto-fallback
export const FREE_MODEL_ROUTING = {
  general: 'deepseek/deepseek-chat-v3-0324:free', // Try free model first, fallback to paid
  academic: 'deepseek/deepseek-chat-v3-0324:free', // Try free model first, fallback to paid
  coding: 'deepseek/deepseek-r1-distill-llama-70b:free', // Try free reasoning model first
  reasoning: 'deepseek/deepseek-r1-distill-llama-70b:free', // Try free reasoning model first
  fallback: 'google/gemini-2.0-flash-001' // Reliable paid fallback
};

// Paid fallback models when free models hit rate limits
export const PAID_FALLBACK_ROUTING = {
  general: 'google/gemini-2.0-flash-001',
  academic: 'google/gemini-2.0-flash-001',
  coding: 'openai/gpt-4o-mini',
  reasoning: 'openai/o1-preview',
  fallback: 'google/gemini-2.0-flash-001'
};

// Premium tier model routing - only the best models
export const PREMIUM_MODEL_ROUTING = {
  general: 'openai/gpt-5',
  academic: 'anthropic/claude-4',
  coding: 'deepseek/deepseek-r1',
  reasoning: 'deepseek/deepseek-r1',
  creative: 'anthropic/claude-4',
  fallback: 'openai/gpt-5'
};

export function getModelsByTier(userTier: string): Record<string, ModelInfo> {
  return MODEL_TIERS[userTier]?.models || MODEL_TIERS.free.models;
}

export function isModelAvailableForTier(modelId: string, userTier: string): boolean {
  const tierModels = getModelsByTier(userTier);
  return Object.values(tierModels).some(model => model.id === modelId);
}

export function getModelInfo(modelId: string): ModelInfo | null {
  for (const tier of Object.values(MODEL_TIERS)) {
    for (const model of Object.values(tier.models)) {
      if (model.id === modelId) {
        return model;
      }
    }
  }
  return null;
}