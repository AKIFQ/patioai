import type { KeyboardEvent } from 'react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type Message } from '@ai-sdk/react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { useUpload } from '../context/uploadContext';
import { toast } from 'sonner';
// Shadcn UI components
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { Crown } from 'lucide-react';
// Removed model type Select as every chat is standard by default

// Icons from Lucide React
import {
  Send,
  Loader2,
  ChevronDown,
  Paperclip,
  X,
  FileIcon,
  Zap,
  Plus,
  Check
} from 'lucide-react';

// Memoized FilePreview component outside MessageInput (before MessageInput)
const FilePreview = React.memo(
  ({ file, onRemove }: { file: File; onRemove: () => void }) => {
    const [previewUrl, setPreviewUrl] = useState<string>('');

    React.useEffect(() => {
      // Create a URL for the PDF file
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      // Cleanup: revoke the URL when component unmounts
      return () => {
        URL.revokeObjectURL(url);
      };
    }, [file]);

    return (
      <div className="group/thumbnail relative">
        <div
          className="rounded-lg overflow-hidden border-0.5 border-border-300/25 shadow-sm shadow-always-black/5 can-focus-within rounded-lg cursor-pointer hover:border-border-200/50 hover:shadow-always-black/10"
          style={{ width: 120, height: 120, minWidth: 120, minHeight: 120 }}
        >
          <div
            className="relative bg-bg-000"
            style={{ width: '100%', height: '100%' }}
          >
            {previewUrl && file.type === 'application/pdf' ? (
              <iframe
                src={previewUrl}
                title={`Preview of ${file.name}`}
                className="w-full h-full pointer-events-none"
                style={{
                  transform: 'scale(0.2)',
                  transformOrigin: 'top left',
                  width: '500%',
                  height: '500%'
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                <FileIcon className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>
          <div className="absolute bottom-2 left-0 right-0 px-2.5 overflow-x-hidden overflow-y-visible">
            <div className="relative flex flex-row items-center gap-1 justify-between">
              <div
                className="flex flex-row gap-1 shrink min-w-0"
                style={{ opacity: 1 }}
              >
                <div className="min-w-0 overflow-hidden h-[18px] flex flex-row items-center justify-center gap-0.5 px-1 border-0.5 border-border-300/25 shadow-sm rounded bg-bg-000/70 backdrop-blur-sm font-medium">
                  <p className="uppercase truncate font-styrene text-text-300 text-[11px] leading-[13px] overflow-hidden">
                    pdf
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="transition-all hover:bg-bg-000/50 text-text-500 hover:text-text-200 group-focus-within/thumbnail:opacity-100 group-hover/thumbnail:opacity-100 opacity-0 w-5 h-5 absolute -top-2 -left-2 rounded-full border-0.5 border-border-300/25 bg-bg-000/90 backdrop-blur-sm flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }
);

// Add display name for debugging
FilePreview.displayName = 'FilePreview';

// Removed modelTypes; all chats are already standard

interface RoomContext {
  shareCode: string;
  roomName: string;
  displayName: string;
  sessionId: string;
  participants: Array<{ displayName: string; joinedAt: string }>;
  maxParticipants: number;
  tier: 'free' | 'pro';
  chatSessionId?: string;
}

const MessageInput = ({
  chatId,
  currentChatId,
  selectedOption,
  handleOptionChange,
  roomContext,
  onTyping,
  onSubmit,
  isLoading,
  input,
  setInput,
  webSearchEnabled,
  setWebSearchEnabled,
  reasoningMode = false,
  setReasoningMode,
  userTier = 'free',
  onUpgrade
}: {
  chatId: string;
  currentChatId: string;
  selectedOption: string;
  handleOptionChange: (value: string) => void;
  roomContext?: RoomContext;
  onTyping?: (isTyping: boolean) => void;
  onSubmit: (message: string, attachments?: File[], triggerAI?: boolean, reasoningMode?: boolean) => void;
  isLoading: boolean;
  input: string;
  setInput: (value: string) => void;
  webSearchEnabled: boolean;
  setWebSearchEnabled: (value: boolean) => void;
  reasoningMode?: boolean;
  setReasoningMode?: (value: boolean) => void;
  userTier?: 'free' | 'basic' | 'premium';
  onUpgrade?: () => void;
}) => {
  const { selectedBlobs } = useUpload();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onTypingRef = useRef(onTyping);

  // Update the ref when onTyping changes
  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  // Create a safe typing handler using ref
  const safeOnTyping = useCallback((isTyping: boolean) => {
    try {
      const fn = onTypingRef.current;
      if (typeof fn === 'function') fn(isTyping);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('Error calling onTyping:', error);
    }
  }, []); // No dependencies needed since we use ref

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Removed unused chatSessionIdForRoom calculation
  
  // Only log in development
  // (Removed noisy init log)
  
  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Handle typing indicator
    if (onTypingRef.current) {
      onTypingRef.current(true);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing
      typingTimeoutRef.current = setTimeout(() => {
        if (onTypingRef.current) {
          onTypingRef.current(false);
        }
      }, 1000);
    }
  };

  // Handle typing indicators for room chats
  const handleTyping = useCallback(() => {
    if (!roomContext) return;

    // Start typing
    safeOnTyping(true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 1 second of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      safeOnTyping(false);
    }, 1000);
  }, [roomContext, safeOnTyping]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle typing indicators
    if (roomContext) {
      handleTyping();
    }

    if (event.key === 'Enter' && event.shiftKey) {
      // Trigger prompt action on Shift + Enter
      event.preventDefault();
      handlePromptSubmit(event);
    } else if (event.key === 'Enter') {
      // Prevent default behavior and submit form on Enter only
      event.preventDefault();
      // Stop typing when sending message
      if (roomContext) {
        safeOnTyping(false);
      }
      handleFormSubmit(event);
    }
  };

  // Handle input change with typing indicators
  const handleInputChangeWithTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e);
    
    // Handle typing indicators for room chats
    if (roomContext) {
      if (e.target.value.length > 0) {
        handleTyping();
      } else {
        safeOnTyping(false);
      }
    }
  };



  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      // This file limit is here due to Vercel serverless function impose a 4.5 MB limit.
      // A better solution would be to upload the file to a storage service and send the URL.
      // I'm to lazy to implement that right now.
      toast.error('File is too large (max 3MB)');
      return;
    }

    setAttachedFiles((prev) => [...prev, file]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle form submission (send button - no AI response)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachedFiles.length === 0) return;
    if (isLoading) return; // Prevent double submission

    // Only navigate for regular chats, not room chats
    if (chatId !== currentChatId && !chatId.startsWith('room_')) {
      const currentSearchParams = new URLSearchParams(window.location.search);
      let newUrl = `/chat/${chatId}`;

      if (currentSearchParams.toString()) {
        newUrl += `?${currentSearchParams.toString()}`;
      }

      router.push(newUrl, { scroll: false });
    }
    
    // Submit through parent component WITHOUT triggering AI
    const submissionId = Math.random().toString(36).substring(7);
    console.log(`📤 [${submissionId}] SEND ONLY: "${input.substring(0, 50)}"`);
    
    onSubmit(input, attachedFiles.length > 0 ? attachedFiles : undefined, false, reasoningMode);
    
    // Clear form
    setInput('');
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    console.log(`✅ [${submissionId}] SEND ONLY: Completed`);
  };

  // Handle prompt submission (with AI response)
  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachedFiles.length === 0) return;
    if (isLoading) return; // Prevent double submission

    // Only navigate for regular chats, not room chats
    if (chatId !== currentChatId && !chatId.startsWith('room_')) {
      const currentSearchParams = new URLSearchParams(window.location.search);
      let newUrl = `/chat/${chatId}`;

      if (currentSearchParams.toString()) {
        newUrl += `?${currentSearchParams.toString()}`;
      }

      router.push(newUrl, { scroll: false });
    }
    
    // Submit through parent component WITH AI response triggered
    const submissionId = Math.random().toString(36).substring(7);
    console.log(`⚡ [${submissionId}] PROMPT SUBMIT: "${input.substring(0, 50)}"`);
    
    onSubmit(input, attachedFiles.length > 0 ? attachedFiles : undefined, true, reasoningMode);
    
    // Clear form
    setInput('');
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    console.log(`✅ [${submissionId}] PROMPT SUBMIT: Completed`);
  };

  // Focus textarea on mount for mobile to open the keyboard when user taps the input
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onTouchStart = () => {
      // Ensure focus on touch to open keyboard
      el.focus({ preventScroll: true });
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => el.removeEventListener('touchstart', onTouchStart as any);
  }, []);

  // Long-press on send button (mobile) to trigger AI quick action (same as Shift+Enter)
  const sendButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const btn = sendButtonRef.current;
    if (!btn) return;
    let timer: any;
    const handleTouchStart = (e: TouchEvent) => {
      timer = setTimeout(() => {
        // Trigger AI prompt action
        handlePromptSubmit(e as any);
      }, 500); // 500ms long-press
    };
    const clear = () => timer && clearTimeout(timer);
    btn.addEventListener('touchstart', handleTouchStart, { passive: true });
    btn.addEventListener('touchend', clear, { passive: true });
    btn.addEventListener('touchmove', clear, { passive: true });
    btn.addEventListener('touchcancel', clear, { passive: true });
    return () => {
      btn.removeEventListener('touchstart', handleTouchStart as any);
      btn.removeEventListener('touchend', clear as any);
      btn.removeEventListener('touchmove', clear as any);
      btn.removeEventListener('touchcancel', clear as any);
    };
  }, [handlePromptSubmit]);

  return (
    <>
      <form
        onSubmit={handleFormSubmit}
        className="relative w-full mb-1 rounded-2xl overflow-hidden border border-border/40 shadow-sm flex flex-col transition-all duration-200 hover:border-border/60 focus-within:border-border/60 bg-background/80 backdrop-blur-md"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,application/pdf"
          className="hidden"
        />

        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChangeWithTyping}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={isLoading}
          className="w-full pt-3 pb-1.5 min-h-0 max-h-40 resize-none border-0 shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none bg-transparent"
          rows={1}
        />

        {/* Bottom controls row with buttons */}
        <div className="flex px-2 sm:px-2.5 pb-1 pt-1.5 items-center gap-1.5 sm:gap-2 justify-between min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-hidden">
            {/* Plus menu with Attach and Web search toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 sm:h-8 cursor-pointer text-xs rounded-md flex items-center gap-1.5 border border-border/40 bg-background/60 hover:bg-background/80 transition-colors flex-shrink-0"
                  disabled={isLoading}
                  aria-label="More tools"
                >
                  <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border border-border/40 bg-background/90 backdrop-blur-md">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="text-xs">
                  <Paperclip className="h-3.5 w-3.5 mr-2" /> Attach file
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setWebSearchEnabled(!webSearchEnabled);
                  }}
                  className="text-xs flex items-center justify-between"
                >
                  <span>Web search</span>
                  <span
                    className={`ml-2 inline-flex h-4 w-7 items-center rounded-full border transition-colors ${
                      webSearchEnabled
                        ? 'bg-emerald-500/70 border-emerald-400/60'
                        : 'bg-muted/40 border-border/40'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 rounded-full bg-background shadow transition-transform ${
                        webSearchEnabled ? 'translate-x-3' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </DropdownMenuItem>
                {/* Reasoning toggle - only for free users */}
                {userTier === 'free' && setReasoningMode && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      if (!reasoningMode) {
                        // Show warning when enabling reasoning mode
                        const confirmed = window.confirm(
                          'Reasoning mode uses DeepSeek R1 with 512 token reasoning limit (~$0.0005 per message). Continue?'
                        );
                        if (confirmed) {
                          setReasoningMode(true);
                          // Show success toast
                          if (typeof window !== 'undefined' && (window as any).toast) {
                            (window as any).toast.success('Reasoning mode enabled - using DeepSeek R1');
                          }
                        }
                      } else {
                        setReasoningMode(false);
                      }
                    }}
                    className="text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <div className="h-3.5 w-3.5 mr-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-white" />
                      </div>
                      <span>Reasoning mode</span>
                      {reasoningMode && (
                        <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">($)</span>
                      )}
                    </div>
                    <span
                      className={`ml-2 inline-flex h-4 w-7 items-center rounded-full border transition-colors ${
                        reasoningMode
                          ? 'bg-amber-500/70 border-amber-400/60'
                          : 'bg-muted/40 border-border/40'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 rounded-full bg-background shadow transition-transform ${
                          reasoningMode ? 'translate-x-3' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1 min-w-0">
              <ModelSelector
                selectedModel={selectedOption}
                userTier={userTier}
                onModelChange={(modelId) => handleOptionChange(modelId)}
                onUpgradeClick={onUpgrade}
              />
            </div>

            {selectedBlobs.length > 0 && (
              <div className="hidden sm:flex items-center rounded-full text-xs px-2 h-8 bg-primary/10 border border-primary/30 flex-shrink-0">
                <span className="text-primary font-medium">
                  {selectedBlobs.length} file
                  {selectedBlobs.length > 1 ? 's' : ''} attached
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Prompt button */}
            {!isLoading && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handlePromptSubmit}
                disabled={!input.trim() && attachedFiles.length === 0}
                className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 transition-colors border border-amber-500/30 rounded-lg cursor-pointer group flex-shrink-0"
                title="Send with AI response (Shift + Enter)"
              >
                <Zap className="text-amber-500 w-4 h-4 sm:w-5 sm:h-5 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
              </Button>
            )}

            {/* Send button or spinner with matched sizing */}
            {isLoading ? (
              <div className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 flex items-center justify-center border border-primary/30 cursor-pointer relative group rounded-lg bg-background flex-shrink-0">
                {/* Loading indicator */}
                <div className="flex items-center justify-center">
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-primary animate-spin" />
                </div>
              </div>
            ) : (
              <Button
                ref={sendButtonRef}
                type="submit"
                size="icon"
                variant="ghost"
                disabled={!input.trim() && attachedFiles.length === 0}
                className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors border border-border/40 rounded-lg cursor-pointer flex-shrink-0"
                title="Send (Enter). Long-press on mobile to Ask AI (Shift+Enter)"
              >
                <Send className="text-primary w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              </Button>
            )}
          </div>
        </div>

        {/* File previews section with clear visual separation */}
        {attachedFiles.length > 0 && (
          <div className="overflow-hidden border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
            <div className="flex flex-row overflow-x-auto gap-2 sm:gap-3 px-3 sm:px-3.5 py-2 sm:py-2.5">
              {attachedFiles.map((file, index) => (
                <FilePreview
                  key={file.name + index}
                  file={file}
                  onRemove={() => removeFile(index)}
                />
              ))}
            </div>
          </div>
        )}
      </form>
    </>
  );
};

export default MessageInput;
