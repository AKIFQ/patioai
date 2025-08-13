'use client';

import { useState, useEffect } from 'react';
import { MODEL_TIERS, type ModelInfo } from '@/lib/ai/modelConfig';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Brain, Code, ShoppingCart, Zap } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  userTier: 'free' | 'basic' | 'premium';
  onUpgradeClick?: () => void;
}

export function ModelSelector({ 
  selectedModel, 
  onModelChange, 
  userTier,
  onUpgradeClick 
}: ModelSelectorProps) {
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [attemptedModel, setAttemptedModel] = useState<string>('');

  const availableModels = MODEL_TIERS[userTier]?.models || {};
  const isUserChoiceAllowed = MODEL_TIERS[userTier]?.userChoice || false;

  const handleModelSelect = (modelKey: string) => {
    const model = availableModels[modelKey];
    
    if (!model) {
      // User trying to select premium model
      setAttemptedModel(modelKey);
      setShowUpgradeDialog(true);
      return;
    }

    onModelChange(model.id);
  };

  const getModelIcon = (model: ModelInfo) => {
    if (model.reasoning) return <Brain className="w-4 h-4" />;
    if (model.specialization?.includes('code')) return <Code className="w-4 h-4" />;
    if (model.specialization?.includes('fast')) return <Zap className="w-4 h-4" />;
    return <ShoppingCart className="w-4 h-4" />;
  };

  const getCostBadge = (model: ModelInfo) => {
    const colors = {
      free: 'bg-green-100 text-green-800',
      'ultra-low': 'bg-blue-100 text-blue-800',
      low: 'bg-yellow-100 text-yellow-800',
      medium: 'bg-orange-100 text-orange-800',
      high: 'bg-red-100 text-red-800',
      premium: 'bg-purple-100 text-purple-800'
    };

    return (
      <Badge className={colors[model.costTier]}>
        {model.costTier === 'free' ? 'Free' : `$${model.inputCost.toFixed(4)}/1K`}
      </Badge>
    );
  };

  // For free users, only show a compact "Auto" control (no upgrade CTA here)
  if (userTier === 'free') {
    return (
      <div className="flex items-center gap-2">
        <Select value="auto" onValueChange={() => {}}>
          <SelectTrigger className="h-8 px-2 text-xs rounded-md border border-border/40 bg-background/60 hover:bg-background/80 w-28">
            <SelectValue>
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                <span className="text-xs">Auto</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-40">
            <SelectItem value="auto">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                <span className="text-sm">Auto</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  // For paid users, show model selection (unchanged)
  const currentModelKey = Object.keys(availableModels).find(
    key => availableModels[key].id === selectedModel
  ) || Object.keys(availableModels)[0];

  return (
    <>
      <Select value={currentModelKey} onValueChange={handleModelSelect}>
        <SelectTrigger className="w-64">
          <SelectValue>
            {availableModels[currentModelKey] && (
              <div className="flex items-center gap-2">
                {getModelIcon(availableModels[currentModelKey])}
                {availableModels[currentModelKey].name}
                {getCostBadge(availableModels[currentModelKey])}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(availableModels).map(([key, model]) => (
            <SelectItem key={key} value={key}>
              <div className="flex items-center gap-2 w-full">
                {getModelIcon(model)}
                <div className="flex-1">
                  <div className="font-medium">{model.name}</div>
                  {model.specialization && (
                    <div className="text-xs text-muted-foreground">
                      {model.specialization}
                    </div>
                  )}
                </div>
                {getCostBadge(model)}
              </div>
            </SelectItem>
          ))}
          
          {/* Show premium models as disabled options for basic users */}
          {userTier === 'basic' && (
            <>
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-t">
                Premium Models (Upgrade Required)
              </div>
              {Object.entries(MODEL_TIERS.premium.models).map(([key, model]) => (
                <SelectItem 
                  key={`premium-${key}`} 
                  value={`premium-${key}`}
                  disabled
                  className="opacity-50"
                >
                  <div className="flex items-center gap-2 w-full">
                    {getModelIcon(model)}
                    <div className="flex-1">
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Requires Premium
                      </div>
                    </div>
                    {/* Crown icon removed from premium models as per new UX */}
                  </div>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

      {/* Upgrade dialog removed from input area per new UX */}
    </>
  );
}