'use client';

import React, { memo, useCallback, useState } from 'react';
import { type Message } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Copy, Check, User, Bot } from 'lucide-react';
import MemoizedMarkdown from './tools/MemoizedMarkdown';
import SourceView from './tools/SourceView';

interface ChatMessageProps {
  message: Message;
  index: number;
  isUserMessage: boolean;
}

const ChatMessage = memo(({ message, index, isUserMessage }: ChatMessageProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback((content: string) => {
    window.navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1000);
  }, []);

  // Separate text and reasoning parts for better rendering
  const textParts = message.content ? [{ type: 'text' as const, text: message.content }] : [];
  const reasoningParts = message.experimental_providerMetadata?.reasoning 
    ? [{ type: 'reasoning' as const, text: message.experimental_providerMetadata.reasoning }] 
    : [];

  return (
    <li key={message.id} className="mb-6 last:mb-0">
      <div className={`flex gap-3 ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
        {!isUserMessage && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        )}
        
        <div className={`max-w-[85%] ${isUserMessage ? 'order-first' : ''}`}>
          <div className={`rounded-lg px-4 py-3 ${
            isUserMessage 
              ? 'bg-primary text-primary-foreground ml-auto' 
              : 'bg-muted'
          }`}>
            {/* Render text parts first (main message content) */}
            {textParts.length > 0 ? (
              textParts.map((part, partIndex) => (
                <MemoizedMarkdown
                  key={`text-${partIndex}`}
                  content={part.text}
                  id={`message-${message.id}-text-${partIndex}`}
                />
              ))
            ) : (
              <div className="text-muted-foreground italic">No content</div>
            )}

            {/* Then render reasoning parts (only for assistant messages) */}
            {!isUserMessage &&
              reasoningParts.map((part, partIndex) => (
                <details key={`reasoning-${partIndex}`} className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    View reasoning
                  </summary>
                  <div className="mt-2 p-3 bg-background/50 rounded border">
                    <MemoizedMarkdown
                      content={part.text}
                      id={`message-${message.id}-reasoning-${partIndex}`}
                    />
                  </div>
                </details>
              ))}

            {/* Copy button */}
            <div className="flex justify-end mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(message.content || '')}
                className="h-6 px-2 text-xs"
              >
                {isCopied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>

          {/* Sources (only for assistant messages) */}
          {!isUserMessage && message.experimental_providerMetadata?.sources && (
            <div className="mt-2">
              <SourceView sources={message.experimental_providerMetadata.sources} />
            </div>
          )}
        </div>

        {isUserMessage && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        )}
      </div>
    </li>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;