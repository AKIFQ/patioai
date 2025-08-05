'use client';

import React, { useState, useEffect } from 'react';
import MemoizedMarkdown from './tools/MemoizedMarkdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

interface RoomReasoningBlockProps {
  reasoning?: string;
  messageId: string;
  isStreaming?: boolean;
  onStreamingStart?: () => void;
}

const RoomReasoningBlock: React.FC<RoomReasoningBlockProps> = ({
  reasoning,
  messageId,
  isStreaming = false,
  onStreamingStart
}) => {
  const [isOpen, setIsOpen] = useState(true); // Start open
  const [hasContent, setHasContent] = useState(false);

  // Auto-minimize when streaming starts
  useEffect(() => {
    if (isStreaming && hasContent) {
      setIsOpen(false);
      onStreamingStart?.();
    }
  }, [isStreaming, hasContent, onStreamingStart]);

  // Track when reasoning content appears
  useEffect(() => {
    if (reasoning && reasoning.trim().length > 0) {
      setHasContent(true);
    }
  }, [reasoning]);

  // Don't render if no reasoning content
  if (!reasoning || reasoning.trim().length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <Accordion
        type="single"
        value={isOpen ? "reasoning" : ""}
        onValueChange={(value) => setIsOpen(value === "reasoning")}
        collapsible
        className="w-full"
      >
        <AccordionItem
          value="reasoning"
          className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg overflow-hidden border border-blue-200 dark:border-blue-800/50 shadow-sm"
        >
          <AccordionTrigger className="font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 py-2 px-3 cursor-pointer text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              Reasoning Process
              {isStreaming && (
                <div className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                  Thinking...
                </div>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="bg-blue-50/30 dark:bg-blue-950/10 p-3 text-sm text-foreground/90 overflow-x-auto max-h-[300px] overflow-y-auto border-t border-blue-200/50 dark:border-blue-800/30">
            <div className="reasoning-content prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2">
              <MemoizedMarkdown
                content={reasoning}
                id={`room-reasoning-${messageId}`}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default RoomReasoningBlock;