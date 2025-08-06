'use client';

import React, { useState, useEffect, useMemo } from 'react';
import MemoizedMarkdown from './tools/MemoizedMarkdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

interface StreamingReasoningBlockProps {
  reasoning?: string;
  messageId: string;
  isStreaming?: boolean;
  phase?: 'reasoning' | 'answering' | 'complete';
  onTransitionComplete?: () => void;
}

/**
 * Streaming-aware reasoning block that handles the ChatGPT-like flow:
 * 1. Starts expanded during reasoning phase
 * 2. Shows live streaming reasoning content
 * 3. Smoothly collapses when answer phase starts
 * 4. Remains accessible but minimized
 */
const StreamingReasoningBlock: React.FC<StreamingReasoningBlockProps> = ({
  reasoning,
  messageId,
  isStreaming = false,
  phase = 'complete',
  onTransitionComplete
}) => {
  // State for accordion open/closed
  const [isOpen, setIsOpen] = useState(true);
  
  // Track if we've transitioned to answering phase
  const [hasTransitioned, setHasTransitioned] = useState(false);

  // Auto-collapse when transitioning from reasoning to answering
  useEffect(() => {
    if (phase === 'answering' && !hasTransitioned) {
      console.log('🔄 Transitioning reasoning to collapsed state');
      setIsOpen(false);
      setHasTransitioned(true);
      onTransitionComplete?.();
    }
  }, [phase, hasTransitioned, onTransitionComplete]);

  // Reset state for new messages
  useEffect(() => {
    if (phase === 'reasoning') {
      setIsOpen(true);
      setHasTransitioned(false);
    }
  }, [messageId, phase]);

  // Don't render if no reasoning content
  if (!reasoning || reasoning.trim().length === 0) {
    return null;
  }

  // Determine display state based on phase
  const displayState = useMemo(() => {
    switch (phase) {
      case 'reasoning':
        return {
          title: 'Thinking...',
          isAnimated: true,
          canToggle: false, // Don't allow manual toggle during streaming
          bgColor: 'bg-blue-50/50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800/50',
          textColor: 'text-blue-700 dark:text-blue-300'
        };
      case 'answering':
      case 'complete':
        return {
          title: 'View reasoning',
          isAnimated: false,
          canToggle: true,
          bgColor: 'bg-gray-50/50 dark:bg-gray-950/20',
          borderColor: 'border-gray-200 dark:border-gray-800/50',
          textColor: 'text-gray-700 dark:text-gray-300'
        };
      default:
        return {
          title: 'Reasoning Process',
          isAnimated: false,
          canToggle: true,
          bgColor: 'bg-blue-50/50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800/50',
          textColor: 'text-blue-700 dark:text-blue-300'
        };
    }
  }, [phase]);

  const handleToggle = (value: string) => {
    if (displayState.canToggle) {
      setIsOpen(value === "reasoning");
    }
  };

  return (
    <div className="mb-4">
      <Accordion
        type="single"
        value={isOpen ? "reasoning" : ""}
        onValueChange={handleToggle}
        collapsible
        className="w-full"
      >
        <AccordionItem
          value="reasoning"
          className={`${displayState.bgColor} rounded-lg overflow-hidden border ${displayState.borderColor} shadow-sm transition-all duration-300`}
        >
          <AccordionTrigger 
            className={`font-medium ${displayState.textColor} hover:text-blue-800 dark:hover:text-blue-200 py-2 px-3 text-sm transition-colors ${
              displayState.canToggle ? 'cursor-pointer' : 'cursor-default'
            }`}
            disabled={!displayState.canToggle}
          >
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                displayState.isAnimated 
                  ? 'bg-blue-500 animate-pulse' 
                  : 'bg-gray-400'
              }`}></div>
              
              <span>{displayState.title}</span>
              
              {displayState.isAnimated && (
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              )}
            </div>
          </AccordionTrigger>
          
          <AccordionContent className={`${displayState.bgColor} p-3 text-sm text-foreground/90 overflow-x-auto max-h-[300px] overflow-y-auto border-t ${displayState.borderColor} transition-all duration-300`}>
            <div className="reasoning-content prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2">
              <MemoizedMarkdown
                content={reasoning}
                id={`streaming-reasoning-${messageId}`}
              />
              
              {/* Show typing indicator during reasoning phase */}
              {phase === 'reasoning' && isStreaming && (
                <div className="flex items-center gap-2 mt-2 text-blue-600 dark:text-blue-400">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs animate-pulse">Thinking...</span>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default StreamingReasoningBlock;