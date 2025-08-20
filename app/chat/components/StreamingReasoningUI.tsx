'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MemoizedMarkdown from './tools/MemoizedMarkdown';

interface StreamingReasoningUIProps {
    messageId: string;
    reasoningText: string;
    isStreaming: boolean;
    isComplete: boolean;
    onMinimize?: () => void;
}

const StreamingReasoningUI: React.FC<StreamingReasoningUIProps> = ({
    messageId,
    reasoningText,
    isStreaming,
    isComplete,
    onMinimize
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [shouldAutoMinimize, setShouldAutoMinimize] = useState(false);
    const [userExpanded, setUserExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastTextLength = useRef(0);
    const [progress, setProgress] = useState(0);

    // Persisted expand/collapse per message
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const key = `reasoning-ui:${messageId}:expanded`;
        const saved = window.localStorage.getItem(key);
        if (saved === '1') {
            setIsMinimized(false);
            setUserExpanded(true);
            setShouldAutoMinimize(false);
        } else {
            // On refresh/initial load, keep minimized by default when not streaming
            if (!isStreaming && (isComplete || reasoningText.length > 0)) {
                setIsMinimized(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messageId]);

    // Subtle top progress bar animation while streaming (no custom keyframes)
    useEffect(() => {
        if (!isStreaming) {
            setProgress(0);
            return;
        }
        let p = 0;
        const id = setInterval(() => {
            p = (p + Math.floor(Math.random() * 15 + 8)) % 100; // organic advance
            setProgress(p);
        }, 220);
        return () => clearInterval(id);
    }, [isStreaming]);

    // Auto-scroll to bottom when new reasoning text arrives
    useEffect(() => {
        if (isStreaming && reasoningText.length > lastTextLength.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            lastTextLength.current = reasoningText.length;
        }
    }, [reasoningText, isStreaming]);

    // Auto-minimize when reasoning is complete and real answer starts (unless the user expanded manually)
    useEffect(() => {
        if (isComplete && !isMinimized && shouldAutoMinimize && !userExpanded) {
            const timer = setTimeout(() => {
                setIsMinimized(true);
                onMinimize?.();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [isComplete, isMinimized, shouldAutoMinimize, userExpanded, onMinimize]);

    // Set auto-minimize flag when reasoning starts streaming
    useEffect(() => {
        if (isStreaming && reasoningText.length > 0) {
            setShouldAutoMinimize(true);
        }
    }, [isStreaming, reasoningText]);

    // Auto-minimize when content starts (for room chats) unless user expanded
    useEffect(() => {
        if (!isStreaming && isComplete && reasoningText.length > 0 && !userExpanded) {
            setShouldAutoMinimize(true);
        }
    }, [isStreaming, isComplete, reasoningText, userExpanded]);

    const toggleMinimized = () => {
        const next = !isMinimized;
        setIsMinimized(next);
        const key = `reasoning-ui:${messageId}:expanded`;
        if (!next) {
            // Expanded
            window.localStorage.setItem(key, '1');
            setUserExpanded(true);
            setShouldAutoMinimize(false);
        } else {
            // Minimized
            window.localStorage.removeItem(key);
        }
    };

    if (!reasoningText && !isStreaming && !isComplete) {
        return null;
    }

    return (
        <div className="mb-2 w-full">
            <div
                className={`relative bg-amber-50/40 dark:bg-amber-900/10 backdrop-blur-md
                    border border-amber-200/50 dark:border-amber-700/40 rounded-md overflow-hidden shadow-sm
                    transition-[max-height,opacity] duration-200 ease-in-out
                    ${isMinimized ? 'max-h-8 opacity-95' : 'max-h-60 opacity-100'}`}
            >
                {/* Streaming progress indicator (subtle, minimalist) */}
                {isStreaming && (
                    <div className="absolute left-0 top-0 h-[1.5px] w-full bg-transparent">
                        <div
                            className="h-full bg-amber-500/60"
                            style={{ width: `${Math.max(10, progress)}%`, transition: 'width 220ms ease' }}
                        />
                    </div>
                )}

                {/* Header */}
                <div
                    className="flex items-center justify-between px-2 py-1 cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-900/20 transition-colors"
                    onClick={toggleMinimized}
                    aria-expanded={!isMinimized}
                    role="button"
                >
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <Brain className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ${isStreaming ? 'animate-pulse' : ''}`} />
                            <span className="text-[13px] font-semibold text-amber-900/90 dark:text-amber-100 tracking-tight">
                                {isStreaming ? 'Planning' : 'Reasoning'}
                            </span>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 hover:bg-amber-100/70 dark:hover:bg-amber-900/30"
                        aria-label={isMinimized ? 'Expand reasoning' : 'Collapse reasoning'}
                    >
                        {isMinimized ? (
                            <ChevronDown className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                        ) : (
                            <ChevronUp className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                        )}
                    </Button>
                </div>

                {/* Content */}
                {!isMinimized && (
                    <div className="border-t border-amber-200/50 dark:border-amber-700/40">
                        <div
                            ref={scrollRef}
                            className="px-2 py-1 max-h-48 overflow-y-auto bg-transparent"
                        >
                            <div className="max-w-none text-[12px] leading-[1.5] text-amber-950/90 dark:text-amber-50/90">
                                {reasoningText ? (
                                    <MemoizedMarkdown
                                        content={reasoningText}
                                        id={`streaming-reasoning-${messageId}`}
                                        compact
                                    />
                                ) : isStreaming ? (
                                    <div className="text-amber-900/70 dark:text-amber-200/80 italic text-[12px]">
                                        Planning next steps…
                                    </div>
                                ) : (
                                    <div className="text-amber-900/70 dark:text-amber-200/80 italic text-[12px]">
                                        No planning content
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StreamingReasoningUI;