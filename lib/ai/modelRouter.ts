import { SIMPLE_MODEL_ROUTING, PREMIUM_MODEL_ROUTING, getModelInfo, isModelAvailableForTier } from './modelConfig';

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
    // Reasoning mode routing across tiers
    if (reasoningMode === true) {
      if (userTier.tier === 'premium') {
        return 'openai/o1-preview';
      }
      // Free/Basic explicit reasoning - use DeepSeek for better reasoning
      return 'deepseek/deepseek-chat-v3-0324';
    }

    // Auto mode or free/basic tier - use smart routing
    if (selectedModel === 'auto' || userTier.tier === 'free' || userTier.tier === 'basic') {
      return this.getOptimalModel(context, userTier.tier);
    }

    // Premium tier with specific model selection
    if (selectedModel && userTier.tier === 'premium') {
      if (isModelAvailableForTier(selectedModel, userTier.tier)) {
        if (costControl) {
          return this.applyCostControl(selectedModel, costControl);
        }
        return selectedModel;
      }
    }

    // Fallback to tier default
    return this.getTierDefault(userTier.tier);
  }

  /**
   * Smart model selection based on content analysis
   * Routes to the best model for the specific task type
   */
  private getOptimalModel(context: MessageContext, tier: string): string {
    // Code-related tasks - use DeepSeek for superior coding capabilities
    if (context.hasCode || this.isCodeRelated(context.content)) {
      return SIMPLE_MODEL_ROUTING.coding;
    }

    // Math-related tasks - use DeepSeek for better mathematical reasoning
    if (this.isMathRelated(context.content)) {
      return SIMPLE_MODEL_ROUTING.math;
    }

    // General tasks - use Gemini Flash-Lite for fast, efficient responses
    return SIMPLE_MODEL_ROUTING.general;
  }

  /**
   * Enhanced code detection beyond just syntax
   */
  private isCodeRelated(content: string): boolean {
    const lowerContent = content.toLowerCase();
    
    // Programming keywords and concepts
    const codeKeywords = [
      'function', 'class', 'import', 'export', 'const', 'let', 'var',
      'def ', 'class ', 'import ', 'from ', 'return', 'console.log',
      'api', 'endpoint', 'database', 'sql', 'query', 'component',
      'props', 'state', 'hook', 'async', 'await', 'promise',
      'array', 'object', 'string', 'number', 'boolean',
      'debug', 'error', 'exception', 'try', 'catch',
      'git', 'commit', 'merge', 'branch', 'repository',
      'npm', 'package', 'install', 'dependency',
      'react', 'vue', 'angular', 'node', 'express',
      'python', 'javascript', 'typescript', 'java', 'c++',
      'algorithm', 'data structure', 'recursive', 'iteration'
    ];

    // File extensions and code indicators
    const codeIndicators = [
      '.js', '.ts', '.py', '.java', '.cpp', '.html', '.css',
      '.json', '.xml', '.yaml', '.yml', '.sql', '.sh',
      '```', 'code', 'script', 'syntax', 'compile', 'runtime'
    ];

    return codeKeywords.some(keyword => lowerContent.includes(keyword)) ||
           codeIndicators.some(indicator => lowerContent.includes(indicator));
  }

  /**
   * Enhanced math detection for mathematical content
   */
  private isMathRelated(content: string): boolean {
    const lowerContent = content.toLowerCase();
    
    // Mathematical keywords
    const mathKeywords = [
      'math', 'mathematics', 'algebra', 'geometry', 'calculus',
      'trigonometry', 'statistics', 'probability', 'equation',
      'formula', 'theorem', 'proof', 'derivative', 'integral',
      'matrix', 'vector', 'polynomial', 'logarithm', 'exponential',
      'factorial', 'permutation', 'combination', 'set theory',
      'logic', 'algorithm', 'optimization', 'graph theory'
    ];

    // Mathematical symbols and patterns
    const mathSymbols = /[=<>±∞∑∫√^²³¹°π∆λμσφθω]/;
    const mathPatterns = /\d+\s*[\+\-\*\/\^]\s*\d+|x\s*=|f\(x\)|∫|∑|lim|dx|dy/;

    return mathKeywords.some(keyword => lowerContent.includes(keyword)) ||
           mathSymbols.test(content) ||
           mathPatterns.test(content);
  }

  /**
   * Apply cost control for premium users
   */
  private applyCostControl(selectedModel: string, costControl: CostControl): string {
    const modelInfo = getModelInfo(selectedModel);
    if (!modelInfo) return SIMPLE_MODEL_ROUTING.fallback;

    // If approaching warning threshold, suggest efficient alternatives
    if (costControl.monthlySpend > costControl.warningThreshold) {
console.log(` User approaching cost limit, suggesting efficient model`);
      return 'deepseek/deepseek-chat-v3-0324'; // Most efficient model
    }

    // If hard limit reached, force fallback
    if (costControl.monthlySpend > costControl.hardLimit) {
console.log(` User hit cost limit, forcing fallback`);
      return SIMPLE_MODEL_ROUTING.fallback;
    }

    return selectedModel;
  }

  /**
   * Get default model for tier
   */
  private getTierDefault(tier: string): string {
    switch (tier) {
      case 'free':
      case 'basic':
        return SIMPLE_MODEL_ROUTING.general; // Gemini 2.5 Flash-Lite
      case 'premium':
        return PREMIUM_MODEL_ROUTING.general; // GPT-5 or best available
      default:
        return SIMPLE_MODEL_ROUTING.fallback;
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