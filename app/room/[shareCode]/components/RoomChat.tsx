'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Send, Loader2, Bot, User } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

import MemoizedMarkdown from '@/app/chat/components/tools/MemoizedMarkdown';
import { useRoomSocket } from '@/app/chat/hooks/useRoomSocket';
import AILoadingMessage from '@/app/chat/components/AILoadingMessage';
import type { Message } from 'ai';

interface Room {
  id: string;
  name: string;
  shareCode: string;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
}

interface Participant {
  displayName: string;
  joinedAt: string;
}

interface RoomMessage {
  id: string;
  senderName: string;
  content: string;
  isAiResponse: boolean;
  createdAt: string;
  sources?: any;
  reasoning?: string;
}

interface RoomChatProps {
  room: Room;
  participant: {
    displayName: string;
    sessionId: string;
  };
  participants: Participant[];
}

export default function RoomChat({ room, participant, participants }: RoomChatProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket.IO realtime connection
  const { isConnected } = useRoomSocket({
    shareCode: room.shareCode,
    displayName: participant.displayName,
    chatSessionId: participant.sessionId,
    onNewMessage: (message) => {
      // Convert Socket.IO message format to RoomMessage format
      const roomMessage: RoomMessage = {
        id: message.id,
        senderName: message.role === 'assistant' ? 'AI Assistant' : message.content.split(': ')[0],
        content: message.role === 'assistant' ? message.content : message.content.split(': ').slice(1).join(': '),
        isAiResponse: message.role === 'assistant',
        createdAt: message.createdAt?.toISOString() || new Date().toISOString()
      };

      // Only add messages that aren't already in the list
      setMessages(prev => {
        const exists = prev.some(msg => msg.id === roomMessage.id);
        if (exists) return prev;
        return [...prev, roomMessage];
      });
    },
    onTypingUpdate: (users) => {
      // Handle typing indicators if needed
      console.log('Users typing:', users);
    }
  });

  useEffect(() => {
    loadMessages();
  }, [room.shareCode, room.id]);

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/rooms/${room.shareCode}/messages`);
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    setIsAiTyping(true);

    // Add user message to UI immediately
    const userMessage: RoomMessage = {
      id: `temp-${Date.now()}`,
      senderName: participant.displayName,
      content: messageContent,
      isAiResponse: false,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();

      const response = await fetch(`/api/rooms/${room.shareCode}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageContent,
          displayName: participant.displayName,
          sessionId: participant.sessionId,
          selectedModel: 'gpt-4.1'
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to send message');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let aiResponse = '';
      const aiMessage: RoomMessage = {
        id: `ai-${Date.now()}`,
        senderName: 'AI Assistant',
        content: '',
        isAiResponse: true,
        createdAt: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const data = JSON.parse(line.slice(2));
              if (data.type === 'text-delta' && data.textDelta) {
                aiResponse += data.textDelta;
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === aiMessage.id 
                      ? { ...msg, content: aiResponse }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Ignore parsing errors for non-JSON lines
            }
          }
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
        return;
      }
      
      console.error('Error sending message:', error);
      toast.error(error.message || 'Failed to send message');
      
      // Remove the user message on error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      setIsSending(false);
      setIsAiTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Room Header - Ultra Slim */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-sm font-medium truncate">{room.name}</h1>
            <span className="text-xs text-muted-foreground">({room.shareCode})</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 h-5">
              <Users className="h-2.5 w-2.5" />
              {participants.length}/{room.maxParticipants}
            </Badge>
            <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-5">{room.tier}</Badge>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => {
              const isCurrentUser = message.senderName === participant.displayName;
              
              return (
                <li key={message.id} className="group">
                  <div className={`flex gap-2 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                    {/* Avatar - only show on left side for non-current-user messages */}
                    {!isCurrentUser && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                        {message.isAiResponse ? (
                          <Image 
                            src="/icons/icon-512x512.png" 
                            alt="AI Assistant" 
                            width={16} 
                            height={16}
                            className="rounded-full"
                          />
                        ) : (
                          <User className="w-3 h-3 text-primary" />
                        )}
                      </div>
                    )}
                    
                    {/* Message Content */}
                    <div className={`max-w-[85%] sm:max-w-[75%] ${isCurrentUser ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                      {/* Sender name and time */}
                      {!isCurrentUser && (
                        <div className="text-xs text-muted-foreground mb-1 px-2 flex items-center gap-2">
                          <span>{message.senderName}</span>
                          <span>•</span>
                          <span>{formatTime(message.createdAt)}</span>
                        </div>
                      )}
                      
                      <div className={`rounded-xl px-3 py-2 text-sm ${
                        isCurrentUser 
                          ? 'bg-primary text-primary-foreground rounded-br-sm' 
                          : message.isAiResponse
                            ? 'bg-blue-50 dark:bg-blue-950/30 text-foreground rounded-bl-sm border border-blue-200 dark:border-blue-800/50'
                            : 'bg-muted text-foreground rounded-bl-sm border border-border/50'
                      }`}>
                        {message.isAiResponse ? (
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1">
                            <MemoizedMarkdown 
                              content={message.content} 
                              id={`message-${message.id}`}
                            />
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                      
                      {/* Time for current user messages */}
                      {isCurrentUser && (
                        <div className="text-xs text-muted-foreground mt-1 px-2">
                          {formatTime(message.createdAt)}
                        </div>
                      )}
                    </div>

                    {/* User Avatar - only show on right side for current user messages */}
                    {isCurrentUser && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <User className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        
        {isAiTyping && (
          <ul>
            <AILoadingMessage />
          </ul>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Message as ${participant.displayName}...`}
            disabled={isSending}
            className="flex-1"
          />
          <Button 
            onClick={sendMessage} 
            disabled={!newMessage.trim() || isSending}
            size="icon"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}