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
import { Inter } from 'next/font/google';

const interMessage = Inter({ subsets: ['latin'], display: 'swap' });

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
    <li key={message.id} className={`${isMobile ? 'mb-3 px-2' : 'mb-6 sm:mb-4 last:mb-4 sm:last:mb-3 px-1'} group`} data-message-id={message.id} style={{ listStyle: 'none', paddingLeft: 0, marginLeft: 0 }}>
      <div className={`flex ${isMobile ? 'gap-2' : 'gap-2 sm:gap-2'} ${isUserMessage ? 'justify-end' : 'justify-start'} items-end`} role={message.role}>
        {/* Avatar - only show on left side for non-current-user messages */}
        {!isUserMessage && (
          <div className={`flex-shrink-0 ${isMobile ? 'w-6 h-6' : 'w-6 h-6'} rounded-full flex items-center justify-center overflow-hidden`}>
            {message.role === 'assistant' ? (
              <Image
                src="/icons/icon-512x512.png"
                alt="AI Assistant"
                width={isMobile ? 24 : 24}
                height={isMobile ? 24 : 24}
                className="rounded-full"
              />
            ) : (
              <SmartAvatar 
                user={{ id: message.senderName || 'other-user', email: `${message.senderName || 'other'}@example.com` }} 
                size={isMobile ? 24 : 24} 
                style="thumbs"
                className="flex-shrink-0"
              />
            )}
          </div>
        )}

        {/* Message Content with Copy Button */}
        <div className={`flex items-start ${isMobile ? 'gap-1' : 'gap-2 sm:gap-1'} ${isUserMessage ? (isMobile ? 'max-w-[85%]' : 'max-w-[72%] sm:max-w-[70%] md:max-w-[65%]') : 'max-w-full'} ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
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
              className={`
                ${isMobile ? 'rounded-xl' : 'rounded-2xl'} transition-smooth shadow-elevation-1 hover:shadow-elevation-2
                ${isMobile ? 'px-3 py-2 text-sm' : 'px-3 py-2 text-small'} ${interMessage.className}
                ${isUserMessage
                  ? `bg-primary text-primary-foreground ${isMobile ? 'rounded-br-md' : 'rounded-br-lg'} 
                     shadow-[0_2px_12px_color-mix(in_srgb,var(--primary)_20%,transparent)]
                     hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--primary)_25%,transparent)]`
                  : message.role === 'assistant'
                    ? `bg-[#FFFFE0] dark:bg-[var(--forest-950)] text-foreground ${isMobile ? 'rounded-bl-md' : 'rounded-bl-lg'}
                       border border-[#E5E5E5] dark:border-0 backdrop-blur-sm
                       shadow-[0_2px_8px_color-mix(in_srgb,var(--foreground)_8%,transparent)]
                       hover:shadow-[0_4px_12px_color-mix(in_srgb,var(--foreground)_12%,transparent)]`
                    : `bg-gradient-to-br from-[var(--cream-300)] to-[var(--cream-400)] dark:from-[var(--elevation-1)] dark:to-[var(--elevation-2)] text-foreground ${isMobile ? 'rounded-bl-md' : 'rounded-bl-lg'}
                       border border-[#E5E5E5] dark:border-0 backdrop-blur-sm
                       shadow-[0_1px_6px_color-mix(in_srgb,var(--foreground)_6%,transparent)]
                       hover:shadow-[0_2px_8px_color-mix(in_srgb,var(--foreground)_10%,transparent)]`
                }
              `}
              data-message-content={message.id}
            >
              {/* Render text parts first (main message content) */}
              {textParts.length > 0 ? (
                <div className={`prose ${isMobile ? 'prose-sm' : 'prose-sm'} max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-1 prose-ul:my-1 prose-ol:my-1`}>
                  {textParts.map((part, partIndex) => (
                    <MemoizedMarkdown
                      key={`text-${partIndex}`}
                      content={part.text}
                      id={`message-${message.id}-text-${partIndex}`}
                      compact={isMobile}
                    />
                  ))}
                </div>
              ) : (
                <div className={`text-muted-foreground italic ${isMobile ? 'text-xs' : 'text-xs'}`}>No content</div>
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

          {/* Modern floating copy button */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(cleanContent || '')}
              className={`
                ${isMobile ? 'h-6 w-6' : 'h-6 w-6'} p-0 rounded-full
                ${isMobile ? 'opacity-60 active:opacity-100' : 'opacity-0 group-hover:opacity-80 hover:opacity-100'}
                transition-all duration-200 hover:scale-105
                bg-[var(--elevation-3)] hover:bg-[var(--elevation-4)]
                shadow-elevation-1 hover:shadow-elevation-2
                border-0 backdrop-blur-sm
              `}
            >
              {isCopied ? (
                <Check className={`${isMobile ? 'w-3 h-3' : 'w-3 h-3'}`} />
              ) : (
                <Copy className={`${isMobile ? 'w-3 h-3' : 'w-3 h-3'}`} />
              )}
            </Button>
          </div>
        </div>

        {/* User Avatar - only show on right side for user messages */}
        {isUserMessage && (
          <SmartAvatar 
            user={{ id: 'user', email: 'user@example.com' }} 
            size={isMobile ? 24 : 24} 
            style="thumbs"
            className="flex-shrink-0"
          />
        )}
      </div>

      {/* Enhanced sender name and timestamp with modern typography */}
      {isRoomChat && message.senderName && message.senderName !== 'AI Assistant' && !isUserMessage && (
        <div className={`flex items-center ${isMobile ? 'gap-1.5 mt-1' : 'gap-2 sm:gap-1.5 mt-1.5 sm:mt-1'} ${isUserMessage ? (isMobile ? 'justify-end pr-8' : 'justify-end pr-10 sm:pr-8') : (isMobile ? 'justify-start pl-8' : 'justify-start pl-10 sm:pl-8')}`}>
          <span className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} font-semibold uppercase tracking-wide text-gradient opacity-90`}>
            {message.senderName}
          </span>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/40"></div>
          <span className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground/70 tracking-wider`}>
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