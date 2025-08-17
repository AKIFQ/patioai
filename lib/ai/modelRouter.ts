import { FREE_MODEL_ROUTING, PAID_FALLBACK_ROUTING, getModelInfo, isModelAvailableForTier } from './modelConfig';

interface UserTier {
  tier: 'free' | 'basic' | 'premium';
  userId?: string;
}

interface MessageContext {
  content: string;
  hasCode: boolean;
  isQuestion: boolean;
  isAcademic: boolean;
  isShopping: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  messageCount: number;
}

interface CostControl {
  monthlySpend: number;
  requestCount: number;
  warningThreshold: number;
  hardLimit: number;
}

export class ModelRouter {
  /**
   * Route to the best model based on user tier and message context
   */
  routeModel(userTier: UserTier, context: MessageContext, selectedModel?: string, costControl?: CostControl, reasoningMode?: boolean): string {
    // PROMINENT Debug logging
    // Reasoning mode routing across tiers
    if (reasoningMode === true) {
      if (userTier.tier === 'premium') {
        return 'openai/o1-preview';
      }
      // Free/Basic explicit reasoning goes to DeepSeek R1
      return 'deepseek/deepseek-r1';
    }

    // Handle auto mode for free users (only if not in reasoning mode)
    if ((selectedModel === 'auto' || userTier.tier === 'free') && !reasoningMode) {
      return this.getOptimalFreeModel(context);
    }

    // CRITICAL FIX: Handle invalid model names from frontend cookies
    if (selectedModel) {
      // Map common invalid model names to valid ones
      const modelMapping: Record<string, string> = {
        'gemini-2.5-flash': 'google/gemini-2.0-flash-exp:free',
        'gemini-flash': 'google/gemini-2.0-flash-exp:free',
        'gemini-2.0-flash': 'google/gemini-2.0-flash-exp:free',
        'deepseek-r1': 'deepseek/deepseek-r1:free',
        'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
        'gpt-4o': 'openai/gpt-4o'
      };

      // Map invalid model names to valid ones
      const mappedModel = modelMapping[selectedModel] || selectedModel;

      // Check if the mapped model is available for their tier
      if (isModelAvailableForTier(mappedModel, userTier.tier)) {
        // Check cost controls for premium tier
        if (userTier.tier === 'premium' && costControl) {
          return this.applyCostControl(mappedModel, costControl);
        }
        return mappedModel;
      }
    }

    // Fallback to tier default
    return this.getTierDefault(userTier.tier);
  }

  /**
   * Smart model selection for free users (auto mode)
   * Note: Reasoning models are now opt-in only, not auto-routed
   */
  private getOptimalFreeModel(context: MessageContext): string {
    // Code generation, debugging
    if (context.hasCode) {
      return FREE_MODEL_ROUTING.coding;
    }

    // All other cases use general model (no auto-reasoning)
    // Academic, shopping, web searches, general chat
    return FREE_MODEL_ROUTING.general;
  }

  /**
   * Apply cost control for premium users
   */
  private applyCostControl(selectedModel: string, costControl: CostControl): string {
    const modelInfo = getModelInfo(selectedModel);
    if (!modelInfo) return FREE_MODEL_ROUTING.fallback;

    // If approaching warning threshold, suggest efficient alternatives
    if (costControl.monthlySpend > costControl.warningThreshold) {
console.log(` User approaching cost limit, suggesting efficient model`);
      return 'deepseek/deepseek-r1'; // Most efficient reasoning model
    }

    // If hard limit reached, force fallback
    if (costControl.monthlySpend > costControl.hardLimit) {
console.log(` User hit cost limit, forcing fallback`);
      return FREE_MODEL_ROUTING.fallback;
    }

    return selectedModel;
  }

  /**
   * Get default model for tier
   */
  private getTierDefault(tier: string): string {
    switch (tier) {
      case 'basic':
        return 'google/gemini-2.0-flash';
      case 'premium':
        return 'openai/gpt-4o';
      default:
        return FREE_MODEL_ROUTING.general;
    }
  }

  /**
   * Analyze message complexity and type
   */
  analyzeMessageContext(content: string, messageCount: number): MessageContext {
    const lowerContent = content.toLowerCase();
    
    const hasCode = /```|function|class|import|const|let|var|def |class |import |from |<\/|<\w+/.test(content);
    const isQuestion = content.includes('?') || /^(how|what|why|when|where|can you|could you)/i.test(content);
    
    // Detect academic/research content (expanded to include math/logic)
    const isMath = /(math|mathematics|algebra|geometry|calculus|probability|statistics|statistical|theorem|lemma|proof|derive|equation|pythagoras|bayes|bayes'|bayesian)/.test(lowerContent) || /[=<>±∞∑∫√^]/.test(content);
    const isAcademic = /research|study|analysis|theory|academic|paper|journal|thesis|hypothesis/.test(lowerContent) || isMath;
    
    // Detect shopping/commercial content
    const isShopping = /buy|purchase|price|cost|shop|product|review|compare|recommend|best|cheap|expensive/.test(lowerContent);
    
    let complexity: MessageContext['complexity'] = 'simple';
    
    // Determine complexity
    if (content.length > 300 || hasCode || isAcademic) {
      complexity = 'complex';
    } else if (content.length > 100 || isQuestion || isShopping) {
      complexity = 'medium';
    }

    return {
      content,
      hasCode,
      isQuestion,
      isAcademic,
      isShopping,
      complexity,
      messageCount
    };
  }

  /**
   * Get model cost tier for monitoring
   */
  getModelCostTier(model: string): 'free' | 'ultra-low' | 'low' | 'medium' | 'high' | 'premium' {
    const modelInfo = getModelInfo(model);
    return modelInfo?.costTier || 'medium';
  }

  /**
   * Check if user can access model
   */
  canAccessModel(modelId: string, userTier: string): boolean {
    return isModelAvailableForTier(modelId, userTier);
  }
}