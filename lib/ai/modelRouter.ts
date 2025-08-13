import { FREE_MODEL_ROUTING, getModelInfo, isModelAvailableForTier } from './modelConfig';

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
  routeModel(userTier: UserTier, context: MessageContext, selectedModel?: string, costControl?: CostControl): string {
    // Handle auto mode for free users
    if (selectedModel === 'auto' || userTier.tier === 'free') {
      return this.getOptimalFreeModel(context);
    }

    // Paid users - check if model is available for their tier
    if (selectedModel && isModelAvailableForTier(selectedModel, userTier.tier)) {
      // Check cost controls for premium tier
      if (userTier.tier === 'premium' && costControl) {
        return this.applyCostControl(selectedModel, costControl);
      }
      return selectedModel;
    }

    // Fallback to tier default
    return this.getTierDefault(userTier.tier);
  }

  /**
   * Smart model selection for free users (auto mode)
   */
  private getOptimalFreeModel(context: MessageContext): string {
    // Academic research, complex reasoning
    if (context.isAcademic || (context.complexity === 'complex' && !context.hasCode)) {
      return FREE_MODEL_ROUTING.academic;
    }

    // Code generation, debugging
    if (context.hasCode) {
      return FREE_MODEL_ROUTING.coding;
    }

    // Shopping, web searches, general chat
    if (context.isShopping || context.complexity === 'simple') {
      return FREE_MODEL_ROUTING.general;
    }

    // Default for medium complexity
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
      console.log(`⚠️ User approaching cost limit, suggesting efficient model`);
      return 'deepseek/deepseek-r1'; // Most efficient reasoning model
    }

    // If hard limit reached, force fallback
    if (costControl.monthlySpend > costControl.hardLimit) {
      console.log(`🚫 User hit cost limit, forcing fallback`);
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
        return 'openai/gpt-4o-mini';
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
    
    // Detect academic/research content
    const isAcademic = /research|study|analysis|theory|academic|paper|journal|thesis|hypothesis/.test(lowerContent);
    
    // Detect shopping/commercial content
    const isShopping = /buy|purchase|price|cost|shop|product|review|compare|recommend|best|cheap|expensive/.test(lowerContent);
    
    let complexity: MessageContext['complexity'] = 'simple';
    
    // Determine complexity
    if (content.length > 500 || hasCode || isAcademic) {
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