'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  onClick: () => void;
  show: boolean;
  hasNewMessages?: boolean;
}

const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  onClick,
  show,
  hasNewMessages = false
}) => {
  if (!show) return null;

  return (
    <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 z-20 animate-in slide-in-from-bottom-2 duration-200">
      <button
        onClick={onClick}
        aria-label="Scroll to bottom"
        className="h-12 w-12 flex items-center justify-center bg-transparent text-foreground/80 hover:text-foreground transition-colors"
      >
        <ChevronDown className="h-8 w-8" />
      </button>
    </div>
  );
};

export default ScrollToBottomButton;