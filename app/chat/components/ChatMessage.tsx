'use client';

import React, { memo, useCallback, useState } from 'react';
import { type Message } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Copy, Check, User, Bot } from 'lucide-react';
import Image from 'next/image';
import { SmartAvatar } from '@/components/ui/Avatar';
import MemoizedMarkdown from './tools/MemoizedMarkdown';
import SourceView from './tools/SourceView';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

// Enhanced message interface for room chats with reasoning support
interface EnhancedMessage extends Message {
  reasoning?: string;
  sources?: any[];
  senderName?: string;
}

interface ChatMessageProps {
  message: EnhancedMessage;
  index: number;
  isUserMessage: boolean;
  isRoomChat?: boolean;
}

const ChatMessage = memo(({ message, index, isUserMessage, isRoomChat = false }: ChatMessageProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback((content: string) => {
    window.navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1000);
  }, []);

  // Clean message content for room chats - remove sender name prefix if present
  const cleanContent = React.useMemo(() => {
    if (!message.content) return '';
    
    // For room chats, we need to clean USER messages (not AI messages)
    // User messages often have "SenderName: message" format that should be cleaned
    if (isRoomChat && message.role === 'user') {
      // Method 1: Use senderName if available
      if (message.senderName) {
        const senderPrefix = `${message.senderName}: `;
        if (message.content.startsWith(senderPrefix)) {
          console.log('🧹 Removing sender prefix from user message:', senderPrefix);
          return message.content.substring(senderPrefix.length);
        }
      }
      
      // Method 2: Pattern detection for "Name: message" format
      const colonIndex = message.content.indexOf(': ');
      if (colonIndex > 0 && colonIndex < 50) { // Reasonable name length
        const potentialName = message.content.substring(0, colonIndex);
        // Check if it looks like a name (letters, spaces, reasonable length)
        if (/^[A-Za-z\s\.]+$/.test(potentialName) && potentialName.length < 40) {
          console.log('🧹 Removing detected sender prefix from user message:', potentialName + ': ');
          return message.content.substring(colonIndex + 2);
        }
      }
    }
    
    return message.content;
  }, [message.content, message.senderName, isRoomChat, message.role]);

  // Separate text and reasoning parts for better rendering
  const textParts = cleanContent ? [{ type: 'text' as const, text: cleanContent }] : [];
  // Note: reasoning parts removed for now due to type issues
  const reasoningParts: any[] = [];

  return (
    <li key={message.id} className="mb-1.5 last:mb-0 group" data-message-id={message.id} style={{ listStyle: 'none', paddingLeft: 0, marginLeft: 0 }}>
      <div className={`flex gap-2 ${isUserMessage ? 'justify-end' : 'justify-start'} items-end`} role={message.role}>
        {/* Avatar - only show on left side for non-current-user messages */}
        {!isUserMessage && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center overflow-hidden">
            {message.role === 'assistant' ? (
              <Image
                src="/icons/icon-512x512.png"
                alt="AI Assistant"
                width={24}
                height={24}
                className="rounded-full"
              />
            ) : (
              <SmartAvatar 
                user={{ id: message.senderName || 'other-user', email: `${message.senderName || 'other'}@example.com` }} 
                size={24} 
                style="thumbs"
                className="flex-shrink-0"
              />
            )}
          </div>
        )}

        {/* Message Content with Copy Button */}
        <div className={`flex items-start gap-1 max-w-[85%] sm:max-w-[75%] ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Message Content Container */}
          <div className={`flex flex-col ${isUserMessage ? 'items-end' : 'items-start'}`}>

            {/* Reasoning Block - Show at top for AI messages in room chats */}
            {!isUserMessage && isRoomChat && message.role === 'assistant' && message.reasoning && (
              <div className="w-full mb-2">
                <div className="mb-4">
                  <Accordion type="single" defaultValue="reasoning" collapsible className="w-full">
                    <AccordionItem value="reasoning" className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg overflow-hidden border border-blue-200 dark:border-blue-800/50 shadow-sm">
                      <AccordionTrigger className="font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 py-2 px-3 cursor-pointer text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          Reasoning Process
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="bg-blue-50/30 dark:bg-blue-950/10 p-3 text-sm text-foreground/90 overflow-x-auto max-h-[300px] overflow-y-auto border-t border-blue-200/50 dark:border-blue-800/30">
                        <div className="reasoning-content prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2">
                          <MemoizedMarkdown content={message.reasoning} id={`room-reasoning-${message.id}`} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            )}

            <div 
              className={`rounded-xl px-3 py-1.5 text-sm ${isUserMessage
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : message.role === 'assistant'
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-foreground rounded-bl-sm border border-amber-200 dark:border-amber-800/50'
                  : 'bg-muted text-foreground rounded-bl-sm border border-border/50'
                }`}
              data-message-content={message.id}
            >
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



            {/* Sources (only for assistant messages) - temporarily disabled due to type issues */}
            {false && !isUserMessage && (
              <div className="mt-1">
                {/* <SourceView sources={message.experimental_providerMetadata.sources} /> */}
              </div>
            )}
          </div>

          {/* Copy button - positioned to the side of the message bubble */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(cleanContent || '')}
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
            >
              {isCopied ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>

        {/* User Avatar - only show on right side for user messages */}
        {isUserMessage && (
          <SmartAvatar 
            user={{ id: 'user', email: 'user@example.com' }} 
            size={24} 
            style="thumbs"
            className="flex-shrink-0"
          />
        )}
      </div>

      {/* Sender name and timestamp - positioned below with proper indentation */}
      {isRoomChat && message.senderName && message.senderName !== 'AI Assistant' && !isUserMessage && (
        <div className={`flex items-center gap-1.5 mt-0.5 ${isUserMessage ? 'justify-end pr-8' : 'justify-start pl-8'}`}>
          <span className="text-[10px] font-medium text-muted-foreground/80">
            {message.senderName}
          </span>
          <span className="text-[9px] text-muted-foreground/60">
            {message.createdAt
              ? new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })
              : new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })
            }
          </span>
        </div>
      )}
    </li>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;