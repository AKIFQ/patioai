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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

// Icons from Lucide React
import {
  Send,
  Loader2,
  ChevronDown,
  Paperclip,
  X,
  FileIcon,
  Zap
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

const modelTypes = [
  { value: 'standart', label: 'Standard' },
  { value: 'perplex', label: 'Perplexity' },
  { value: 'website', label: 'Website' }
];

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

const MessageInput = React.memo(({
  chatId,
  currentChatId,
  modelType,
  selectedOption,
  handleModelTypeChange,
  handleOptionChange,
  roomContext,
  onTyping,
  onSubmit,
  isLoading,
  input,
  setInput
}: {
  chatId: string;
  currentChatId: string;
  modelType: string;
  selectedOption: string;
  handleModelTypeChange: (value: string) => void;
  handleOptionChange: (value: string) => void;
  roomContext?: RoomContext;
  onTyping?: (isTyping: boolean) => void;
  onSubmit: (message: string, attachments?: File[], triggerAI?: boolean) => void;
  isLoading: boolean;
  input: string;
  setInput: (value: string) => void;
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
    console.log('🔧 safeOnTyping called:', isTyping);
    try {
      const currentOnTyping = onTypingRef.current;
      console.log('🔧 currentOnTyping exists:', !!currentOnTyping);
      if (currentOnTyping && typeof currentOnTyping === 'function') {
        console.log('🔧 Calling onTyping function');
        currentOnTyping(isTyping);
      } else {
        console.log('🔧 No onTyping function available');
      }
    } catch (error) {
      console.warn('❌ Error calling onTyping:', error);
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

  // Only log in development (reduced frequency)
  const initLoggedRef = useRef(false);
  if (process.env.NODE_ENV === 'development' && !initLoggedRef.current) {
    console.log(`📝 MESSAGE INPUT: Component initialized as controlled component`);
    initLoggedRef.current = true;
  }
  
  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Handle file operations
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
  const handleFormSubmit = useCallback(async (e: React.FormEvent) => {
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
    onSubmit(input, attachedFiles.length > 0 ? attachedFiles : undefined, false);
    
    // Clear form
    setInput('');
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [input, attachedFiles, isLoading, chatId, currentChatId, router, onSubmit, setInput]);

  // Handle prompt submission (with AI response)
  const handlePromptSubmit = useCallback(async (e: React.FormEvent) => {
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
    onSubmit(input, attachedFiles.length > 0 ? attachedFiles : undefined, true);
    
    // Clear form
    setInput('');
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [input, attachedFiles, isLoading, chatId, currentChatId, router, onSubmit, setInput]);

  // Optimized typing handler with debouncing
  const handleTyping = useCallback(() => {
    if (!roomContext || !onTypingRef.current) return;

    // Clear existing timeout first
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Only start typing if not already typing
    safeOnTyping(true);

    // Stop typing after 2 seconds of inactivity (increased from 1s)
    typingTimeoutRef.current = setTimeout(() => {
      safeOnTyping(false);
    }, 2000);
  }, [roomContext, safeOnTyping]);

  // Keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Only handle typing for actual typing keys, not navigation keys
    if (roomContext && !['Enter', 'Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
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
      if (roomContext && typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        safeOnTyping(false);
      }
      handleFormSubmit(event);
    }
  }, [roomContext, handleTyping, safeOnTyping, handlePromptSubmit, handleFormSubmit]);

  // Optimized input change handler with debounced typing
  const handleInputChangeWithTyping = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    
    // Handle typing indicators for room chats only
    if (roomContext && onTypingRef.current) {
      if (newValue.length > 0) {
        handleTyping(); // This is already debounced
      } else {
        // Stop typing immediately when input is empty
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        safeOnTyping(false);
      }
    }
  }, [roomContext, handleTyping, safeOnTyping, setInput]);

  return (
    <>
      <form
        onSubmit={handleFormSubmit}
        className="relative max-w-[720px] mx-auto mb-1 backdrop-blur-sm rounded-2xl overflow-hidden border-1 shadow-sm flex flex-col transition-all duration-200 shadow-md dark:shadow-lg focus-within:shadow-lg dark:focus-within:shadow-xl hover:border-gray-300 dark:hover:border-gray-700 focus-within:border-gray-300 dark:focus-within:border-gray-700 cursor-text"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,application/pdf"
          className="hidden"
        />

        <Textarea
          value={input}
          onChange={handleInputChangeWithTyping}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={isLoading}
          className="w-full pt-3 pb-1.5 min-h-0 max-h-40 resize-none border-0 shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none bg-transparent focus:bg-transparent dark:bg-transparent dark:focus:bg-transparent"
          rows={1}
        />

        {/* Bottom controls row with buttons */}
        <div className="flex px-2.5 pb-1 pt-1.5 items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {attachedFiles.length === 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 cursor-pointer text-xs rounded-md flex items-center gap-1.5 hover:bg-primary/5 dark:hover:bg-primary/10"
                disabled={isLoading}
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>Attach file</span>
              </Button>
            )}

            <div className="flex-1 max-w-[160px]">
              <Select value={modelType} onValueChange={handleModelTypeChange}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {modelTypes.map((model) => (
                    <SelectItem
                      key={model.value}
                      value={model.value}
                      className="text-xs"
                    >
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {modelType === 'standart' && (
              <div className="flex-1 ml-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 justify-between text-xs"
                    >
                      <span className="truncate">{selectedOption}</span>
                      <ChevronDown className="h-3 w-3 ml-2 flex-shrink-0 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {[
                      { value: 'gpt-4.1', label: 'GPT-4.1' },
                      { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
                      { value: 'o3', label: 'OpenAI O3' },
                      {
                        value: 'claude-3.7-sonnet',
                        label: 'Claude 3.7 Sonnet'
                      },
                      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
                    ].map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => handleOptionChange(option.value)}
                        className={`text-xs ${
                          selectedOption === option.value
                            ? 'bg-primary/20 dark:bg-primary/30 text-primary dark:text-primary-foreground'
                            : ''
                        }`}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {selectedBlobs.length > 0 && (
              <div className="hidden sm:flex items-center rounded-full text-xs px-2 h-8 bg-primary/10 border border-primary/30">
                <Paperclip className="mr-1 h-4 w-4 text-primary" />
                <span className="text-primary font-medium">
                  {selectedBlobs.length} file
                  {selectedBlobs.length > 1 ? 's' : ''} attached
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Prompt button */}
            {!isLoading && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handlePromptSubmit}
                disabled={!input.trim() && attachedFiles.length === 0}
                className="h-8 w-8 sm:h-10 sm:w-10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 transition-colors border border-amber-500/30 rounded-lg cursor-pointer group"
                title="Send with AI response (Shift + Enter)"
              >
                <Zap className="text-amber-500 w-4 h-4 sm:w-5 sm:h-5 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
              </Button>
            )}

            {/* Send button or spinner with matched sizing */}
            {isLoading ? (
              <div className="h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center border border-primary/30 cursor-pointer relative group rounded-lg bg-background">
                {/* Loading indicator */}
                <div className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary animate-spin" />
                </div>
              </div>
            ) : (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                disabled={!input.trim() && attachedFiles.length === 0}
                className="h-8 w-8 sm:h-10 sm:w-10 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors border border-primary/30 rounded-lg cursor-pointer"
                title="Send message only (Enter)"
              >
                <Send className="text-primary w-5 h-5 sm:w-8 sm:h-8" />
              </Button>
            )}
          </div>
        </div>

        {/* File previews section with clear visual separation */}
        {attachedFiles.length > 0 && (
          <div className="overflow-hidden border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
            <div className="flex flex-row overflow-x-auto gap-3 px-3.5 py-2.5">
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
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
