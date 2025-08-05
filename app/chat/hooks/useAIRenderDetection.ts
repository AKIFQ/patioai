'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseAIRenderDetectionProps {
  messages: any[];
  isLoading: boolean;
  onRenderComplete: () => void;
}

export const useAIRenderDetection = ({ 
  messages, 
  isLoading, 
  onRenderComplete 
}: UseAIRenderDetectionProps) => {
  const lastMessageIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const checkCountRef = useRef(0);

  const checkIfRendered = useCallback((messageId: string) => {
    // Efficient DOM query - single targeted selector
    const messageElement = document.querySelector(`[data-message-id="${messageId}"] [data-message-content="${messageId}"]`);
    
    if (messageElement) {
      // Fast visibility and content checks
      const hasContent = messageElement.textContent && messageElement.textContent.trim().length > 10;
      const isVisible = messageElement.offsetHeight > 20; // Quick height check
      
      if (hasContent && isVisible) {
        console.log('✅ AI message actually rendered:', messageId);
        onRenderComplete();
        return true;
      }
    }
    
    return false;
  }, [onRenderComplete]);

  const startRenderDetection = useCallback((messageId: string) => {
    checkCountRef.current = 0;
    
    const checkWithRAF = () => {
      if (checkIfRendered(messageId)) {
        return; // Found it, stop checking
      }
      
      checkCountRef.current++;
      
      // Efficient progressive checking: fast at first, then slower
      if (checkCountRef.current < 10) {
        // First 10 checks: every frame (16ms) - for fast responses
        rafRef.current = requestAnimationFrame(checkWithRAF);
      } else if (checkCountRef.current < 20) {
        // Next 10 checks: every 50ms - for medium responses  
        rafRef.current = requestAnimationFrame(() => {
          setTimeout(checkWithRAF, 50);
        });
      } else if (checkCountRef.current < 30) {
        // Final 10 checks: every 100ms - for slow responses
        rafRef.current = requestAnimationFrame(() => {
          setTimeout(checkWithRAF, 100);
        });
      } else {
        // Fallback after 30 attempts (~2 seconds total)
        console.log('⏰ AI render detection timeout, assuming rendered');
        onRenderComplete();
      }
    };
    
    // Start checking on next frame
    rafRef.current = requestAnimationFrame(checkWithRAF);
  }, [checkIfRendered, onRenderComplete]);

  useEffect(() => {
    console.log('🔍 RENDER DETECTION:', { isLoading, messagesLength: messages.length });
    
    if (!isLoading || messages.length === 0) {
      console.log('❌ RENDER DETECTION: Not loading or no messages');
      // Cancel any ongoing detection
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    console.log('🔍 LAST MESSAGE:', { role: lastMessage?.role, id: lastMessage?.id, lastTracked: lastMessageIdRef.current });
    
    // Only detect for new AI messages
    if (lastMessage?.role === 'assistant' && lastMessage.id !== lastMessageIdRef.current) {
      console.log('🚀 STARTING RENDER DETECTION for:', lastMessage.id);
      lastMessageIdRef.current = lastMessage.id;
      
      // Cancel previous detection
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      
      // Start detection for new message
      startRenderDetection(lastMessage.id);
    }
  }, [messages.length, isLoading, startRenderDetection]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);
};