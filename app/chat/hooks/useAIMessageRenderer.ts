'use client';

import { useEffect, useRef } from 'react';

interface UseAIMessageRendererProps {
    messages: any[];
    isLoading: boolean;
    onRenderComplete: () => void;
}

export const useAIMessageRenderer = ({
    messages,
    isLoading,
    onRenderComplete
}: UseAIMessageRendererProps) => {
    const lastMessageIdRef = useRef<string | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Ultra-optimized: Direct effect with minimal dependencies
    useEffect(() => {
        // Early returns for maximum efficiency
        if (!isLoading) {
            // Clear timeout if loading stops
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            return;
        }

        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];

        // Fast path: Only process AI messages
        if (lastMessage?.role !== 'assistant') return;

        // Skip if same message (avoid duplicate processing)
        if (lastMessage.id === lastMessageIdRef.current) return;

        // Update tracking
        lastMessageIdRef.current = lastMessage.id;

        // Clear existing timeout (reuse reference)
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Minimal timeout - optimized for perceived performance
        timeoutRef.current = setTimeout(onRenderComplete, 800);

    }, [messages.length, isLoading]); // Ultra-minimal deps - removed onRenderComplete to prevent re-runs

    // Single cleanup effect
    useEffect(() => () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);
};