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
    description: 'Free tier with generous limits using Gemini 2.0 Flash and DeepSeek R1',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing)',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash': {
        id: 'google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0.075, // $0.075 per 1M input tokens
        outputCost: 0.30, // $0.30 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general-purpose chat, 229 tokens/sec'
      },
      'deepseek-r1': {
        id: 'deepseek/deepseek-r1:free',
        name: 'DeepSeek R1 (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: true,
        specialization: 'Complex reasoning through reasoning button'
      }
    },
    monthlyLimit: 2000,
    costPerUser: '$0',
    userChoice: false
  },

  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Same models as Free but higher limits and features',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing)',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash': {
        id: 'google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0.075, // $0.075 per 1M input tokens
        outputCost: 0.30, // $0.30 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general-purpose chat, 229 tokens/sec'
      },
      'deepseek-r1': {
        id: 'deepseek/deepseek-r1:free',
        name: 'DeepSeek R1 (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: true,
        specialization: 'Complex reasoning through reasoning button'
      }
    },
    monthlyLimit: 8000,
    costPerUser: '$10',
    userChoice: true
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Top-tier models and enterprise features',
    models: {
      auto: {
        id: 'auto',
        name: 'Auto (Smart Routing)',
        provider: 'openrouter',
        costTier: 'medium',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      },
      'gemini-flash': {
        id: 'google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0.075, // $0.075 per 1M input tokens
        outputCost: 0.30, // $0.30 per 1M output tokens
        reasoning: false,
        specialization: 'Fast general-purpose chat, 229 tokens/sec'
      },
      'gpt-4o-mini': {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openrouter',
        costTier: 'low',
        inputCost: 0.15, // $0.15 per 1M input tokens
        outputCost: 0.60, // $0.60 per 1M output tokens
        reasoning: false,
        specialization: 'Balanced performance and cost'
      },
      'claude-sonnet': {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
        costTier: 'high',
        inputCost: 3.0, // $3.00 per 1M input tokens
        outputCost: 15.0, // $15.00 per 1M output tokens
        reasoning: false,
        specialization: 'Advanced reasoning and analysis'
      },
      'gpt-4o': {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'openrouter',
        costTier: 'high',
        inputCost: 2.5, // $2.50 per 1M input tokens
        outputCost: 10.0, // $10.00 per 1M output tokens
        reasoning: false,
        specialization: 'Multimodal capabilities'
      },
      'o1-preview': {
        id: 'openai/o1-preview',
        name: 'O1-Preview',
        provider: 'openrouter',
        costTier: 'premium',
        inputCost: 15.0, // $15.00 per 1M input tokens
        outputCost: 60.0, // $60.00 per 1M output tokens
        reasoning: true,
        specialization: 'Advanced reasoning and problem-solving'
      },
      'deepseek-r1': {
        id: 'deepseek/deepseek-r1:free',
        name: 'DeepSeek R1 (Free)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: true,
        specialization: 'Complex reasoning through reasoning button'
      }
    },
    monthlyLimit: 20000,
    costPerUser: '$50',
    userChoice: true
  }
};

// Free tier model routing logic
export const FREE_MODEL_ROUTING = {
  general: 'google/gemini-2.0-flash-001',
  academic: 'google/gemini-2.0-flash-001',
  coding: 'google/gemini-2.0-flash-001',
  reasoning: 'deepseek/deepseek-r1:free',
  fallback: 'google/gemini-2.0-flash-001'
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