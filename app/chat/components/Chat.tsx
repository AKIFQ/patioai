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
  
  // NEW: Streaming state (safe - separate from existing messages)
  const [streamingMessages, setStreamingMessages] = useState<Map<string, EnhancedMessage>>(new Map());

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

  // Loading state for room chats
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
  const handleSubmit = useCallback(async (message: string, attachments?: File[], triggerAI: boolean = true) => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (roomContext) {
        if (triggerAI) {
          setIsRoomLoading(true);
        }

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
            threadId: roomContext.chatSessionId,
            triggerAI
          })
        });

        if (!response.ok) {
          throw new Error(`API call failed: ${response.status}`);
        }
        
        // Clear the input field immediately for better UX
        handleInputChange({ target: { value: '' } } as any);

      } else {
        // For individual chats: Update URL immediately to prevent re-renders
        if (window.location.pathname === '/chat' && stableChatId) {
          const newUrl = `/chat/${stableChatId}${window.location.search}`;
          window.history.replaceState({}, '', newUrl);
        }

        if (triggerAI) {
          // For individual chats with AI response: Use optimistic updates
          if (attachments && attachments.length > 0) {
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
        } else {
          // For individual chats without AI response: Just add user message
          const userMessage = {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: message,
            createdAt: new Date(),
            ...(attachments && attachments.length > 0 && {
              experimental_attachments: (() => {
                const fileList = new DataTransfer();
                attachments.forEach(file => fileList.items.add(file));
                return fileList.files;
              })()
            })
          };

          setMessages(prevMessages => [...prevMessages, userMessage]);
        }
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
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
      }, 500);
    }
  }, [roomContext, apiEndpoint, realtimeMessages, optimisticOption, append, isSubmitting, setMessages, stableChatId]);

  const { mutate } = useSWRConfig();

  // Optimized message handler with better deduplication
  const handleNewMessage = useCallback((newMessage: EnhancedMessage) => {
    setRealtimeMessages(prevMessages => {
      // Check if message already exists
      const exists = prevMessages.find(msg => msg.id === newMessage.id);
      if (exists) {
        return prevMessages; // Return same reference to prevent re-render
      }

      // Initialize reasoning state for AI messages
      if (newMessage.role === 'assistant' && newMessage.reasoning) {
        setReasoningStates(prev => ({
          ...prev,
          [newMessage.id]: { isOpen: true, hasStartedStreaming: false }
        }));
      }

      return [...prevMessages, newMessage];
    });
  }, []); // Empty dependency array - stable function

  const handleTypingUpdate = useCallback((users: string[]) => {
    setTypingUsers(users);
  }, []);

  // NEW: Streaming handlers (safe - only used if streaming is enabled)
  const handleReasoningStart = useCallback((data: any) => {
    console.log('🧠 [CLIENT] Reasoning start event received:', {
      streamId: data.streamId,
      threadId: data.threadId,
      currentThreadId: roomContext?.chatSessionId,
      matches: data.threadId === roomContext?.chatSessionId
    });

    if (!roomContext || data.threadId !== roomContext.chatSessionId) {
      console.log('🚫 [CLIENT] Ignoring reasoning start - thread mismatch');
      return;
    }
    
    console.log('🧠 [CLIENT] Processing reasoning start:', data.streamId);
    
    const streamingMessage: EnhancedMessage = {
      id: data.streamId,
      role: 'assistant',
      content: '✨ Generating response...', // Initial content for Gemini
      createdAt: new Date(data.timestamp),
      senderName: 'AI Assistant',
      // Custom properties for streaming
      streamId: data.streamId,
      phase: 'answering', // Start directly with answering for Gemini
      reasoningContent: '',
      answerContent: '',
      isStreaming: true,
      reasoning: '' // Initialize reasoning field
    } as any;

    setStreamingMessages(prev => new Map(prev.set(data.streamId, streamingMessage)));
  }, [roomContext]);

  const handleReasoningChunk = useCallback((data: any) => {
    console.log('🧠 [CLIENT] Reasoning chunk event received:', {
      streamId: data.streamId,
      chunkLength: data.chunk?.length,
      accumulatedLength: data.accumulatedReasoning?.length
    });

    if (!roomContext || data.threadId !== roomContext.chatSessionId) {
      console.log('🚫 [CLIENT] Ignoring reasoning chunk - thread mismatch');
      return;
    }

    console.log('🧠 [CLIENT] Processing reasoning chunk for:', data.streamId);
    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) return prev;

      const updated = {
        ...existing,
        reasoningContent: data.accumulatedReasoning,
        reasoning: data.accumulatedReasoning, // For compatibility with existing components
        content: data.accumulatedReasoning // IMPORTANT: Update main content field so it displays
      };

      return new Map(prev.set(data.streamId, updated));
    });
  }, [roomContext]);

  const handleReasoningComplete = useCallback((data: any) => {
    if (!roomContext || data.threadId !== roomContext.chatSessionId) return;
    
    console.log('🧠 Reasoning complete, transitioning to answer:', data.streamId);

    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) return prev;

      const updated = {
        ...existing,
        phase: 'answering',
        reasoningContent: data.finalReasoning,
        reasoning: data.finalReasoning,
        content: '' // Clear content when transitioning to answer phase
      };

      return new Map(prev.set(data.streamId, updated));
    });
  }, [roomContext]);

  const handleAnswerStart = useCallback((data: any) => {
    if (!roomContext || data.threadId !== roomContext.chatSessionId) return;
    console.log('💬 Answer started:', data.streamId);
  }, [roomContext]);

  const handleAnswerChunk = useCallback((data: any) => {
    if (!roomContext || data.threadId !== roomContext.chatSessionId) return;

    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) return prev;

      const updated = {
        ...existing,
        answerContent: data.accumulatedAnswer,
        content: data.accumulatedAnswer // IMPORTANT: Update main content field for answer
      };

      return new Map(prev.set(data.streamId, updated));
    });
  }, [roomContext]);

  const handleStreamComplete = useCallback((data: any) => {
    if (!roomContext || data.threadId !== roomContext.chatSessionId) return;
    
    console.log('✅ Stream complete:', data.streamId);

    // Mark as complete and remove after delay (regular message will replace it)
    setStreamingMessages(prev => {
      const existing = prev.get(data.streamId);
      if (!existing) return prev;

      const completed = {
        ...existing,
        phase: 'complete',
        isStreaming: false
      };

      const newMap = new Map(prev.set(data.streamId, completed));
      
      // Remove after delay to allow regular message to appear
      setTimeout(() => {
        setStreamingMessages(current => {
          const updated = new Map(current);
          updated.delete(data.streamId);
          return updated;
        });
      }, 1000);

      return newMap;
    });
  }, [roomContext]);

  const handleStreamError = useCallback((data: any) => {
    console.error('❌ Stream error:', data.streamId, data.error);
    
    // Remove streaming message on error
    setStreamingMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(data.streamId);
      return newMap;
    });
  }, []);

  // Create streaming handlers object
  const streamingHandlers = useMemo(() => ({
    onReasoningStart: handleReasoningStart,
    onReasoningChunk: handleReasoningChunk,
    onReasoningComplete: handleReasoningComplete,
    onAnswerStart: handleAnswerStart,
    onAnswerChunk: handleAnswerChunk,
    onStreamComplete: handleStreamComplete,
    onStreamError: handleStreamError
  }), [handleReasoningStart, handleReasoningChunk, handleReasoningComplete, handleAnswerStart, handleAnswerChunk, handleStreamComplete, handleStreamError]);

  // Memoize realtime hook props to prevent unnecessary re-initializations
  const realtimeProps = useMemo(() => {
    if (!roomContext) return null;
    return {
      shareCode: roomContext.shareCode,
      displayName: roomContext.displayName,
      sessionId: roomContext.sessionId, // Pass sessionId for authentication
      chatSessionId: roomContext.chatSessionId,
      onNewMessage: handleNewMessage,
      onTypingUpdate: handleTypingUpdate,
      // NEW: Add streaming handlers (safe - only used if streaming enabled)
      streamingHandlers: streamingHandlers
    };
  }, [roomContext?.shareCode, roomContext?.displayName, roomContext?.sessionId, roomContext?.chatSessionId, handleNewMessage, handleTypingUpdate, streamingHandlers]);

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
