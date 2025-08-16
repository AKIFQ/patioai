'use client';

import React, { useState, useOptimistic, startTransition, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { useParams, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { v4 as uuidv4 } from 'uuid';
import { ChatScrollAnchor } from '../hooks/chat-scroll-anchor';
import { Menu } from 'lucide-react';
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
import CrossThreadActivity from './CrossThreadActivity';
import AILoadingMessage from './AILoadingMessage';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { useViewportHeight } from '../hooks/useViewportHeight';
import { useMobileSidebar } from './chat_history/ChatHistorySidebar';
import { useReasoningStream } from '../hooks/useReasoningStream';
import { useChatSubmissionState } from '@/lib/client/atomicStateManager';
import { logger } from '@/lib/utils/logger';

// Icons from Lucide React
import { User, Copy, CheckCircle, FileIcon, Plus, Loader2, Settings } from 'lucide-react';

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
  userData?: any;
  sidebarData?: any;
}

const ChatComponent: React.FC<ChatProps> = ({
  currentChat,
  chatId,
  initialModelType,
  initialSelectedOption,
  roomContext,
  userData,
  sidebarData
}) => {
  const param = useParams();
  const router = useRouter();
  const currentChatId = param.id as string;
  const { open: openMobileSidebar, close: closeMobileSidebar, isOpen: isMobileSidebarOpen } = useMobileSidebar();
  const touchAreaRef = useRef<HTMLDivElement | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0); // 0-1 for animation progress
  const [isSwipeActive, setIsSwipeActive] = useState(false);

  const [optimisticModelType, setOptimisticModelType] = useOptimistic<
    string,
    string
  >(initialModelType, (_, newValue) => newValue);
  const [isCopied, setIsCopied] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [optimisticOption, setOptimisticOption] = useOptimistic<string, string>(
    (userData?.subscription_tier === 'free' ? 'auto' : initialSelectedOption),
    (_, newValue) => newValue
  );

  // Reasoning mode state (only for free users)
  const [reasoningMode, setReasoningMode] = useState(false);

  // Real-time state for room chats
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [crossThreadActivities, setCrossThreadActivities] = useState<Array<{
    threadId: string;
    threadName: string;
    activeUsers: string[];
    typingUsers: string[];
  }>>([]);
  
  // State for showing removal from room UI
  const [showRemovalUI, setShowRemovalUI] = useState(false);
  const [removalRoomName, setRemovalRoomName] = useState('');
  
  const [realtimeMessages, setRealtimeMessages] = useState<EnhancedMessage[]>(currentChat || []);
  const [isRoomLoading, setIsRoomLoading] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const streamingAssistantIdRef = useRef<string | null>(null);

  // Room reasoning streaming state
  const [roomReasoningState, setRoomReasoningState] = useState<{
    messageId: string | null;
    reasoning: string;
    isStreaming: boolean;
    isComplete: boolean;
  }>({
    messageId: null,
    reasoning: '',
    isStreaming: false,
    isComplete: false
  });

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
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Atomic state management to prevent race conditions
  const {
    state: submissionState,
    startSubmission,
    finishSubmission,
    isSubmitting
  } = useChatSubmissionState();

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
    return '/api/chat';
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
    // Remove client-side throttle to avoid hidden rate limiting
    experimental_throttle: undefined as any,
    initialMessages: roomContext ? [] : (currentChat || []), // Empty for room chats
    body: roomContext ? {
      // Dummy body for room chats (won't be used)
      dummy: true
    } : {
      chatId: chatId,
      option: optimisticOption,
      webSearch: webSearchEnabled,
      reasoningMode: reasoningMode
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

  // Use reasoning stream hook for individual chats (after useChat hook)
  const reasoningStream = useReasoningStream(messages, status);

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

  // Handle message submission from MessageInput with atomic state management
  const handleSubmit = useCallback(async (message: string, attachments?: File[], triggerAI: boolean = true, reasoningModeEnabled: boolean = false) => {
    const messageId = crypto.randomUUID();
    logger.chatSubmission(messageId, {
      roomContext: roomContext?.shareCode,
      messagePreview: message.substring(0, 50),
      triggerAI,
      reasoningMode: reasoningModeEnabled
    });

    try {
      // Atomic submission start - prevents race conditions
      const submissionInfo = await startSubmission(messageId);
      if (!submissionInfo) {
        logger.warn('Chat submission blocked by atomic state manager', { messageId });
        return;
      }

      logger.debug('Chat submission started atomically', { messageId });
      if (roomContext) {
        if (triggerAI) {
          // For room chats with AI response: Direct API call with loading state
          console.log('🏠 Room chat: Persisting user message, streaming via Socket.IO');
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
                  id: messageId, // Use consistent message ID
                  createdAt: new Date()
                }
              ],
              displayName: roomContext.displayName,
              option: optimisticOption,
              threadId: roomContext.chatSessionId,
              triggerAI: false
            })
          });

          if (!response.ok) {
            // Check if this is a "removed from room" error
            if (response.status === 403) {
              try {
                const errorData = await response.json();
                if (errorData.error === 'REMOVED_FROM_ROOM') {
                  // Show removal UI modal instead of redirecting
                  console.log('User was removed from room, showing removal UI');
                  setRemovalRoomName(errorData.roomName || roomContext.roomName);
                  setShowRemovalUI(true);
                  return;
                }
              } catch (parseError) {
                console.warn('Could not parse error response:', parseError);
              }
            }
            throw new Error(`API call failed: ${response.status}`);
          }

          // CRITICAL: Trigger sidebar refresh for new thread visibility
          // This ensures all users see the new thread immediately
          if (realtimeMessages.length === 0) {
            console.log('🔄 First message in thread - triggering sidebar refresh');
            // Dispatch custom event to trigger sidebar refresh
            window.dispatchEvent(new CustomEvent('forceThreadRefresh', { 
              detail: { 
                threadId: roomContext.chatSessionId,
                shareCode: roomContext.shareCode,
                roomName: roomContext.roomName,
                senderName: roomContext.displayName,
                firstMessage: message
              } 
            }));
          }

          // Then invoke streaming via socket (only once per submission)
          if (invokeAIRef.current && isConnected && submissionInfo) {
            // Prepare chat history for context (last 10 messages)
            const chatHistory = realtimeMessages
              .slice(-10) // Last 10 messages for context
              .map(msg => ({
                role: msg.role,
                content: msg.senderName && msg.role === 'user'
                  ? `${msg.senderName}: ${msg.content}`
                  : msg.content
              }));

            console.log(`🔍 Chat invokeAI called with messageId:${messageId}, reasoningMode:`, reasoningModeEnabled);
            invokeAIRef.current({
              shareCode: roomContext.shareCode,
              threadId: roomContext.chatSessionId!,
              prompt: `${roomContext.displayName}: ${message}`,
              roomName: roomContext.roomName,
              participants: roomContext.participants.map(p => p.displayName),
              modelId: optimisticOption,
              chatHistory,
              reasoningMode: reasoningModeEnabled
            });
          }
          console.log('✅ Room chat: User message persisted, AI stream invoked');
        } else {
          // For room chats without AI response: Use same endpoint but with triggerAI: false
          console.log('📤 Room chat: Sending user message only (no AI)');

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
                  id: messageId, // Use consistent message ID
                  createdAt: new Date()
                }
              ],
              displayName: roomContext.displayName,
              option: optimisticOption,
              threadId: roomContext.chatSessionId,
              triggerAI: false
            })
          });

          if (!response.ok) {
            // Check if this is a "removed from room" error
            if (response.status === 403) {
              try {
                const errorData = await response.json();
                if (errorData.error === 'REMOVED_FROM_ROOM') {
                  // Show removal UI modal instead of redirecting
                  console.log('User was removed from room, showing removal UI');
                  setRemovalRoomName(errorData.roomName || roomContext.roomName);
                  setShowRemovalUI(true);
                  return;
                }
              } catch (parseError) {
                console.warn('Could not parse error response:', parseError);
              }
            }
            throw new Error(`API call failed: ${response.status}`);
          }

          // CRITICAL: Trigger sidebar refresh for new thread visibility
          if (realtimeMessages.length === 0) {
            console.log('🔄 First message in thread (no AI) - triggering sidebar refresh');
            window.dispatchEvent(new CustomEvent('forceThreadRefresh', { 
              detail: { 
                threadId: roomContext.chatSessionId,
                shareCode: roomContext.shareCode,
                roomName: roomContext.roomName,
                senderName: roomContext.displayName,
                firstMessage: message
              } 
            }));
          }

          console.log('✅ Room chat: User message sent (no AI)');
        }

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

        if (triggerAI) {
          // For individual chats with AI response: Use optimistic updates
          if (attachments && attachments.length > 0) {
            // Handle attachments
            const fileList = new DataTransfer();
            attachments.forEach(file => fileList.items.add(file));

            await append({
              role: 'user',
              content: message,
              experimental_attachments: Array.from(fileList.files as any) as any
            });
          } else {
            await append({
              role: 'user',
              content: message
            });
          }
        } else {
          // For individual chats without AI response: Just add user message
          const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: message,
            createdAt: new Date(),
            ...(attachments && attachments.length > 0 && {
              experimental_attachments: attachments as any
            })
          } as any;

          setMessages(prevMessages => [...prevMessages, userMessage]);
          console.log('📤 Added user message without AI response');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorInstance = error instanceof Error ? error : new Error(errorMessage);

      logger.chatError(messageId, errorInstance, {
        roomContext: roomContext?.shareCode,
        messagePreview: message.substring(0, 50)
      });

      // Use atomic state manager to handle error
      finishSubmission(messageId, errorMessage);

      if (roomContext) {
        toast.error('Failed to send message. Please try again.');
      }
    } finally {
      if (roomContext) {
        setIsRoomLoading(false);
      }

      // Ensure submission is marked as finished (success case)
      if (!submissionState.errors.length) {
        finishSubmission(messageId);
      }
    }
  }, [roomContext, apiEndpoint, realtimeMessages, optimisticOption, append, setMessages, stableChatId, startSubmission, finishSubmission, submissionState.errors.length]);

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
    if (process.env.NODE_ENV === 'development') console.debug('👥 Typing users:', users);
    setTypingUsers(users);
  }, []);

  const handleCrossThreadActivity = useCallback((activities: Array<{
    threadId: string;
    threadName: string;
    activeUsers: string[];
    typingUsers: string[];
  }>) => {
    console.log('🔄 Cross-thread activity received:', activities);
    console.log('🔄 Current thread:', roomContext?.chatSessionId);
    setCrossThreadActivities(activities);
  }, [roomContext?.chatSessionId]);

  // Streaming UI glue: add a temporary assistant message and append chunks
  const handleStreamStart = useCallback((threadId: string) => {
    if (!roomContext) return;
    // Accept first stream for this session even if threadId differs, when no temp assistant exists yet
    if (roomContext.chatSessionId && threadId !== roomContext.chatSessionId && streamingAssistantIdRef.current) {
      return;
    }
    const tempId = `ai-temp-${Date.now()}`;
    streamingAssistantIdRef.current = tempId;
    setStreamingAssistantId(tempId);
    setRealtimeMessages(prev => ([
      ...prev,
      {
        id: tempId,
        role: 'assistant',
        content: '🤔 AI is thinking...', // Show thinking message instead of empty
        createdAt: new Date()
      } as EnhancedMessage
    ]));
  }, [roomContext]);

  const handleStreamChunk = useCallback((threadId: string, chunk: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;
    const currentId = streamingAssistantIdRef.current;
    if (!currentId) return;

    setRealtimeMessages(prev => prev.map(m => {
      if (m.id === currentId) {
        // If this is the first chunk, replace the thinking message
        const isFirstChunk = m.content === '🤔 AI is thinking...';
        return {
          ...m,
          content: isFirstChunk ? chunk : `${m.content}${chunk}`
        };
      }
      return m;
    }));
  }, [roomContext]);

  const handleStreamEnd = useCallback((threadId: string, text: string, reasoning?: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;
    const currentId = streamingAssistantIdRef.current;
    if (!currentId) return;

    // CRITICAL FIX: For room chats, don't create a temporary permanent message
    // The database will send the real message via room-message-created event
    // Just remove the streaming message and let the database message take over
    setRealtimeMessages(prev => prev.filter(m => m.id !== currentId));

    // Clear reasoning state - the database message will have the final reasoning
    setRoomReasoningState(prev => ({
      ...prev,
      isStreaming: false,
      isComplete: true
    }));

    // Clear streaming state
    streamingAssistantIdRef.current = null;
    setStreamingAssistantId(null);
  }, [roomContext]);

  // New reasoning handlers for room chats
  const handleReasoningStart = useCallback((threadId: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;
    const currentId = streamingAssistantIdRef.current;
    if (!currentId) return;

    console.log('🧠 Reasoning started for room chat:', threadId);
    setRoomReasoningState({
      messageId: currentId,
      reasoning: '',
      isStreaming: true,
      isComplete: false
    });
  }, [roomContext]);

  const handleReasoningChunk = useCallback((threadId: string, reasoning: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;
    const currentId = streamingAssistantIdRef.current;
    if (!currentId) return;

    if (process.env.NODE_ENV === 'development') console.debug('🧠 Reasoning chunk received:', { threadId, preview: reasoning.substring(0, 60) });
    setRoomReasoningState(prev => ({
      ...prev,
      reasoning
    }));
  }, [roomContext]);

  const handleReasoningEnd = useCallback((threadId: string, reasoning: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;

    console.log('🧠 Reasoning ended for room chat:', threadId);
    setRoomReasoningState(prev => ({
      ...prev,
      reasoning,
      isStreaming: false,
      isComplete: true
    }));
  }, [roomContext]);

  const handleContentStart = useCallback((threadId: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;

    if (process.env.NODE_ENV === 'development') console.debug('📝 Content started for room chat:', threadId);
    // Reasoning UI should auto-minimize when content starts
  }, [roomContext]);

  // Memoize realtime hook props to prevent unnecessary re-initializations
  const realtimeProps = useMemo(() => {
    if (!roomContext) return null;
    return {
      shareCode: roomContext.shareCode,
      displayName: roomContext.displayName,
      chatSessionId: roomContext.chatSessionId,
      onNewMessage: handleNewMessage,
      onTypingUpdate: handleTypingUpdate,
      onStreamStart: handleStreamStart,
      onStreamChunk: handleStreamChunk,
      onStreamEnd: handleStreamEnd,
      onReasoningStart: handleReasoningStart,
      onReasoningChunk: handleReasoningChunk,
      onReasoningEnd: handleReasoningEnd,
      onContentStart: handleContentStart,
      onCrossThreadActivity: handleCrossThreadActivity
    };
  }, [
    roomContext?.shareCode,
    roomContext?.displayName,
    roomContext?.chatSessionId,
    handleNewMessage,
    handleTypingUpdate,
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
    handleReasoningStart,
    handleReasoningChunk,
    handleReasoningEnd,
    handleContentStart,
    handleCrossThreadActivity
  ]);

  // Initialize real-time hook with safe fallbacks
  const realtimeHook = realtimeProps ? useRoomSocket(realtimeProps) : null;

  const {
    isConnected = false,
    broadcastTyping = undefined,
    invokeAI,
    isAIStreaming = false
  } = (realtimeHook as any) || {};

  // Avoid temporal-dead-zone issues by referencing invokeAI via a ref
  const invokeAIRef = useRef<any>(null);
  useEffect(() => {
    invokeAIRef.current = invokeAI;
  }, [invokeAI]);

  // Listen for dev-only modelUsed announcements via socket
  useEffect(() => {
    const w = (window as any);
    const socket = (w && w.__patio_socket) || null;
    if (!socket) return;
    const onStart = (payload: any) => {
      if (process.env.NODE_ENV === 'development') console.info('🔎 ai-stream-start', payload);
    };
    const onContentStart = (payload: any) => {
      if (process.env.NODE_ENV === 'development') console.info('🔎 model used:', payload?.modelUsed);
    };
    const onEnd = (payload: any) => {
      if (process.env.NODE_ENV === 'development') console.info('🔎 ai-stream-end', { model: payload?.modelUsed, usage: payload?.usage });
    };
    socket.on?.('ai-stream-start', onStart);
    socket.on?.('ai-content-start', onContentStart);
    socket.on?.('ai-stream-end', onEnd);
    return () => {
      socket.off?.('ai-stream-start', onStart);
      socket.off?.('ai-content-start', onContentStart);
      socket.off?.('ai-stream-end', onEnd);
    };
  }, []);

  // Initialize realtime messages with current chat messages
  useEffect(() => {
    if (roomContext) {
      if (currentChat && currentChat.length > 0) {
        // Initialize with current chat messages
        if (process.env.NODE_ENV === 'development') console.debug('Init realtime messages:', currentChat.length);
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
      if (process.env.NODE_ENV === 'development') console.debug('🏠 Room chat using only realtime messages');

      // Don't merge - real-time messages are the single source of truth
      // This ensures User A and User B see exactly the same messages
    }
  }, [roomContext, messages]);

  // Ensure messages are cleared when chat ID changes (atomicity)
  useEffect(() => {
    // Clear messages when switching to a different chat (only for regular chats)
    if (!roomContext && currentChatId && chatId !== currentChatId && !chatId.startsWith('room_')) {
      if (process.env.NODE_ENV === 'development') console.debug('🧹 Clear messages on chat change');
      setMessages([]);
    }
  }, [chatId, currentChatId, roomContext, setMessages]);

  // Force clear messages when component mounts with a new chat ID
  useEffect(() => {
    if (!roomContext && !currentChat) {
      if (process.env.NODE_ENV === 'development') console.debug('�� New chat detected, clear state');
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

  // Modern smooth finger-tracking swipe gestures
  useEffect(() => {
    const el = touchAreaRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isTracking = false;
    let isHorizontal = false;
    let swipeDirection: 'open' | 'close' | null = null;

    const SWIPE_THRESHOLD = 60; // Minimum distance to trigger action
    const EDGE_ZONE = 20; // Touch detection zone from screen edges
    const MAX_SWIPE_DISTANCE = 280; // Width of sidebar for progress calculation

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = startX;

      // Detect swipe zones
      const isLeftEdge = startX <= EDGE_ZONE;
      const isRightEdge = startX >= window.innerWidth - EDGE_ZONE;
      const canOpenFromLeft = isLeftEdge && !isMobileSidebarOpen;
      const canCloseFromRight = isRightEdge && isMobileSidebarOpen;
      const canCloseFromAnywhere = isMobileSidebarOpen && startX <= MAX_SWIPE_DISTANCE;

      if (canOpenFromLeft || canCloseFromRight || canCloseFromAnywhere) {
        isTracking = true;
        setIsSwipeActive(true);

        if (canOpenFromLeft) swipeDirection = 'open';
        else swipeDirection = 'close';
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isTracking) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      currentX = touch.clientX;

      // Determine if this is a horizontal swipe
      if (!isHorizontal && (Math.abs(deltaX) > 10 || deltaY > 10)) {
        isHorizontal = Math.abs(deltaX) > deltaY;
        if (!isHorizontal) {
          // Vertical swipe detected, cancel tracking
          isTracking = false;
          setIsSwipeActive(false);
          setSwipeProgress(0);
          return;
        }
      }

      if (!isHorizontal) return;

      // Prevent page scrolling during horizontal swipe
      e.preventDefault();

      let progress = 0;

      if (swipeDirection === 'open' && deltaX > 0) {
        // Opening: progress from 0 to 1 as we swipe right
        progress = Math.min(deltaX / MAX_SWIPE_DISTANCE, 1);
      } else if (swipeDirection === 'close' && deltaX < 0) {
        // Closing: progress from 1 to 0 as we swipe left
        if (startX <= MAX_SWIPE_DISTANCE) {
          // Started inside sidebar
          progress = Math.max((startX + deltaX) / MAX_SWIPE_DISTANCE, 0);
        } else {
          // Started from right edge
          progress = Math.max(1 + (deltaX / MAX_SWIPE_DISTANCE), 0);
        }
      }

      setSwipeProgress(progress);
    };

    const onTouchEnd = () => {
      if (!isTracking) return;

      const deltaX = currentX - startX;
      let shouldTrigger = false;

      if (swipeDirection === 'open' && deltaX > SWIPE_THRESHOLD) {
        shouldTrigger = true;
        openMobileSidebar();
      } else if (swipeDirection === 'close' && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        shouldTrigger = true;
        closeMobileSidebar();
      }

      // Smooth animation to final state
      if (shouldTrigger) {
        setSwipeProgress(swipeDirection === 'open' ? 1 : 0);
      } else {
        // Snap back to original state
        setSwipeProgress(isMobileSidebarOpen ? 1 : 0);
      }

      // Reset state
      setTimeout(() => {
        setIsSwipeActive(false);
        setSwipeProgress(0);
      }, 300); // Match transition duration

      isTracking = false;
      isHorizontal = false;
      swipeDirection = null;
    };

    // Add listeners with proper options
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false }); // Not passive to prevent scroll
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart as any);
      el.removeEventListener('touchmove', onTouchMove as any);
      el.removeEventListener('touchend', onTouchEnd as any);
    };
  }, [openMobileSidebar, closeMobileSidebar, isMobileSidebarOpen]);

  return (
    <div ref={touchAreaRef} className="flex h-full w-full flex-col relative">
      {/* Swipe overlay indicator (only during active swipe) */}
      {isSwipeActive && (
        <div
          className="fixed inset-0 z-[100] pointer-events-none"
          style={{
            background: `linear-gradient(to right, rgba(0,0,0,${swipeProgress * 0.3}) 0%, transparent 50%)`
          }}
        />
      )}

      {/* Swipe progress indicator */}
      {isSwipeActive && swipeProgress > 0 && (
        <div
          className="fixed left-0 top-0 bottom-0 z-[99] bg-background/10 backdrop-blur-sm pointer-events-none transition-all duration-100"
          style={{
            width: `${swipeProgress * 280}px`,
            transform: `translateX(${swipeProgress < 1 ? -20 + (swipeProgress * 20) : 0}px)`,
            opacity: swipeProgress
          }}
        />
      )}

      {/* Mobile Header with Hamburger Menu */}
      <div className="sticky top-0 z-20 bg-background border-b border-border h-12 shadow-sm w-full md:hidden">
        <div className="flex items-center justify-between w-full h-full px-4">
          {/* Left side - Hamburger Menu + Logo + Room Name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Hamburger Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={openMobileSidebar}
              className="h-8 w-8 text-foreground hover:bg-transparent transition-colors bg-transparent border-0 shadow-none flex-shrink-0"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            {/* PatioAI Logo */}
            <div className="flex-shrink-0">
              <Image
                src="/icons/icon-512x512.png"
                alt="PatioAI"
                width={20}
                height={20}
                className="rounded-sm"
              />
            </div>
            
            {/* Room Name */}
            <h1 className="text-base font-medium tracking-tight truncate">
              {roomContext ? roomContext.roomName : 'Chat with AI'}
            </h1>
          </div>

          {/* Right side - Activity Indicators */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile cross-thread activity indicators */}
            {roomContext && crossThreadActivities.some(activity => 
              activity.threadId !== (roomContext.chatSessionId || '') && 
              (activity.activeUsers.length > 0 || activity.typingUsers.length > 0)
            ) && (
              <CrossThreadActivity
                currentThreadId={roomContext.chatSessionId || ''}
                activities={crossThreadActivities}
                currentUser={roomContext.displayName}
              />
            )}
          </div>

          {/* Right side - New Chat Button + compact settings (mobile only) */}
          <div className="flex items-center gap-2">
            {roomContext && (
              <RoomSettingsModal
                roomContext={roomContext}
                isCreator={userData?.id === roomContext.createdBy}
                expiresAt={roomContext.expiresAt}
                onRoomUpdate={() => router.refresh()}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={isCreatingNewChat}
              className="h-8 px-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              {isCreatingNewChat ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop Chat Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 flex-shrink-0 hidden md:block">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            {roomContext ? (
              <>
                {/* Room name on the left */}
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  <h1 className="text-base sm:text-lg md:text-xl font-medium tracking-tight truncate overflow-hidden">{roomContext.roomName}</h1>
                </div>
                
                {/* Indicators on the right */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Participant count - styled indicator */}
                  <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-green-50/80 dark:bg-green-950/30 rounded-full border border-green-200/50 dark:border-green-800/30">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">
                      {roomContext.participants.length} online
                    </span>
                  </div>
                  
                  {/* Cross-thread activity indicator */}
                  {crossThreadActivities.some(activity =>
                    activity.threadId !== (roomContext.chatSessionId || '') &&
                    (activity.activeUsers.length > 0 || activity.typingUsers.length > 0)
                  ) && (
                    <CrossThreadActivity
                      currentThreadId={roomContext.chatSessionId || ''}
                      activities={crossThreadActivities}
                      currentUser={roomContext.displayName}
                    />
                  )}
                  
                  {/* Mobile cross-thread activity */}
                  <div className="sm:hidden">
                    <CrossThreadActivity
                      currentThreadId={roomContext.chatSessionId || ''}
                      activities={crossThreadActivities}
                      currentUser={roomContext.displayName}
                    />
                  </div>
                </div>
              </>
            ) : (
              <h1 className="text-base sm:text-lg md:text-xl font-medium tracking-tight truncate overflow-hidden">Chat with AI</h1>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0 ml-1 sm:ml-2">
            {roomContext && (
              <RoomSettingsModal
                roomContext={roomContext}
                isCreator={userData?.id === roomContext.createdBy}
                expiresAt={roomContext.expiresAt}
                onRoomUpdate={() => router.refresh()}
              />
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={isCreatingNewChat}
              className="h-7 sm:h-8 px-1.5 sm:px-2 md:px-3 text-xs sm:text-sm font-medium hover:bg-muted/50 transition-colors flex-shrink-0"
            >
              {isCreatingNewChat ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              <span className="hidden sm:inline ml-1 sm:ml-2">
                {isCreatingNewChat ? 'Creating...' : 'New Chat'}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Chat Content */}
      <div className="flex-1 w-full min-w-0 flex flex-col overflow-hidden">
        {/* Use realtime messages for room chats, regular messages for individual chats */}
        {(roomContext ? realtimeMessages : messages).length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center px-2 sm:px-4">
            {roomContext ? (
              <h2 className="text-base sm:text-lg md:text-xl font-medium text-muted-foreground">
                Welcome to {roomContext.roomName} — let's collaborate!
              </h2>
            ) : (
              <h2 className="text-base sm:text-lg md:text-xl font-medium text-muted-foreground">
                Ready to chat? Ask me anything!
              </h2>
            )}
          </div>
        ) : (
          <div className="flex-1 w-full min-w-0 flex flex-col overflow-hidden">
            <VirtualizedMessageList
              messages={roomContext ? realtimeMessages : messages}
              height={0} // Will be calculated by the flexible container using CSS
              itemHeight={88}
              currentUserDisplayName={roomContext?.displayName}
              showLoading={roomContext ? isRoomLoading : (status === 'streaming' || status === 'submitted')}
              isRoomChat={!!roomContext}
              streamingMessageId={(roomContext ? roomReasoningState.messageId : reasoningStream.streamingMessageId) || undefined}
              streamingReasoning={roomContext ? roomReasoningState.reasoning : reasoningStream.streamingReasoning}
              isReasoningStreaming={roomContext ? roomReasoningState.isStreaming : status === 'streaming'}
              isReasoningComplete={roomContext ? roomReasoningState.isComplete : reasoningStream.isReasoningComplete}
            />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 w-full z-5 pb-1 sm:pb-2 px-1 sm:px-2 md:px-4 bg-transparent">
        {/* Typing indicator above message input */}
        {roomContext && (
          <TypingIndicator
            typingUsers={typingUsers}
            currentUser={roomContext.displayName}
          />
        )}
        {/*Separate message input component, to avoid re-rendering the chat messages when typing */}
        <MessageInput
          chatId={chatId}
          currentChatId={currentChatId}
          selectedOption={optimisticOption}
          handleOptionChange={handleOptionChange}
          roomContext={roomContext}
          onTyping={roomContext && typeof broadcastTyping === 'function' ? broadcastTyping : undefined}
          onSubmit={handleSubmit}
          isLoading={roomContext ? isRoomLoading : (status === 'streaming' || status === 'submitted')}
          input={input}
          setInput={(value: string) => handleInputChange({ target: { value } } as any)}
          webSearchEnabled={webSearchEnabled}
          setWebSearchEnabled={setWebSearchEnabled}
          reasoningMode={reasoningMode}
          setReasoningMode={setReasoningMode}
          userTier={(userData as any)?.subscription_tier || 'free'}
          onUpgrade={() => {
            // Placeholder: surface your checkout/upgrade flow here
            console.log('Upgrade clicked');
          }}
        />
      </div>

      {/* No separate MobileSidebar component. We reuse the same sidebar and open it via context. */}
    </div>
  );
};

export default ChatComponent;
