interface UserTier {
  tier: 'free' | 'paid';
  userId?: string;
}

interface MessageContext {
  content: string;
  hasCode: boolean;
  isQuestion: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  messageCount: number;
}

export class ModelRouter {
  /**
   * Route to the best model based on user tier and message context
   */
  routeModel(userTier: UserTier, context: MessageContext, selectedModel?: string): string {
    // Paid users get their selected model
    if (userTier.tier === 'paid' && selectedModel && selectedModel !== 'auto') {
      return selectedModel;
    }

    // Free users get smart routing
    return this.getOptimalFreeModel(context);
  }

  /**
   * Smart model selection for free users
   */
  private getOptimalFreeModel(context: MessageContext): string {
    // Simple Q&A - use cheapest model
    if (context.complexity === 'simple' && !context.hasCode) {
      return 'deepseek-v3';
    }

    // Code analysis or complex reasoning - use better model
    if (context.hasCode || context.complexity === 'complex') {
      return 'qwen-2.5-72b';
    }

    // Default to DeepSeek V3 (best price/performance)
    return 'deepseek-v3';
  }

  /**
   * Analyze message complexity
   */
  analyzeMessageContext(content: string, messageCount: number): MessageContext {
    const hasCode = /```|function|class|import|const|let|var/.test(content);
    const isQuestion = content.includes('?') || /^(how|what|why|when|where)/i.test(content);
    
    let complexity: MessageContext['complexity'] = 'simple';
    
    // Determine complexity
    if (content.length > 500 || hasCode) {
      complexity = 'complex';
    } else if (content.length > 100 || isQuestion) {
      complexity = 'medium';
    }

    return {
      content,
      hasCode,
      isQuestion,
      complexity,
      messageCount
    };
  }

  /**
   * Get model cost tier for monitoring
   */
  getModelCostTier(model: string): 'ultra-low' | 'low' | 'medium' | 'high' {
    const costTiers = {
      'deepseek-v3': 'ultra-low',
      'qwen-2.5-72b': 'low',
      'gpt-4o-mini': 'medium',
      'gpt-4o': 'high',
      'claude-3.5-sonnet': 'high',
      'o3': 'high'
    } as const;

    return costTiers[model as keyof typeof costTiers] || 'medium';
  }
}