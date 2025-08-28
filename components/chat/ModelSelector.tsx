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

  // Icons removed - text labels are sufficient

  const getCostBadge = (model: ModelInfo) => {
    const colors = {
      free: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
      'ultra-low': 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
      low: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      medium: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      high: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
      premium: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
    };

    return (
      <Badge className={`${colors[model.costTier]} border-0 shadow-elevation-1 rounded-full text-[9px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5`}>
        {model.costTier === 'free' ? 'Free' : `$${model.inputCost.toFixed(4)}/1K`}
      </Badge>
    );
  };

  // For free users, only show a compact "Auto" control (no upgrade CTA here)
  if (userTier === 'free') {
    return (
      <div className="flex items-center gap-2">
        <Select value="auto" onValueChange={() => {}}>
          <SelectTrigger className="h-6 px-2 text-[10px] sm:h-8 sm:px-3 sm:text-xs rounded-full border-0 
                                            bg-[var(--elevation-2)] hover:bg-[var(--elevation-3)]
                                            transition-smooth shadow-elevation-1 hover:shadow-elevation-2 w-12 sm:w-20">
            <SelectValue>
              <span className="text-[10px] sm:text-xs">Auto</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-28 sm:w-40 border-0 bg-[var(--elevation-2)] backdrop-blur-md shadow-elevation-3 rounded-xl">
            <SelectItem value="auto">
              <span className="text-xs sm:text-sm">Auto</span>
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
        <SelectTrigger className="w-32 sm:w-64 border-0 bg-[var(--elevation-2)] hover:bg-[var(--elevation-3)]
                                   transition-smooth shadow-elevation-1 hover:shadow-elevation-2 rounded-xl h-6 sm:h-8">
          <SelectValue>
            {availableModels[currentModelKey] && (
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-[10px] sm:text-sm truncate">{availableModels[currentModelKey].name}</span>
                <div className="hidden sm:block">{getCostBadge(availableModels[currentModelKey])}</div>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="border-0 bg-[var(--elevation-2)] backdrop-blur-md shadow-elevation-3 rounded-xl">
          {Object.entries(availableModels).map(([key, model]) => (
            <SelectItem key={key} value={key}>
              <div className="flex items-center gap-2 w-full">
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
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground 
                             bg-[var(--elevation-3)] border-0 rounded-lg mx-1 my-1">
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
                    <div className="flex-1">
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Requires Premium
                      </div>
                    </div>
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