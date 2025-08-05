'use client';

import React from 'react';
import Image from 'next/image';

interface AILoadingMessageProps {
  className?: string;
  message?: string;
  showInline?: boolean; // For inline display in message list
}

const AILoadingMessage: React.FC<AILoadingMessageProps> = ({ 
  className = '', 
  message = 'AI is thinking...',
  showInline = false 
}) => {
  return (
    <li className={`mb-3 last:mb-0 ${className}`}>
      <div className="flex gap-2 justify-start">
        {/* AI Avatar with rotation */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          <Image 
            src="/icons/icon-512x512.png" 
            alt="AI Assistant" 
            width={16} 
            height={16}
            className="rounded-full animate-spin"
          />
        </div>
        
        {/* Loading Message Content */}
        <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-start">
          <div className="bg-blue-50 dark:bg-blue-950/30 text-foreground rounded-xl rounded-bl-sm border border-blue-200 dark:border-blue-800/50 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-muted-foreground">{message}</span>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

export default AILoadingMessage;