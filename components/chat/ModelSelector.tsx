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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Crown, Zap, Brain, Code, ShoppingCart } from 'lucide-react';

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

  // For free users, only show "Auto" option
  if (userTier === 'free') {
    return (
      <div className="flex items-center gap-2">
        <Select value="auto" onValueChange={() => {}}>
          <SelectTrigger className="w-48">
            <SelectValue>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Auto (Smart Routing)
                <Badge className="bg-green-100 text-green-800 ml-2">Free</Badge>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                <div>
                  <div className="font-medium">Auto (Smart Routing)</div>
                  <div className="text-xs text-muted-foreground">
                    Automatically selects the best free model for your query
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Free</Badge>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onUpgradeClick}
          className="flex items-center gap-1"
        >
          <Crown className="w-4 h-4" />
          Upgrade for More Models
        </Button>
      </div>
    );
  }

  // For paid users, show model selection
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
                    <Crown className="w-4 h-4 text-yellow-500" />
                  </div>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500" />
              Upgrade Required
            </DialogTitle>
            <DialogDescription>
              This model requires a higher subscription tier to access advanced features and premium models.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">What you'll get:</h4>
              <ul className="text-sm space-y-1">
                <li>• Access to flagship models (GPT-4o, Claude Sonnet)</li>
                <li>• Advanced reasoning capabilities</li>
                <li>• Higher monthly limits</li>
                <li>• Priority support</li>
              </ul>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={onUpgradeClick} className="flex-1">
                <Crown className="w-4 h-4 mr-2" />
                Upgrade Now
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowUpgradeDialog(false)}
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}