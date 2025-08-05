'use client';

import React, { useState, useOptimistic, startTransition, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { useParams, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { v4 as uuidv4 } from 'uuid';
import { ChatScrollAnchor } from '../hooks/chat-scroll-anchor';
import { setModelSettings } from '../actions';
import Link from 'next/link';
import Image from 'next/image';
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
import VirtualizedMessageList from './VirtualizedMessageList';
import { MemoizedMarkdownWithSuspense } from './LazyComponents';
import DocumentSearchTool from './tools/DocumentChatTool';
import WebsiteSearchTool from './tools/WebsiteChatTool';
import MessageInput from './ChatMessageInput';
import { toast } from 'sonner';
import RoomSettingsModal from './RoomSettingsModal';
import { useRoomSocket } from '../hooks/useRoomSocket';
import TypingIndicator from './TypingIndicator';
import AILoadingMessage from './AILoadingMessage';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { useViewportHeight } from '../hooks/useViewportHeight';


// Icons from Lucide React
import { User, Copy, CheckCircle, FileIcon, Plus, Loader2 } from 'lucide-react';

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

// Enhanced message interface for room chats with reasoning support
interface EnhancedMessage extends Message {
  reasoning?: string;
  sources?: any[];
  senderName?: string;
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
  const [realtimeMessages, setRealtimeMessages] = useState<EnhancedMessage[]>(currentChat || []);

  // State for reasoning display
  const [reasoningStates, setReasoningStates] = useState<Record<string, { isOpen: boolean; hasStartedStreaming: boolean }>>({});
  const [isClient, setIsClient] = useState(false);

  // Performance monitoring
  const { startMeasurement, endMeasurement } = usePerformanceMonitor('ChatComponent');

  // Get viewport height for proper scrolling
  const viewportHeight = useViewportHeight();

  // Measure render performance - moved after messages are defined
  const measurePerformance = useCallback(() => {
    startMeasurement();
    // Will be called after messages are available
  }, [startMeasurement]);

  // Message deduplication and loading state for room chats
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(false);

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
  const chatId_debug = roomContext ? `room_${roomContext.shareCode}` : chatId;

  // Track component lifecycle (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎬 CHAT COMPONENT: Component mounted for ${chatId_debug}`, {
        roomContext: roomContext ? {
          shareCode: roomContext.shareCode,
          chatSessionId: roomContext.chatSessionId,
          displayName: roomContext.displayName
        } : null,
        currentChatLength: currentChat?.length || 0
      });
      return () => {
        console.log(`🎬 CHAT COMPONENT: Component unmounting for ${chatId_debug}`);
      };
    }
  }, [chatId_debug, roomContext, currentChat]);

  // Create a stable chat ID to prevent re-initialization
  const stableChatId = useMemo(() => {
    return roomContext ? `room_${roomContext.shareCode}_${roomContext.chatSessionId}` : chatId;
  }, [roomContext?.shareCode, roomContext?.chatSessionId, chatId]);

  // Debug: Log chat ID changes
  useEffect(() => {
    console.log('🆔 CHAT ID CHANGED:', { chatId, stableChatId, currentChatId });
  }, [chatId, stableChatId, currentChatId]);

  const { messages, status, append, setMessages, input, handleInputChange } = useChat({
    id: stableChatId,
    api: apiEndpoint, // Use real endpoint for both room and individual chats
    experimental_throttle: 50,
    initialMessages: roomContext ? [] : (currentChat || []), // Empty for room chats
    body: roomContext ? {
      // Dummy body for room chats (won't be used)
      dummy: true
    } : {
      chatId: chatId,
      option: optimisticOption
    },
    onFinish: async () => {
      if (!roomContext) {
        console.log(`✅ CHAT: onFinish called for ${stableChatId}`);
        console.log(`🔍 CHAT: Current URL: ${window.location.href}`);
        console.log(`🔍 CHAT: Current pathname: ${window.location.pathname}`);

        // If we're on the generic /chat page, update URL to the specific chat ID
        // This prevents the page reload that causes the empty state
        if (window.location.pathname === '/chat' && stableChatId) {
          const newUrl = `/chat/${stableChatId}${window.location.search}`;
          window.history.replaceState({}, '', newUrl);
          console.log(`🔄 Updated URL to: ${newUrl}`);
        }

        // Only refresh chat previews to update sidebar, don't cause page re-render
        try {
          await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
          console.log('🔄 Sidebar data refreshed successfully');
        } catch (error) {
          console.warn('Failed to refresh sidebar data:', error);
        }
      }
    },

    onError: (error) => {
      if (!roomContext) {
        console.log(`❌ CHAT: onError called for ${stableChatId}:`, error.message);
        toast.error(error.message || 'An error occurred'); // This could lead to sensitive information exposure. A general error message is safer.
      }
    }
  });

  // Debug: Log streaming behavior
  useEffect(() => {
    if (!roomContext) {
      console.log('🔄 STREAMING DEBUG:', {
        status,
        messageCount: messages.length,
        lastMessage: messages[messages.length - 1]?.content?.substring(0, 50) + '...',
        isStreaming: status === 'streaming'
      });
    }
  }, [messages, status, roomContext]);

  // Optimized loading timeout for room chats
  useEffect(() => {
    // Early exit for maximum efficiency
    if (!roomContext || !isRoomLoading) return;

    const messageCount = realtimeMessages.length;
    if (messageCount === 0) return;

    // Only check the last message when count changes
    const lastMessage = realtimeMessages[messageCount - 1];
    if (lastMessage?.role === 'assistant') {
      // Efficient timeout with cleanup
      const timeoutId = setTimeout(() => setIsRoomLoading(false), 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [roomContext, isRoomLoading, realtimeMessages.length]); // Only depend on length, not full array

  // Handle message submission from MessageInput
  const handleSubmit = useCallback(async (message: string, attachments?: File[]) => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('🚫 CHAT: Submission already in progress, ignoring duplicate');
      return;
    }

    setIsSubmitting(true);
    console.log(`🚀 CHAT: Handling submission: "${message.substring(0, 50)}"`);

    try {
      if (roomContext) {
        // For room chats: Direct API call with loading state
        console.log('🏠 Room chat: Making direct API call (no optimistic updates)');
        setIsRoomLoading(true);

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              ...realtimeMessages,
              {
                role: 'user',
                content: message,
                id: crypto.randomUUID(),
                createdAt: new Date()
              }
            ],
            displayName: roomContext.displayName,
            option: optimisticOption,
            threadId: roomContext.chatSessionId
          })
        });

        if (!response.ok) {
          throw new Error(`API call failed: ${response.status}`);
        }

        console.log('✅ Room chat: Direct API call successful');
        // Clear the input field immediately for better UX
        handleInputChange({ target: { value: '' } } as any);
        // Real-time will handle showing the messages

      } else {
        // For individual chats: Update URL immediately to prevent re-renders
        if (window.location.pathname === '/chat' && stableChatId) {
          const newUrl = `/chat/${stableChatId}${window.location.search}`;
          window.history.replaceState({}, '', newUrl);
          console.log(`🔄 Pre-emptively updated URL to: ${newUrl}`);
        }

        // For individual chats: Use optimistic updates
        if (attachments && attachments.length > 0) {
          // Handle attachments
          const fileList = new DataTransfer();
          attachments.forEach(file => fileList.items.add(file));

          await append({
            role: 'user',
            content: message,
            experimental_attachments: fileList.files
          });
        } else {
          await append({
            role: 'user',
            content: message
          });
        }
      }
    } catch (error) {
      console.error('❌ CHAT: Error in handleSubmit:', error);
      if (roomContext) {
        toast.error('Failed to send message. Please try again.');
      }
    } finally {
      if (roomContext) {
        setIsRoomLoading(false);
      }
      // Reset submission flag after a delay to prevent rapid-fire submissions
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
    }
  }, [roomContext, apiEndpoint, realtimeMessages, optimisticOption, append, isSubmitting]);

  const { mutate } = useSWRConfig();

  // Real-time functionality for room chats - memoized to prevent re-renders
  const handleNewMessage = useCallback((newMessage: EnhancedMessage) => {
    console.log('🏠 Chat received RT message:', newMessage.role, 'from', newMessage.content?.substring(0, 30));

    // Use functional updates to avoid dependency on processedMessageIds
    setProcessedMessageIds(prevProcessed => {
      // Check if we've already processed this message
      if (prevProcessed.has(newMessage.id)) {
        console.log('⚠️ Message already processed, skipping:', newMessage.id);
        return prevProcessed; // Return same reference to avoid re-render
      }

      // Mark message as processed and update UI
      setRealtimeMessages(prevMessages => {
        const exists = prevMessages.find(msg => msg.id === newMessage.id);
        if (exists) {
          console.log('⚠️ Message already exists in UI, skipping:', newMessage.id);
          return prevMessages;
        }
        console.log('✅ Adding new RT message to chat UI:', newMessage.id);

        // Initialize reasoning state for AI messages
        if (newMessage.role === 'assistant' && newMessage.reasoning) {
          setReasoningStates(prev => ({
            ...prev,
            [newMessage.id]: { isOpen: true, hasStartedStreaming: false }
          }));
        }

        return [...prevMessages, newMessage];
      });

      // Return new Set with the processed message ID
      return new Set(prevProcessed).add(newMessage.id);
    });
  }, []); // Empty dependency array - stable function

  const handleTypingUpdate = useCallback((users: string[]) => {
    console.log('👥 Typing users updated in Chat:', users);
    setTypingUsers(users);
  }, []);

  // Memoize realtime hook props to prevent unnecessary re-initializations
  const realtimeProps = useMemo(() => {
    if (!roomContext) return null;
    return {
      shareCode: roomContext.shareCode,
      displayName: roomContext.displayName,
      chatSessionId: roomContext.chatSessionId,
      onNewMessage: handleNewMessage,
      onTypingUpdate: handleTypingUpdate
    };
  }, [roomContext?.shareCode, roomContext?.displayName, roomContext?.chatSessionId, handleNewMessage, handleTypingUpdate]);

  // Initialize real-time hook with safe fallbacks
  const realtimeHook = realtimeProps ? useRoomSocket(realtimeProps) : null;

  const {
    isConnected = false,
    broadcastTyping = undefined
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

  // For room chats, ONLY use real-time messages (no optimistic updates)
  // This prevents duplicates for the sender
  useEffect(() => {
    if (roomContext) {
      // For room chats, ignore useChat messages completely
      // Only use real-time messages to ensure consistency across all users
      console.log('🏠 Room chat: Using only real-time messages, ignoring useChat optimistic updates');

      // Don't merge - real-time messages are the single source of truth
      // This ensures User A and User B see exactly the same messages
    }
  }, [roomContext, messages]);

  // Ensure messages are cleared when chat ID changes (atomicity)
  useEffect(() => {
    // Clear messages when switching to a different chat (only for regular chats)
    if (!roomContext && currentChatId && chatId !== currentChatId && !chatId.startsWith('room_')) {
      console.log(`🧹 CHAT: Clearing messages due to chat ID change: ${currentChatId} -> ${chatId}`);
      setMessages([]);
    }
  }, [chatId, currentChatId, roomContext, setMessages]);

  // Force clear messages when component mounts with a new chat ID
  useEffect(() => {
    if (!roomContext && !currentChat) {
      console.log(`🆕 CHAT: New chat detected, ensuring clean state for ${chatId}`);
      setMessages([]);
    }
  }, [chatId, roomContext, currentChat, setMessages]);

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);

    try {
      if (roomContext) {
        // For room chats, create a new chat session within the room
        const newChatSessionId = uuidv4();

        console.log('🆕 Creating new room chat session:', newChatSessionId);

        // Clear current messages immediately for better UX
        setMessages([]);
        setRealtimeMessages([]);

        // Navigate to new chat session using threadId parameter (not chatSession)
        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set('threadId', newChatSessionId);
        currentParams.delete('chatSession'); // Remove legacy parameter

        const newUrl = `/chat/room/${roomContext.shareCode}?${currentParams.toString()}`;

        // Use replace instead of push to avoid back button issues
        router.replace(newUrl);
      } else {
        // For regular chats, navigate to the main chat page which auto-generates a new ID
        // Add timestamp to force a fresh navigation
        const timestamp = Date.now();
        router.push(`/chat?t=${timestamp}`);

        // Force a hard refresh to ensure clean state
        router.refresh();

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
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            {roomContext ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h1 className="text-xl font-medium tracking-tight">{roomContext.roomName}</h1>
                </div>
                <div className="hidden sm:flex items-center text-sm text-muted-foreground/80">
                  <span>{roomContext.participants.length} online</span>
                  {/* Typing indicator in header */}
                  {typingUsers.length > 0 && (
                    <>
                      <span className="mx-2">•</span>
                      <span className="text-xs text-muted-foreground/60 animate-pulse">
                        {typingUsers.length === 1
                          ? `${typingUsers[0]} is typing...`
                          : `${typingUsers.length} people typing...`
                        }
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <h1 className="text-xl font-medium tracking-tight">Chat with AI</h1>
            )}
          </div>

          <div className="flex items-center gap-3">
            {roomContext && (
              <RoomSettingsModal
                roomContext={roomContext}
                isCreator={roomContext.createdBy !== undefined}
                expiresAt={roomContext.expiresAt}
                onRoomUpdate={() => router.refresh()}
              />
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={isCreatingNewChat}
              className="h-8 px-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              {isCreatingNewChat ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="hidden sm:inline ml-2">
                {isCreatingNewChat ? 'Creating...' : 'New Chat'}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Chat Content */}
      <div className="flex-1 overflow-hidden">
        {/* Use realtime messages for room chats, regular messages for individual chats */}
        {(roomContext ? realtimeMessages : messages).length === 0 ? (
          <div className="flex flex-col justify-center items-center min-h-full text-center px-4">
            {roomContext ? (
              <h2 className="text-xl font-medium text-muted-foreground">
                Welcome to {roomContext.roomName} — let's collaborate!
              </h2>
            ) : (
              <h2 className="text-xl font-medium text-muted-foreground">
                Ready to chat? Ask me anything!
              </h2>
            )}
          </div>
        ) : (
          <VirtualizedMessageList
            messages={roomContext ? realtimeMessages : messages}
            height={viewportHeight - 200} // Account for header and input area
            itemHeight={80}
            currentUserDisplayName={roomContext?.displayName}
            showLoading={roomContext ? isRoomLoading : (status === 'streaming' || status === 'submitted')}
            isRoomChat={!!roomContext}
          />
        )}

        {/* Keep the original rendering as fallback - remove this section later */}
        {false && (
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
                  <li key={message.id} className="my-4 mx-2">
                    <Card
                      className={`relative gap-2 py-2 ${isUserMessage
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
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                              <Image
                                src="/icons/icon-512x512.png"
                                alt="AI Assistant"
                                width={20}
                                height={20}
                                className="rounded-full"
                              />
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
                              id={`${isUserMessage ? 'user' : 'assistant'}-text-${message.id
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
                                    <Image
                                      src="/icons/icon-512x512.png"
                                      alt="AI Assistant"
                                      width={16}
                                      height={16}
                                      className="rounded-full"
                                    />
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
          onSubmit={handleSubmit}
          isLoading={roomContext ? isRoomLoading : (status === 'streaming' || status === 'submitted')}
          input={input}
          setInput={(value: string) => handleInputChange({ target: { value } } as any)}
        />
      </div>
    </div>
  );
};

export default ChatComponent;
