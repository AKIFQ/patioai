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
    description: 'Free tier with smart model routing for optimal performance',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash-lite': {
        id: 'google/gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.10, // $0.10 per 1M input tokens
        outputCost: 0.40, // $0.40 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general tasks, translation, classification, multimodal'
      },
      'deepseek-chat': {
        id: 'deepseek/deepseek-chat-v3-0324',
        name: 'DeepSeek Chat V3',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.14, // $0.14 per 1M input tokens
        outputCost: 0.28, // $0.28 per 1M output tokens
        reasoning: false,
        specialization: 'Superior coding, mathematical reasoning, algorithmic problems'
      }
    },
    monthlyLimit: 2000,
    costPerUser: '$0',
    userChoice: false
  },

  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Same smart routing as free tier with higher usage limits',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash-lite': {
        id: 'google/gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.10, // $0.10 per 1M input tokens
        outputCost: 0.40, // $0.40 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general tasks, translation, classification, multimodal'
      },
      'deepseek-chat': {
        id: 'deepseek/deepseek-chat-v3-0324',
        name: 'DeepSeek Chat V3',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0.14, // $0.14 per 1M input tokens
        outputCost: 0.28, // $0.28 per 1M output tokens
        reasoning: false,
        specialization: 'Superior coding, mathematical reasoning, algorithmic problems'
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

// Simplified routing logic for free/basic tiers
export const SIMPLE_MODEL_ROUTING = {
  general: 'google/gemini-2.5-flash-lite', // Fast, efficient for general tasks
  coding: 'deepseek/deepseek-chat-v3-0324', // Superior coding capabilities
  math: 'deepseek/deepseek-chat-v3-0324', // Strong mathematical reasoning
  reasoning: 'deepseek/deepseek-r1', // Actual reasoning model for free/basic
  fallback: 'google/gemini-2.5-flash-lite' // Reliable default
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