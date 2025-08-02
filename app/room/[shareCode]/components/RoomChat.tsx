'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Send, Loader2, Bot, User } from 'lucide-react';
import { toast } from 'sonner';

import MemoizedMarkdown from '@/app/chat/components/tools/MemoizedMarkdown';
import { useRoomSocket } from '@/app/chat/hooks/useRoomSocket';
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
      {/* Room Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">{room.name}</h1>
            <p className="text-sm text-muted-foreground">
              Room: {room.shareCode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {participants.length}/{room.maxParticipants}
            </Badge>
            <Badge variant="outline">{room.tier}</Badge>
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
          messages.map((message) => (
            <Card key={message.id} className={`${
              message.isAiResponse 
                ? 'bg-muted/50 border-primary/20' 
                : 'bg-background border-border/50'
            }`}>
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center gap-3">
                  {message.isAiResponse ? (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{message.senderName}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {message.isAiResponse ? (
                  <MemoizedMarkdown 
                    content={message.content} 
                    id={`message-${message.id}`}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
        
        {isAiTyping && (
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">AI is typing...</span>
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            </CardContent>
          </Card>
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