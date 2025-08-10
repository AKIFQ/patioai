'use client';

import React, { memo } from 'react';
import { Message } from 'ai';
import Image from 'next/image';
import { User, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { MemoizedMarkdown } from './tools/MemoizedMarkdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { SmartAvatar } from '@/components/ui/Avatar';

interface ChatMessageProps {
  message: Message;
  index: number;
  isUserMessage: boolean;
  isRoomChat?: boolean;
  userInfo?: {
    id: string;
    full_name?: string;
    email?: string;
  };
}

const ChatMessage = memo(({ message, index, isUserMessage, isRoomChat = false, userInfo }: ChatMessageProps) => {
  
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Remove unwanted content like @thinking or other artifacts
  const cleanContent = message.content
    ?.replace(/@thinking[\s\S]*?@\/thinking/g, '')
    ?.replace(/```thinking[\s\S]*?```/g, '')
    ?.replace(/\[thinking\][\s\S]*?\[\/thinking\]/g, '')
    ?.trim();

  // Check if content is empty after cleaning
  if (!cleanContent) {
    return null;
  }

  // Extract senderName from content for room messages
  let displayContent = cleanContent;
  let senderName = '';
  
  if (isUserMessage && isRoomChat) {
    // For room messages, extract sender name if it exists in format "SenderName: message"
    const senderMatch = cleanContent.match(/^([^:]+):\s*(.*)$/s);
    if (senderMatch) {
      senderName = senderMatch[1];
      displayContent = senderMatch[2];
    }
  }

  // Extract reasoning content for room messages
  const reasoningMatch = message.content.match(/```reasoning\s*([\s\S]*?)\s*```/);
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : null;

  // Check if this is a streamed message or has tool invocations
  const hasTools = message.toolInvocations && message.toolInvocations.length > 0;

  const textParts = cleanContent ? [{ type: 'text' as const, text: cleanContent }] : [];
  // Note: reasoning parts removed for now due to type issues
  const reasoningParts: any[] = [];

  return (
    <li key={message.id} className="mb-1.5 last:mb-0 group" data-message-id={message.id} style={{ listStyle: 'none', paddingLeft: 0, marginLeft: 0 }}>
      <div className={`flex gap-2 ${isUserMessage ? 'justify-end' : 'justify-start'}`} role={message.role}>
        {/* Avatar - only show on left side for non-current-user messages */}
        {!isUserMessage && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center overflow-hidden">
            {message.role === 'assistant' ? (
              <Image
                src="/icons/icon-512x512.png"
                alt="AI Assistant"
                width={16}
                height={16}
                className="rounded-full"
              />
            ) : userInfo ? (
              <SmartAvatar 
                user={userInfo} 
                size={24}
                style="thumbs"
              />
            ) : (
              <User className="w-3 h-3 text-primary" />
            )}
          </div>
        )}

        {/* User avatar on right side for user messages in room chat */}
        {isUserMessage && isRoomChat && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center overflow-hidden order-2">
            {userInfo ? (
              <SmartAvatar 
                user={userInfo} 
                size={24}
                style="thumbs"
              />
            ) : (
              <User className="w-3 h-3 text-primary" />
            )}
          </div>
        )}

        {/* Message Content with Copy Button */}
        <div className={`flex items-start gap-1 max-w-[85%] sm:max-w-[75%] 
          ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
          
          {/* Main message bubble */}
          <div className={`relative rounded-2xl px-3 py-2 max-w-full break-words font-normal text-sm leading-relaxed
            ${isUserMessage 
              ? 'bg-primary text-primary-foreground ml-auto' 
              : 'bg-muted text-foreground'
            }`}>
            
            {/* Show sender name for room messages */}
            {isRoomChat && senderName && (
              <div className="text-xs opacity-70 mb-1 font-medium">
                {senderName}
              </div>
            )}

            {/* Main content */}
            <div className="space-y-2">
              {textParts.map((part, partIndex) => (
                <div key={partIndex}>
                  {part.type === 'text' ? (
                    <MemoizedMarkdown content={part.text} id={`message-${message.id}-${partIndex}`} />
                  ) : null}
                </div>
              ))}
            </div>

            {/* Tool invocations */}
            {hasTools && (
              <div className="mt-2 space-y-2">
                {message.toolInvocations?.map((tool, toolIndex) => (
                  <div key={toolIndex} className="border-t border-border/20 pt-2">
                    <div className="text-xs opacity-70 mb-1">
                      Tool: {tool.toolName}
                    </div>
                    {'result' in tool && tool.result && (
                      <div className="text-xs bg-background/50 rounded p-2">
                        {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Copy button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={copyToClipboard}
            className={`p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity
              ${isUserMessage ? 'ml-1' : 'mr-1'}`}
            aria-label="Copy message"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
        </div>

        {/* Reasoning section for room messages */}
        {!isUserMessage && isRoomChat && message.role === 'assistant' && reasoning && (
          <div className="w-full mb-2">
            <div className="mb-4">
              <Accordion type="single" defaultValue="reasoning" collapsible className="w-full">
                <AccordionItem value="reasoning" className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg overflow-hidden border border-blue-200 dark:border-blue-800/30">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI Reasoning Process
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MemoizedMarkdown content={reasoning} id={`reasoning-${message.id}`} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        )}
      </div>
    </li>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;