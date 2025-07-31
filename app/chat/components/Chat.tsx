'use client';

import React, { useState, useOptimistic, startTransition, useEffect, useCallback } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { useParams, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { v4 as uuidv4 } from 'uuid';
import { ChatScrollAnchor } from '../hooks/chat-scroll-anchor';
import { setModelSettings } from '../actions';
import Link from 'next/link';
// Shadcn UI components
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import MemoizedMarkdown from './tools/MemoizedMarkdown';
import ReasoningContent from './tools/Reasoning';
import SourceView from './tools/SourceView';
import DocumentSearchTool from './tools/DocumentChatTool';
import WebsiteSearchTool from './tools/WebsiteChatTool';
import MessageInput from './ChatMessageInput';
import { toast } from 'sonner';
import RoomSettingsModal from './RoomSettingsModal';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import TypingIndicator from './TypingIndicator';

// Icons from Lucide React
import { User, Bot, Copy, CheckCircle, FileIcon, Plus, Loader2 } from 'lucide-react';

interface RoomContext {
  shareCode: string;
  roomName: string;
  displayName: string;
  sessionId: string;
  participants: Array<{ displayName: string; joinedAt: string; sessionId: string; userId?: string }>;
  maxParticipants: number;
  tier: 'free' | 'pro';
  createdBy?: string;
  expiresAt?: string;
  chatSessionId?: string;
}

interface ChatProps {
  currentChat?: Message[];
  chatId: string;
  initialModelType: string;
  initialSelectedOption: string;
  roomContext?: RoomContext;
}

const ChatComponent: React.FC<ChatProps> = ({
  currentChat,
  chatId,
  initialModelType,
  initialSelectedOption,
  roomContext
}) => {
  const param = useParams();
  const router = useRouter();
  const currentChatId = param.id as string;

  const [optimisticModelType, setOptimisticModelType] = useOptimistic<
    string,
    string
  >(initialModelType, (_, newValue) => newValue);
  const [isCopied, setIsCopied] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [optimisticOption, setOptimisticOption] = useOptimistic<string, string>(
    initialSelectedOption,
    (_, newValue) => newValue
  );
  
  // Real-time state for room chats
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>(currentChat || []);
  const [isClient, setIsClient] = useState(false);

  // Prevent hydration issues with real-time connection status
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update URL with chatSessionId for room chats (client-side only)
  useEffect(() => {
    if (isClient && roomContext && roomContext.chatSessionId) {
      const currentParams = new URLSearchParams(window.location.search);
      const urlChatSession = currentParams.get('chatSession');
      
      // If chatSessionId exists but not in URL, update URL
      if (!urlChatSession && roomContext.chatSessionId) {
        const newParams = new URLSearchParams(currentParams);
        newParams.set('chatSession', roomContext.chatSessionId);
        
        const newUrl = `${window.location.pathname}?${newParams.toString()}`;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [isClient, roomContext]);

  const handleModelTypeChange = async (newValue: string) => {
    startTransition(async () => {
      setOptimisticModelType(newValue);
      await setModelSettings(newValue, optimisticOption);
    });
  };

  const handleOptionChange = async (newValue: string) => {
    startTransition(async () => {
      setOptimisticOption(newValue);
      await setModelSettings(optimisticModelType, newValue);
    });
  };

  // Determine API endpoint based on model type and room context
  const getApiEndpoint = () => {
    if (roomContext) {
      return `/api/rooms/${roomContext.shareCode}/chat`;
    }
    
    switch (optimisticModelType) {
      case 'perplex':
        return '/api/perplexity';
      case 'website':
        return '/api/websitechat';
      default:
        return '/api/chat';
    }
  };

  const apiEndpoint = getApiEndpoint();

  // Get messages from chat
  const { messages, status, append, setMessages } = useChat({
    id: roomContext ? `room_${roomContext.shareCode}` : chatId,
    api: apiEndpoint,
    experimental_throttle: 50,
    initialMessages: currentChat,
    body: roomContext ? {
      displayName: roomContext.displayName,
      option: optimisticOption,
      threadId: roomContext.chatSessionId
    } : {
      chatId: chatId,
      option: optimisticOption
    },
    onFinish: async () => {
      // Always refresh chat previews to update sidebar
      await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
    },

    onError: (error) => {
      toast.error(error.message || 'An error occurred'); // This could lead to sensitive information exposure. A general error message is safer.
    }
  });

  const { mutate } = useSWRConfig();

  // Real-time functionality for room chats
  const handleNewMessage = useCallback((newMessage: Message) => {
    console.log('🏠 Chat received RT message:', newMessage.role, 'from', newMessage.content?.substring(0, 30));
    // Only add if it's not already in the messages (avoid duplicates)
    setRealtimeMessages(prev => {
      const exists = prev.find(msg => msg.id === newMessage.id);
      if (exists) {
        console.log('⚠️ Message already exists, skipping:', newMessage.id);
        return prev;
      }
      console.log('✅ Adding new RT message to chat UI:', newMessage.id);
      return [...prev, newMessage];
    });
  }, []);

  const handleTypingUpdate = useCallback((users: string[]) => {
    console.log('👥 Typing users updated in Chat:', users);
    console.log('Current user:', roomContext?.displayName);
    setTypingUsers(users);
  }, [roomContext?.displayName]);

  // Initialize real-time hook with safe fallbacks
  const realtimeHook = roomContext ? useRoomRealtime({
    shareCode: roomContext.shareCode,
    displayName: roomContext.displayName,
    chatSessionId: roomContext.chatSessionId,
    onNewMessage: handleNewMessage,
    onTypingUpdate: handleTypingUpdate
  }) : null;

  const { 
    isConnected = false, 
    connectionStatus = 'DISCONNECTED', 
    broadcastTyping = undefined, 
    stopTyping = undefined 
  } = realtimeHook || {};

  // Initialize realtime messages with current chat messages
  useEffect(() => {
    if (roomContext) {
      if (currentChat && currentChat.length > 0) {
        // Initialize with current chat messages
        console.log('Initializing realtime messages with currentChat:', currentChat.length);
        setRealtimeMessages(currentChat);
      } else {
        // Start with empty array for fresh sessions
        setRealtimeMessages([]);
      }
    }
  }, [roomContext, currentChat]);

    // For room chats, combine useChat (streaming) with real-time (other users)
  useEffect(() => {
    if (roomContext) {
      // Always sync useChat messages (includes live streaming)
      setRealtimeMessages(prevRealtime => {
        // Start fresh with useChat messages (preserves streaming)
        const merged = [...messages] as any[];
        
        // Add real-time messages that aren't in useChat (from other users)
        prevRealtime.forEach(rtMessage => {
          const existsInUseChat = messages.find(msg => msg.id === rtMessage.id);
          if (!existsInUseChat) {
            merged.push(rtMessage);
          }
        });
        
        // Sort by timestamp
        merged.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });
        
        return merged;
      });
    }
  }, [roomContext, messages]);

  // Ensure messages are cleared when chat ID changes (atomicity)
  useEffect(() => {
    // Clear messages when switching to a different chat (only for regular chats)
    if (!roomContext && currentChatId && chatId !== currentChatId && !chatId.startsWith('room_')) {
      setMessages([]);
    }
  }, [chatId, currentChatId, roomContext, setMessages]);

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);
    
    try {
      if (roomContext) {
        // For room chats, create a new chat session within the room
        const newChatSessionId = uuidv4();
        
        // Clear current messages immediately for better UX
        setMessages([]);
        setRealtimeMessages([]);
        
        // Navigate to new chat session
        const newUrl = `/chat/room/${roomContext.shareCode}?displayName=${encodeURIComponent(roomContext.displayName)}&sessionId=${roomContext.sessionId}&chatSession=${newChatSessionId}`;
        router.push(newUrl);
      } else {
        // For regular chats, create a new chat session
        // Clear current messages immediately for better UX
        setMessages([]);
        
        // Create new chat ID
        const newChatId = uuidv4();
        
        // Navigate to the new chat - this creates a fresh chat instance
        router.push(`/chat/${newChatId}`);
        
        // Refresh the sidebar chat history
        await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to create new chat');
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Sticky Chat Header with New Chat Button */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {roomContext ? (
              <>
                <h1 className="text-lg font-semibold">{roomContext.roomName}</h1>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span>Room: {roomContext.shareCode} • You: {roomContext.displayName}</span>
                  {/* Real-time connection status - only show on client to prevent hydration issues */}
                  {isClient && (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      isConnected 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        isConnected ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      {isConnected ? 'Live' : 'Connecting...'}
                    </span>
                  )}
                  
                  {/* Debug info - remove this after testing */}
                  {isClient && process.env.NODE_ENV === 'development' && (
                    <span className="text-xs text-muted-foreground">
                      RT:{realtimeMessages.length} UC:{messages.length} T:{typingUsers.length}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <h1 className="text-lg font-semibold">Chat with AI</h1>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {roomContext && (
              <>
                <span className="text-sm text-muted-foreground">
                  {roomContext.participants.length}/{roomContext.maxParticipants} participants
                </span>
                <span className="text-xs px-2 py-1 bg-secondary rounded">
                  {roomContext.tier}
                </span>
                
                {/* Room Settings Modal */}
                <RoomSettingsModal
                  roomContext={roomContext}
                  isCreator={roomContext.createdBy !== undefined} // Will be true if createdBy is set (meaning current user is creator)
                  expiresAt={roomContext.expiresAt}
                  onRoomUpdate={() => {
                    // Refresh the page to get updated room data
                    router.refresh();
                  }}
                />
              </>
            )}
            
            {/* New Chat Button - Show for all participants */}
            {(
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                disabled={isCreatingNewChat}
                className="flex items-center gap-2"
              >
                {isCreatingNewChat ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isCreatingNewChat ? 'Creating...' : 'New Chat'}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Scrollable Chat Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Use realtime messages for room chats, regular messages for individual chats */}
        {(roomContext ? realtimeMessages : messages).length === 0 ? (
          <div className="flex flex-col justify-center items-center min-h-full text-center px-4">
            <h2 className="text-2xl font-semibold text-foreground/80 pb-2">
              Chat with our AI Assistant
            </h2>

            <p className="text-muted-foreground pb-2 max-w-2xl">
              Experience the power of AI-driven conversations with our chat
              template. Ask questions on any topic and get informative responses
              instantly.
            </p>
            <h2 className="text-2xl font-semibold text-foreground/80">
              Start your conversation!
            </h2>
          </div>
        ) : (
          <div>
            <ul className="w-full mx-auto max-w-[1000px] px-0 md:px-1 lg:px-4 py-4">
              {(roomContext ? realtimeMessages : messages).map((message, index) => {
            const isUserMessage = message.role === 'user';
            const copyToClipboard = (str: string) => {
              window.navigator.clipboard.writeText(str);
            };
            const handleCopy = (content: string) => {
              copyToClipboard(content);
              setIsCopied(true);
              setTimeout(() => setIsCopied(false), 1000);
            };

            // First filter the tool invocation parts to check if we need the accordion
            const toolInvocationParts = !isUserMessage
              ? message.parts?.filter(
                  (part) => part.type === 'tool-invocation'
                ) || []
              : [];

            const hasToolInvocations = toolInvocationParts.length > 0;

            // Group parts by type for ordered rendering
            const textParts =
              message.parts?.filter((part) => part.type === 'text') || [];
            const reasoningParts =
              message.parts?.filter((part) => part.type === 'reasoning') || [];
            const sourceParts =
              message.parts?.filter((part) => part.type === 'source') || [];

            return (
              <li key={`${message.id}-${index}`} className="my-4 mx-2">
                <Card
                  className={`relative gap-2 py-2 ${
                    isUserMessage
                      ? 'bg-primary/5 dark:bg-primary/10 border-primary/20'
                      : 'bg-card dark:bg-card/90 border-border/50'
                  }`}
                >
                  <CardHeader className="pb-2 px-4">
                    <div className="flex items-center gap-3">
                      {isUserMessage ? (
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">
                          {isUserMessage ? 'You' : 'AI Assistant'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {message.createdAt
                            ? new Date(message.createdAt).toLocaleTimeString(
                                [],
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                }
                              )
                            : new Date().toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                        </p>
                      </div>
                      {!isUserMessage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopy(message.content)}
                        >
                          {isCopied ? (
                            <CheckCircle
                              size={14}
                              className="text-green-600 dark:text-green-400"
                            />
                          ) : (
                            <Copy size={14} />
                          )}
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="py-0 px-4">
                    {/* Render text parts first (main message content) */}
                    {textParts.length > 0 ? (
                      textParts.map((part, partIndex) => (
                        <MemoizedMarkdown
                          key={`text-${partIndex}`}
                          content={part.text}
                          id={`${isUserMessage ? 'user' : 'assistant'}-text-${
                            message.id
                          }-${partIndex}`}
                        />
                      ))
                    ) : (
                      // Fallback for messages that don't have parts (like room messages)
                      message.content && (
                        <MemoizedMarkdown
                          content={message.content}
                          id={`${isUserMessage ? 'user' : 'assistant'}-content-${message.id}`}
                        />
                      )
                    )}

                    {/* Then render reasoning parts (only for assistant messages) */}
                    {!isUserMessage &&
                      reasoningParts.map((part, partIndex) => (
                        <div key={`reasoning-${partIndex}`} className="mt-4">
                          <ReasoningContent
                            details={part.details}
                            messageId={message.id}
                          />
                        </div>
                      ))}

                    {/* Then render source parts (only for assistant messages) */}
                    {!isUserMessage && sourceParts.length > 0 && (
                      <div className="mt-2">
                        <SourceView
                          sources={sourceParts.map((part) => part.source)}
                        />
                      </div>
                    )}

                    {/* Display attached files in user messages */}
                    {isUserMessage &&
                      message.experimental_attachments &&
                      message.experimental_attachments.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="text-sm font-medium mb-2">
                            Attached Files:
                          </h4>
                          <div className="space-y-2">
                            {message.experimental_attachments.map(
                              (attachment, idx) => (
                                <div
                                  key={`attachment-${idx}`}
                                  className="flex items-center gap-2 p-2 bg-background rounded border"
                                >
                                  <FileIcon className="h-4 w-4 text-blue-500" />
                                  <Link
                                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex-1"
                                    href={`?file=${attachment.name}`}
                                  >
                                    {attachment.name}
                                  </Link>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* Render all tool invocations in a single accordion */}
                    {hasToolInvocations && (
                      <div className="mt-6">
                        <Accordion
                          type="single"
                          defaultValue="tool-invocation"
                          collapsible
                          className="w-full border rounded-lg"
                        >
                          <AccordionItem
                            value="tool-invocation"
                            className="border-0"
                          >
                            <AccordionTrigger className="px-4 py-3 font-medium hover:no-underline">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4" />
                                <span>AI Tools Used</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-4">
                                {toolInvocationParts.map((part) => {
                                  const toolName = part.toolInvocation.toolName;
                                  const toolId = part.toolInvocation.toolCallId;
                                  switch (toolName) {
                                    case 'searchUserDocument':
                                      return (
                                        <DocumentSearchTool
                                          key={toolId}
                                          toolInvocation={part.toolInvocation}
                                        />
                                      );
                                    case 'websiteSearchTool':
                                      return (
                                        <WebsiteSearchTool
                                          key={toolId}
                                          toolInvocation={part.toolInvocation}
                                        />
                                      );
                                    default:
                                      return null;
                                  }
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
              <ChatScrollAnchor trackVisibility status={status} />
            </ul>
            
            {/* Typing indicator for room chats */}
            {roomContext && (
              <TypingIndicator 
                typingUsers={typingUsers} 
                currentUser={roomContext.displayName}
              />
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto max-w-[720px] mx-auto w-full z-5 pb-2">
        {/*Separate message input component, to avoid re-rendering the chat messages when typing */}
        <MessageInput
          chatId={chatId}
          apiEndpoint={apiEndpoint}
          currentChat={roomContext ? realtimeMessages : messages}
          option={optimisticOption}
          currentChatId={currentChatId}
          modelType={optimisticModelType}
          selectedOption={optimisticOption}
          handleModelTypeChange={handleModelTypeChange}
          handleOptionChange={handleOptionChange}
          roomContext={roomContext}
          onTyping={roomContext && typeof broadcastTyping === 'function' ? broadcastTyping : undefined}
        />
      </div>
    </div>
  );
};

export default ChatComponent;
