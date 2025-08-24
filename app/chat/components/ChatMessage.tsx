'use client';

import React, { memo, useCallback, useState } from 'react';
import { type Message } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Copy, Check, User, Bot } from 'lucide-react';
import Image from 'next/image';
import { SmartAvatar } from '@/components/ui/avatar';
import MemoizedMarkdown from './tools/MemoizedMarkdown';
import SourceView from './tools/SourceView';
import StreamingReasoningUI from './StreamingReasoningUI';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { useIsMobile } from '@/hooks/use-mobile';

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
  isStreaming?: boolean;
  streamingReasoning?: string;
  isReasoningStreaming?: boolean;
  isReasoningComplete?: boolean;
}

const ChatMessage = memo(({ 
  message, 
  index, 
  isUserMessage, 
  isRoomChat = false, 
  isStreaming = false, 
  streamingReasoning,
  isReasoningStreaming = false,
  isReasoningComplete = false
}: ChatMessageProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const isMobile = useIsMobile();

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

  // Prefer primary content; if assistant text is empty, fall back to reasoning/streamingReasoning
  const primaryText = React.useMemo(() => {
    const base = (cleanContent || '').trim();
    if (base.length > 0) return base;
    if (!isUserMessage && (streamingReasoning || message.reasoning)) {
      return (streamingReasoning || message.reasoning || '').trim();
    }
    return '';
  }, [cleanContent, isUserMessage, streamingReasoning, message.reasoning]);

  // Separate text and reasoning parts for better rendering
  const textParts = primaryText
    ? [{ type: 'text' as const, text: primaryText }]
    : (!isUserMessage ? [{ type: 'text' as const, text: '🤔 AI is thinking…' }] : []);
  // Note: reasoning parts removed for now due to type issues
  const reasoningParts: any[] = [];

  return (
    <li key={message.id} className={`mb-3 sm:mb-2.5 last:mb-2 sm:last:mb-1 group ${isMobile ? 'px-2' : ''}`} data-message-id={message.id} style={{ listStyle: 'none', paddingLeft: 0, marginLeft: 0 }}>
      <div className={`flex gap-2 sm:gap-2 ${isUserMessage ? 'justify-end' : 'justify-start'} items-end`} role={message.role}>
        {/* Avatar - only show on left side for non-current-user messages */}
        {!isUserMessage && (
          <div className={`flex-shrink-0 ${isMobile ? 'w-8 h-8' : 'w-6 h-6'} rounded-full flex items-center justify-center overflow-hidden`}>
            {message.role === 'assistant' ? (
              <Image
                src="/icons/icon-512x512.png"
                alt="AI Assistant"
                width={isMobile ? 32 : 24}
                height={isMobile ? 32 : 24}
                className="rounded-full"
              />
            ) : (
              <SmartAvatar 
                user={{ id: message.senderName || 'other-user', email: `${message.senderName || 'other'}@example.com` }} 
                size={isMobile ? 32 : 24} 
                style="thumbs"
                className="flex-shrink-0"
              />
            )}
          </div>
        )}

        {/* Message Content with Copy Button */}
        <div className={`flex items-start gap-2 sm:gap-1 ${isUserMessage ? 'max-w-[85%] sm:max-w-[85%] md:max-w-[80%]' : 'max-w-[90%] sm:max-w-[90%] md:max-w-[85%]'} ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Message Content Container */}
          <div className={`flex flex-col ${isUserMessage ? 'items-end' : 'items-start'}`}>

            {/* Streaming Reasoning UI - Show for AI messages when reasoning is available OR streaming */}
            {!isUserMessage && message.role === 'assistant' && (
              // show only if we have reasoning content or we are actively streaming reasoning
              (streamingReasoning?.length || message.reasoning?.length) ||
              (isRoomChat && isReasoningStreaming)
            ) && (
              <StreamingReasoningUI
                messageId={message.id}
                reasoningText={streamingReasoning || message.reasoning || ''}
                isStreaming={isRoomChat ? isReasoningStreaming : (!!streamingReasoning && isStreaming)}
                isComplete={isRoomChat ? isReasoningComplete : (!!message.reasoning && !isStreaming)}
                onMinimize={() => {
                  // Handle reasoning minimization if needed
                }}
              />
            )}

            <div 
              className={`rounded-2xl sm:rounded-xl ${isMobile ? 'px-4 py-3 text-base' : 'px-3 py-1.5 text-sm'} ${isUserMessage
                ? 'bg-primary text-primary-foreground rounded-br-md sm:rounded-br-sm'
                : message.role === 'assistant'
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-foreground rounded-bl-md sm:rounded-bl-sm border border-amber-200 dark:border-amber-800/50'
                  : 'bg-muted text-foreground rounded-bl-md sm:rounded-bl-sm border border-border/50'
                }`}
              data-message-content={message.id}
            >
              {/* Render text parts first (main message content) */}
              {textParts.length > 0 ? (
                <div className={`prose ${isMobile ? 'prose-base' : 'prose-sm'} max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1`}>
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
              size={isMobile ? "default" : "sm"}
              onClick={() => handleCopy(cleanContent || '')}
              className={`${isMobile ? 'h-8 w-8' : 'h-6 w-6'} p-0 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity`}
            >
              {isCopied ? (
                <Check className={`${isMobile ? 'w-4 h-4' : 'w-3 h-3'}`} />
              ) : (
                <Copy className={`${isMobile ? 'w-4 h-4' : 'w-3 h-3'}`} />
              )}
            </Button>
          </div>
        </div>

        {/* User Avatar - only show on right side for user messages */}
        {isUserMessage && (
          <SmartAvatar 
            user={{ id: 'user', email: 'user@example.com' }} 
            size={isMobile ? 32 : 24} 
            style="thumbs"
            className="flex-shrink-0"
          />
        )}
      </div>

      {/* Sender name and timestamp - positioned below with proper indentation */}
      {isRoomChat && message.senderName && message.senderName !== 'AI Assistant' && !isUserMessage && (
        <div className={`flex items-center gap-2 sm:gap-1.5 mt-1 sm:mt-0.5 ${isUserMessage ? 'justify-end pr-10 sm:pr-8' : 'justify-start pl-10 sm:pl-8'}`}>
          <span className={`${isMobile ? 'text-xs' : 'text-[10px]'} font-medium text-muted-foreground/80`}>
            {message.senderName}
          </span>
          <span className={`${isMobile ? 'text-xs' : 'text-[9px]'} text-muted-foreground/60`}>
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