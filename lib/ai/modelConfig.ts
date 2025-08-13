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
    description: 'Smart auto-routing to best free models',
    models: {
      'auto': {
        id: 'auto',
        name: 'Auto (Smart Routing)',
        provider: 'openrouter',
        costTier: 'free',
        inputCost: 0,
        outputCost: 0,
        reasoning: false
      }
    },
    monthlyLimit: 50,
    costPerUser: '$0',
    userChoice: false
  },
  
  basic: {
    id: 'basic',
    name: 'Pro Basic',
    description: 'Choose from fast, efficient models',
    models: {
      'openai-fast': {
        id: 'openai/gpt-4o-mini',
        name: 'OpenAI Fast',
        provider: 'openrouter',
        costTier: 'low',
        inputCost: 0.0001,
        outputCost: 0.0004,
        reasoning: false,
        specialization: 'General purpose, fast responses'
      },
      'claude-speed': {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude Speed',
        provider: 'openrouter',
        costTier: 'low',
        inputCost: 0.00025,
        outputCost: 0.00125,
        reasoning: false,
        specialization: 'Safe, fast, reliable'
      },
      'deepseek-reasoning': {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek Reasoning',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0.00055,
        outputCost: 0.00219,
        reasoning: true,
        specialization: 'Best value reasoning'
      }
    },
    monthlyLimit: 200,
    costPerUser: '$20',
    userChoice: true
  },
  
  premium: {
    id: 'premium',
    name: 'Pro Premium',
    description: 'Access to flagship models',
    models: {
      'openai-flagship': {
        id: 'openai/gpt-4o',
        name: 'OpenAI Flagship',
        provider: 'openrouter',
        costTier: 'high',
        inputCost: 0.0025,
        outputCost: 0.01,
        reasoning: false,
        specialization: 'Most capable general model'
      },
      'openai-reasoning': {
        id: 'openai/o1-mini',
        name: 'OpenAI Reasoning',
        provider: 'openrouter',
        costTier: 'high',
        inputCost: 0.003,
        outputCost: 0.012,
        reasoning: true,
        specialization: 'Advanced reasoning'
      },
      'claude-sonnet': {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude Sonnet',
        provider: 'openrouter',
        costTier: 'high',
        inputCost: 0.003,
        outputCost: 0.015,
        reasoning: false,
        specialization: 'Creative and analytical'
      },
      'deepseek-reasoning': {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek Reasoning',
        provider: 'openrouter',
        costTier: 'ultra-low',
        inputCost: 0.00055,
        outputCost: 0.00219,
        reasoning: true,
        specialization: 'Best value reasoning'
      }
    },
    monthlyLimit: 500,
    costPerUser: '$50',
    userChoice: true
  }
};

// Free tier model routing logic
export const FREE_MODEL_ROUTING = {
  general: 'qwen/qwen-2.5-72b-instruct:free',      // Shopping, web, general chat
  academic: 'deepseek/deepseek-r1:free',           // Research, complex reasoning  
  coding: 'qwen/qwen-2.5-coder-32b-instruct:free', // Code generation, debugging
  fallback: 'meta-llama/llama-3.1-8b-instruct:free' // High volume fallback
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