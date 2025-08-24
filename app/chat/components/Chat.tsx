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
import RoomRateLimitHandler from './RoomRateLimitHandler';
import CrossThreadActivity from './CrossThreadActivity';
import AILoadingMessage from './AILoadingMessage';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { useViewportHeight } from '../hooks/useViewportHeight';
import { useSidebar } from '@/components/ui/sidebar';
import { useReasoningStream } from '../hooks/useReasoningStream';
import { useChatSubmissionState } from '@/lib/client/atomicStateManager';
import { logger } from '@/lib/utils/logger';
import { useChatPagination } from '../hooks/useChatPagination';

// Icons from Lucide React
import { User, Copy, CheckCircle, FileIcon, Plus, Loader2, Settings } from 'lucide-react';

interface RoomContext {
  shareCode: string;
  roomName: string;
  displayName: string;
  sessionId: string;
  participants: { displayName: string; joinedAt: string; sessionId: string; userId?: string }[];
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
  const { toggleSidebar, isMobile, openMobile, setOpenMobile } = useSidebar();
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
  const [crossThreadActivities, setCrossThreadActivities] = useState<{
    threadId: string;
    threadName: string;
    activeUsers: string[];
    typingUsers: string[];
  }[]>([]);

  // State for showing removal from room UI
  const [showRemovalUI, setShowRemovalUI] = useState(false);
  const [removalRoomName, setRemovalRoomName] = useState('');

  // Use pagination hook for room chats, fallback to regular state for non-room chats
  const roomPagination = useChatPagination({
    shareCode: roomContext?.shareCode,
    chatSessionId: roomContext?.chatSessionId,
    isRoomChat: !!roomContext,
    initialMessages: currentChat || [],
    pageSize: 50
  });

  const [realtimeMessages, setRealtimeMessages] = useState<EnhancedMessage[]>(currentChat || []);
  const [isRoomLoading, setIsRoomLoading] = useState(false);

  // Sync realtimeMessages with paginated messages for room chats
  useEffect(() => {
    if (roomContext && roomPagination.messages.length > 0) {
      setRealtimeMessages(roomPagination.messages);
    }
  }, [roomContext, roomPagination.messages]);

