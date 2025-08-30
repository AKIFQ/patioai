'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordRequirements {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

interface PasswordStrengthIndicatorProps {
  password: string;
  requirements: PasswordRequirements;
  strengthLevel: 'weak' | 'fair' | 'good' | 'strong';
  show: boolean;
}

export function PasswordStrengthIndicator({
  password,
  requirements,
  strengthLevel,
  show
}: PasswordStrengthIndicatorProps) {
  if (!show || !password) return null;

  const strengthColors = {
    weak: 'bg-red-500',
    fair: 'bg-orange-500', 
    good: 'bg-yellow-500',
    strong: 'bg-green-500'
  };

  const strengthTextColors = {
    weak: 'text-red-600',
    fair: 'text-orange-600',
    good: 'text-yellow-600', 
    strong: 'text-green-600'
  };

  const strengthLabels = {
    weak: 'Weak',
    fair: 'Fair',
    good: 'Good',
    strong: 'Strong'
  };

  const requirementsList = [
    { key: 'length', label: 'At least 6 characters', met: requirements.length },
    { key: 'number', label: 'One number', met: requirements.number },
    { key: 'uppercase', label: 'One uppercase letter', met: requirements.uppercase },
    { key: 'lowercase', label: 'One lowercase letter', met: requirements.lowercase },
  ];

  const progress = Object.values(requirements).filter(Boolean).length;
  const maxProgress = Object.keys(requirements).length;

  return (
    <div className="mt-3 p-3 border border-border/40 rounded-lg bg-muted/20">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">Password strength</span>
        <span className={cn("text-sm font-medium", strengthTextColors[strengthLevel])}>
          {strengthLabels[strengthLevel]}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-muted/40 rounded-full h-2 mb-3">
        <div 
          className={cn("h-2 rounded-full transition-all duration-300", strengthColors[strengthLevel])}
          style={{ width: `${(progress / maxProgress) * 100}%` }}
        />
      </div>

      {/* Requirements list */}
      <div className="space-y-2">
        {requirementsList.map((req) => (
          <div key={req.key} className="flex items-center gap-2 text-sm">
            {req.met ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-red-500" />
            )}
            <span className={cn(
              "transition-colors duration-200",
              req.met ? "text-green-600" : "text-muted-foreground"
            )}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
