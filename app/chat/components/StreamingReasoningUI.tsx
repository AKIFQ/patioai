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
            <div className={`
                bg-muted/30 dark:bg-slate-800/30
                border border-border/60 dark:border-slate-700/60
                rounded-md overflow-hidden shadow-sm
                transition-all duration-150 ease-in-out
                ${isMinimized ? 'max-h-8' : 'max-h-60'}
                backdrop-blur-sm
            `}>
                {/* Header */}
                <div
                    className="flex items-center justify-between px-2 py-1 cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={toggleMinimized}
                >
                    <div className="flex items-center gap-1">
                        {/* Removed live status dot */}
                        <Brain className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 tracking-tight">
                            {isStreaming ? 'Planning' : 'Reasoning'}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 hover:bg-muted/60 dark:hover:bg-slate-700/60"
                    >
                        {isMinimized ? (
                            <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        ) : (
                            <ChevronUp className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        )}
                    </Button>
                </div>

                {/* Content */}
                {!isMinimized && (
                    <div className="border-t border-border/50 dark:border-slate-700/40">
                        <div
                            ref={scrollRef}
                            className="px-2 py-1.5 max-h-48 overflow-y-auto bg-background/30 dark:bg-slate-900/10"
                        >
                            <div className="max-w-none text-[10px] leading-[1.15] text-slate-700 dark:text-slate-300">
                                {reasoningText ? (
                                    <MemoizedMarkdown
                                        content={reasoningText}
                                        id={`streaming-reasoning-${messageId}`}
                                    />
                                ) : isStreaming ? (
                                    <div className="text-slate-500 italic text-[10px]">
                                        Planning next steps…
                                    </div>
                                ) : (
                                    <div className="text-slate-500 italic text-[10px]">
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