  // Use realtimeMessages for both room and non-room chats (pagination updates realtimeMessages)
  const displayMessages = realtimeMessages;
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
    if (isClient && roomContext?.chatSessionId) {
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
  // Component lifecycle logging removed for production

  // Create a stable chat ID to prevent re-initialization
  const stableChatId = useMemo(() => {
return roomContext ? `room_${roomContext.shareCode}_${roomContext.chatSessionId}` : chatId;
  }, [roomContext?.shareCode, roomContext?.chatSessionId, chatId]);

  // Chat ID change logging removed for production

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
        // Chat finished, updating URL if needed

        // If we're on the generic /chat page, update URL to the specific chat ID
        // This prevents the page reload that causes the empty state
        if (window.location.pathname === '/chat' && stableChatId) {
const newUrl = `/chat/${stableChatId}${window.location.search}`;
          window.history.replaceState({}, '', newUrl);
          // URL updated
        }

        // Only refresh chat previews to update sidebar, don't cause page re-render
        try {
          await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
          // Sidebar refreshed
        } catch (error) {
          // Silent fail for sidebar refresh
        }
      }
    },

    onError: (error) => {
      if (!roomContext) {
        // Error logged for debugging
        toast.error(error.message || 'An error occurred'); // This could lead to sensitive information exposure. A general error message is safer.
      }
    }
  });

  // Use reasoning stream hook for individual chats (after useChat hook)
  const reasoningStream = useReasoningStream(messages, status);

  // Streaming debug logging removed for production

  // Optimized loading timeout for room chats
  useEffect(() => {
    // Early exit for maximum efficiency
    if (!roomContext || !isRoomLoading) return;

    const messageCount = displayMessages.length;
    if (messageCount === 0) return;

    // Only check the last message when count changes
    const lastMessage = displayMessages[messageCount - 1];
    if (lastMessage?.role === 'assistant') {
      // Efficient timeout with cleanup
      const timeoutId = setTimeout(() => setIsRoomLoading(false), 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [roomContext, isRoomLoading, displayMessages.length]); // Only depend on length, not full array

  // Handle message submission from MessageInput with atomic state management
  const handleSubmit = useCallback(async (message: string, attachments?: File[], triggerAI = true, reasoningModeEnabled = false) => {
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
          // Room chat: persisting message and streaming via Socket.IO
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
            // Check for room rate limiting errors first
            const rateLimitHandled = await handleRoomRateLimitError(response.clone());
            if (rateLimitHandled) {
              return; // Error was handled with toast notification
            }
            
            // Check if this is a "removed from room" error
            if (response.status === 403) {
              try {
                const errorData = await response.json();
                if (errorData.error === 'REMOVED_FROM_ROOM') {
                  // Show removal UI modal instead of redirecting
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
            // Debug logging removed
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

            // Debug logging removed
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
          // Debug logging removed
        } else {
          // For room chats without AI response: Use same endpoint but with triggerAI: false
          // Debug logging removed

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
            // Check for room rate limiting errors first
            const rateLimitHandled = await handleRoomRateLimitError(response.clone());
            if (rateLimitHandled) {
              return; // Error was handled with toast notification
            }
            
            // Check if this is a "removed from room" error
            if (response.status === 403) {
              try {
                const errorData = await response.json();
                if (errorData.error === 'REMOVED_FROM_ROOM') {
                  // Show removal UI modal instead of redirecting
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
            // Debug logging removed
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

          // Debug logging removed
        }

        // Clear the input field immediately for better UX
        handleInputChange({ target: { value: '' } } as any);
        // Real-time will handle showing the messages

      } else {
        // For individual chats: Update URL immediately to prevent re-renders
        if (window.location.pathname === '/chat' && stableChatId) {
const newUrl = `/chat/${stableChatId}${window.location.search}`;
          window.history.replaceState({}, '', newUrl);
          // Debug logging removed
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
          // Debug logging removed
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorInstance = error instanceof Error ? error : new Error(errorMessage);

      // Log the error with detailed context
      if (typeof logger?.chatError === 'function') {
        logger.chatError(messageId, errorInstance, {
          roomContext: roomContext?.shareCode || 'no-room',
          messagePreview: message && typeof message === 'string' ? message.substring(0, 50) : 'No message content',
          errorType: error.constructor.name,
          errorStack: error instanceof Error ? error.stack : undefined
        });
      } else {
        // Fallback logging if logger.chatError is not available
        console.error(`Chat error [${messageId}]:`, errorInstance, {
          roomContext: roomContext?.shareCode || 'no-room',
          messagePreview: message && typeof message === 'string' ? message.substring(0, 50) : 'No message content',
          errorType: error.constructor.name
        });
      }

      try {
        // Check for room rate limiting errors
        if (error instanceof Error && error.message.includes('API call failed: 429')) {
          // This is a rate limit error - the response should have been handled above
          // Just finish the submission without additional error toast
          await finishSubmission(messageId, 'Rate limit reached');
          return;
        }
        
        // Use atomic state manager to handle error
        await finishSubmission(messageId, errorMessage);
      } catch (finishError) {
        // If finishSubmission fails, log it but don't crash
        console.warn('Error calling finishSubmission:', finishError);
      }

      if (roomContext) {
        // Check for specific rate limiting errors and provide professional messages
        if (error instanceof Error && error.message.includes('Please wait before sending another message')) {
          toast.error('Please slow down - wait a moment before sending another message');
        } else if (error instanceof Error && error.message.includes('Submission already in progress')) {
          toast.error('Message is already being sent - please wait');
        } else {
          toast.error('Failed to send message. Please try again.');
        }
      }
    } finally {
      if (roomContext) {
        setIsRoomLoading(false);
      }

      // Only call finishSubmission if it hasn't been called in the catch block
      // This prevents double-calling and ensures proper error state
      try {
        const hasError = submissionState?.errors?.some(err => err && err.includes(messageId)) || false;
        if (!hasError) {
          await finishSubmission(messageId);
        }
      } catch (finallyError) {
        // If there's an error in the finally block, log it but don't crash
        console.warn('Error in finally block:', finallyError);
      }
    }
  }, [roomContext, apiEndpoint, realtimeMessages, optimisticOption, append, setMessages, stableChatId, startSubmission, finishSubmission, submissionState.errors.length]);

  const { mutate } = useSWRConfig();

  // Real-time functionality for room chats - memoized to prevent re-renders
  const handleNewMessage = useCallback((newMessage: EnhancedMessage) => {
    // Debug logging removed

    // Use functional updates to avoid dependency on processedMessageIds
    setProcessedMessageIds(prevProcessed => {
      // Check if we've already processed this message
      if (prevProcessed.has(newMessage.id)) {
        // Debug logging removed
        return prevProcessed; // Return same reference to avoid re-render
      }

      // Mark message as processed and update UI
      setRealtimeMessages(prevMessages => {
        const exists = prevMessages.find(msg => msg.id === newMessage.id);
        if (exists) {
          // Debug logging removed
          return prevMessages;
        }
        // Debug logging removed

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
    // Debug logging removed
    setTypingUsers(users);
  }, []);

  const handleCrossThreadActivity = useCallback((activities: {
    threadId: string;
    threadName: string;
    activeUsers: string[];
    typingUsers: string[];
  }[]) => {
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

    // Debug logging removed
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

    // Debug logging removed
    setRoomReasoningState(prev => ({
      ...prev,
      reasoning
    }));
  }, [roomContext]);

  const handleReasoningEnd = useCallback((threadId: string, reasoning: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;

    // Debug logging removed
    setRoomReasoningState(prev => ({
      ...prev,
      reasoning,
      isStreaming: false,
      isComplete: true
    }));
  }, [roomContext]);

  const handleContentStart = useCallback((threadId: string) => {
    if (!roomContext || threadId !== roomContext.chatSessionId) return;

    // Debug logging removed
    // Reasoning UI should auto-minimize when content starts
  }, [roomContext]);

  // Handle participant updates from Socket.IO
  const handleParticipantChange = useCallback((updatedParticipants: any[]) => {
    // Debug logging removed
    // CRITICAL FIX: Don't reload page for normal participant changes
    // Only update local state - the room context will handle the rest
    // Page reload should only happen for the specific user being removed
  }, []);

  // Room rate limiting error handlers
  const handleAIError = useCallback((error: any) => {
    console.log('🚨 AI Error in Chat:', error);
    
    if (error.roomLimitExceeded) {
      const resetTime = error.resetTime ? new Date(error.resetTime).toLocaleTimeString() : 'soon';
      
      if (error.error.includes('reasoning')) {
        toast.error(`Room reasoning limit reached (${error.currentUsage}/${error.limit}). Resets at ${resetTime}.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
      } else {
        toast.error(`Room AI response limit reached (${error.currentUsage}/${error.limit}). Resets at ${resetTime}.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
      }
    } else {
      // Handle other AI errors
      toast.error(error.error || 'AI response failed. Please try again.');
    }
  }, [router]);

  const handleRoomLimitReached = useCallback((limitType: 'messages' | 'ai_responses' | 'threads', details: any) => {
    console.log('🚨 Room Limit Reached in Chat:', limitType, details);
    
    const resetTime = details.resetTime ? new Date(details.resetTime).toLocaleTimeString() : 'soon';
    
    switch (limitType) {
      case 'messages':
        toast.error(`Room message limit reached (${details.currentUsage}/${details.limit}). Resets at ${resetTime}.`, {
          duration: 6000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
        break;
        
      case 'ai_responses':
        toast.error(`Room AI response limit reached (${details.currentUsage}/${details.limit}). Resets at ${resetTime}.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
        break;
        
      case 'threads':
        toast.warning(`Room thread limit reached (${details.currentUsage}/${details.limit}). Consider upgrading for more threads.`, {
          duration: 8000,
          action: {
            label: 'Upgrade Room',
            onClick: () => router.push('/account')
          }
        });
        break;
    }
  }, [router]);

  // Helper function to handle room rate limiting errors
  const handleRoomRateLimitError = useCallback(async (response: Response): Promise<boolean> => {
    if (response.status === 429) {
      try {
        const errorData = await response.json();
        
        if (errorData.error === 'ROOM_MESSAGE_LIMIT_EXCEEDED') {
          const resetTime = errorData.resetTime ? new Date(errorData.resetTime).toLocaleTimeString() : 'soon';
          toast.error(`Room message limit reached (${errorData.currentUsage}/${errorData.limit}). Resets at ${resetTime}.`, {
            duration: 6000,
            action: {
              label: 'Upgrade Room',
              onClick: () => router.push('/account')
            }
          });
          return true; // Error handled
        }
        
        if (errorData.error === 'THREAD_MESSAGE_LIMIT_EXCEEDED') {
          toast.warning(`Thread limit reached (${errorData.messageCount}/${errorData.limit} messages). Consider starting a new thread for better AI responses.`, {
            duration: 8000,
            action: {
              label: 'New Thread',
              onClick: () => {
                // Create new thread within the same room (same logic as handleNewChat)
                const newThreadId = crypto.randomUUID();
                const currentParams = new URLSearchParams(window.location.search);
                currentParams.set('threadId', newThreadId);
                currentParams.delete('chatSession');
                const newUrl = `/chat/room/${roomContext?.shareCode}?${currentParams.toString()}`;
                router.replace(newUrl);
              }
            }
          });
          return true; // Error handled
        }
      } catch (parseError) {
        console.warn('Could not parse rate limit error response:', parseError);
      }
    }
    return false; // Error not handled
  }, [router, roomContext?.shareCode]);

  // Memoize realtime hook props to prevent unnecessary re-initializations
  const realtimeProps = useMemo(() => {
    if (!roomContext) return null;
    return {
      shareCode: roomContext.shareCode,
      displayName: roomContext.displayName,
      chatSessionId: roomContext.chatSessionId,
      onNewMessage: handleNewMessage,
      onTypingUpdate: handleTypingUpdate,
      onParticipantChange: handleParticipantChange,
      onStreamStart: handleStreamStart,
      onStreamChunk: handleStreamChunk,
      onStreamEnd: handleStreamEnd,
      onReasoningStart: handleReasoningStart,
      onReasoningChunk: handleReasoningChunk,
      onReasoningEnd: handleReasoningEnd,
      onContentStart: handleContentStart,
      onCrossThreadActivity: handleCrossThreadActivity,
      onAIError: handleAIError,
      onRoomLimitReached: handleRoomLimitReached
    };
  }, [
    roomContext?.shareCode,
    roomContext?.displayName,
    roomContext?.chatSessionId,
    handleNewMessage,
    handleTypingUpdate,
    handleParticipantChange,
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
    handleReasoningStart,
    handleReasoningChunk,
    handleReasoningEnd,
    handleContentStart,
    handleCrossThreadActivity,
    handleAIError,
    handleRoomLimitReached,
    handleRoomRateLimitError
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
    const socket = (w?.__patio_socket) || null;
    if (!socket) return;
    const onStart = (payload: any) => {
      // Debug logging removed
    };
    const onContentStart = (payload: any) => {
      // Debug logging removed
    };
    const onEnd = (payload: any) => {
      // Debug logging removed
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
        // Debug logging removed
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
      // Debug logging removed

      // Don't merge - real-time messages are the single source of truth
      // This ensures User A and User B see exactly the same messages
    }
  }, [roomContext, messages]);

  // Ensure messages are cleared when chat ID changes (atomicity)
  useEffect(() => {
    // Clear messages when switching to a different chat (only for regular chats)
    if (!roomContext && currentChatId && chatId !== currentChatId && !chatId.startsWith('room_')) {
      // Debug logging removed
      setMessages([]);
    }
  }, [chatId, currentChatId, roomContext, setMessages]);

  // Force clear messages when component mounts with a new chat ID
  useEffect(() => {
    if (!roomContext && !currentChat) {
      // Debug logging removed
      setMessages([]);
    }
  }, [chatId, roomContext, currentChat, setMessages]);

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);

    try {
      if (roomContext) {
        // For room chats, create a new chat session within the room
        const newChatSessionId = uuidv4();

        // Debug logging removed

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
      const canOpenFromLeft = isLeftEdge && !(isMobile && openMobile);
      const canCloseFromRight = isRightEdge && (isMobile && openMobile);
      const canCloseFromAnywhere = (isMobile && openMobile) && startX <= MAX_SWIPE_DISTANCE;

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
        if (isMobile) setOpenMobile(true);
      } else if (swipeDirection === 'close' && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        shouldTrigger = true;
        if (isMobile) setOpenMobile(false);
      }

      // Smooth animation to final state
      if (shouldTrigger) {
        setSwipeProgress(swipeDirection === 'open' ? 1 : 0);
      } else {
        // Snap back to original state
        setSwipeProgress((isMobile && openMobile) ? 1 : 0);
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
  }, [isMobile, openMobile, setOpenMobile]);

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

      {/* Mobile Header with Hamburger Menu - only for rooms */}
      {roomContext && (
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/50 h-14 shadow-sm w-full md:hidden">
        <div className="flex items-center justify-between w-full h-full px-4">
          {/* Left side - Hamburger Menu + Logo + Room Name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Hamburger Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-9 w-9 text-foreground hover:bg-muted/50 transition-colors rounded-lg flex-shrink-0"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* PatioAI Logo */}
            <div className="flex-shrink-0">
              <Image
                src="/icons/icon-512x512.png"
                alt="PatioAI"
                width={24}
                height={24}
                className="rounded-md"
              />
            </div>

            {/* Room Name */}
            <h1 className="text-lg font-semibold tracking-tight truncate text-foreground">
              {roomContext ? roomContext.roomName : 'Chat with AI'}
            </h1>
          </div>

          {/* Right side - Activity Indicators + New Chat Button */}
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

            {/* New Chat Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={isCreatingNewChat}
              className="h-8 px-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
            >
              {isCreatingNewChat ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>

            {/* Room Settings (if in room) */}
            {roomContext && (
              <RoomSettingsModal
                roomContext={roomContext}
                isCreator={userData?.id === roomContext.createdBy}
                expiresAt={roomContext.expiresAt}
                onRoomUpdate={() => router.refresh()}
              />
            )}
          </div>
        </div>
      </div>
      )}

      {/* Desktop Chat Header - only for rooms */}
      {roomContext && (
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-2 sm:px-3 md:px-6 py-1 sm:py-1.5 md:py-2.5 flex-shrink-0 hidden md:block">
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
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
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
      )}

      {/* Personal chat: floating New Chat button (top-right inside chat area) */}
      {!roomContext && (
        <div className="absolute top-2 right-3 md:top-4 md:right-6 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            disabled={isCreatingNewChat}
            className="h-8 px-3 text-sm font-medium hover:bg-muted/50 rounded-lg"
            aria-label="New Chat"
          >
            {isCreatingNewChat ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {/* Scrollable Chat Content */}
      <div className="flex-1 w-full min-w-0 flex flex-col overflow-hidden">
        {/* Use realtime messages for room chats, regular messages for individual chats */}
        {(roomContext ? realtimeMessages : messages).length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center px-4 sm:px-6 md:px-8">
            {roomContext ? (
              <div className="flex flex-col items-center gap-4 max-w-md">
                <div className="flex items-center gap-3">
                  <Image
                    src="/icons/icon-512x512.png"
                    alt="PatioAI"
                    width={40}
                    height={40}
                    className="drop-shadow-lg filter-[brightness(1.2)]"
                  />
                  <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gradient">
                    Hey {userData?.full_name?.split(' ')[0] || 'there'}, welcome to {roomContext.roomName}
                  </h1>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground text-center">
                  Invite people by sharing the room link and have a blast!
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 max-w-md">
                <div className="flex items-center gap-3">
                  <Image
                    src="/icons/icon-512x512.png"
                    alt="PatioAI"
                    width={40}
                    height={40}
                    className="drop-shadow-lg filter-[brightness(1.2)]"
                  />
                  <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gradient">
                    Hey {userData?.full_name?.split(' ')[0] || 'there'}, let’s chat
                  </h1>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground text-center">
                  Want to talk 1:1 before jumping into a room? No problem — you can create a room anytime.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className={`flex-1 w-full min-w-0 flex flex-col overflow-hidden relative ${!roomContext ? 'pt-6 sm:pt-8' : ''}`}>
            {!roomContext && (
              <div className="pointer-events-none absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background via-background/70 to-transparent backdrop-blur-[2px] z-[1]" />
            )}
            <VirtualizedMessageList
              messages={roomContext ? displayMessages : messages}
              height={0} // Will be calculated by the flexible container using CSS
              itemHeight={64}
              currentUserDisplayName={roomContext?.displayName}
              showLoading={roomContext ? isRoomLoading : (status === 'streaming' || status === 'submitted')}
              isRoomChat={!!roomContext}
              streamingMessageId={(roomContext ? roomReasoningState.messageId : reasoningStream.streamingMessageId) || undefined}
              streamingReasoning={roomContext ? roomReasoningState.reasoning : reasoningStream.streamingReasoning}
              isReasoningStreaming={roomContext ? roomReasoningState.isStreaming : status === 'streaming'}
              isReasoningComplete={roomContext ? roomReasoningState.isComplete : reasoningStream.isReasoningComplete}
              // Pagination props for room chats
              hasMoreMessages={roomContext ? roomPagination.hasMore : false}
              isLoadingMore={roomContext ? roomPagination.isLoading : false}
              onLoadMore={roomContext ? roomPagination.loadMore : undefined}
              totalDisplayed={roomContext ? roomPagination.totalDisplayed : 0}
            />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 w-full z-5 pb-2 sm:pb-3 px-3 sm:px-4 md:px-6 bg-gradient-to-t from-background via-background/95 to-transparent">
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
            // Debug logging removed
          }}
          isAIStreaming={isAIStreaming}
          onStopAI={() => {
            if (roomContext && typeof invokeAIRef.current === 'function') {
              // Get the socket from global window object for stop functionality
              const socket = (window as any).__patio_socket;
              if (socket) {
                socket.emit('stop-ai', {
                  shareCode: roomContext.shareCode,
                  threadId: roomContext.chatSessionId
                });
              }
            }
          }}
        />
      </div>

      {/* No separate MobileSidebar component. We reuse the same sidebar and open it via context. */}
    </div>
  );
};

export default ChatComponent;
