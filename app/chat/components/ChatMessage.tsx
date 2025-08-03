'use client';

import React, { memo, useCallback, useState } from 'react';
import { type Message } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Copy, Check, User, Bot } from 'lucide-react';
import Image from 'next/image';
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
  // Note: reasoning parts removed for now due to type issues
  const reasoningParts: any[] = [];

  return (
    <li key={message.id} className="mb-3 last:mb-0 group">
      <div className={`flex gap-2 ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
        {/* Avatar - only show on left side for non-current-user messages */}
        {!isUserMessage && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
            {message.role === 'assistant' ? (
              <Image
                src="/icons/icon-512x512.png"
                alt="AI Assistant"
                width={16}
                height={16}
                className="rounded-full"
              />
            ) : (
              <User className="w-3 h-3 text-primary" />
            )}
          </div>
        )}

        {/* Message Content */}
        <div className={`max-w-[85%] sm:max-w-[75%] ${isUserMessage ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
          {/* Sender name for non-current-user messages */}
          {!isUserMessage && (message as any).senderName && (message as any).senderName !== 'AI Assistant' && (
            <div className="text-xs text-muted-foreground mb-1 px-2">
              {(message as any).senderName}
            </div>
          )}

          <div className={`rounded-xl px-3 py-2 text-sm ${isUserMessage
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : message.role === 'assistant'
              ? 'bg-blue-50 dark:bg-blue-950/30 text-foreground rounded-bl-sm border border-blue-200 dark:border-blue-800/50'
              : 'bg-muted text-foreground rounded-bl-sm border border-border/50'
            }`}>
            {/* Render text parts first (main message content) */}
            {textParts.length > 0 ? (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1">
                {textParts.map((part, partIndex) => (
                  <MemoizedMarkdown
                    key={`text-${partIndex}`}
                    content={part.text}
                    id={`message-${message.id}-text-${partIndex}`}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground italic text-xs">No content</div>
            )}

            {/* Then render reasoning parts (only for assistant messages) */}
            {!isUserMessage &&
              reasoningParts.map((part, partIndex) => (
                <details key={`reasoning-${partIndex}`} className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    View reasoning
                  </summary>
                  <div className="mt-1 p-2 bg-background/50 rounded text-xs">
                    <MemoizedMarkdown
                      content={part.text}
                      id={`message-${message.id}-reasoning-${partIndex}`}
                    />
                  </div>
                </details>
              ))}
          </div>

          {/* Copy button - positioned outside the message bubble */}
          <div className={`flex mt-1 ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(message.content || '')}
              className="h-5 px-1 text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
            >
              {isCopied ? (
                <Check className="w-2.5 h-2.5" />
              ) : (
                <Copy className="w-2.5 h-2.5" />
              )}
            </Button>
          </div>

          {/* Sources (only for assistant messages) - temporarily disabled due to type issues */}
          {false && !isUserMessage && (
            <div className="mt-1">
              {/* <SourceView sources={message.experimental_providerMetadata.sources} /> */}
            </div>
          )}
        </div>

        {/* User Avatar - only show on right side for user messages */}
        {isUserMessage && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <User className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
      </div>
    </li>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;