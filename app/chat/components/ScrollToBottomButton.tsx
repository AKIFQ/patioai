'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
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
    <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 translate-x-8 z-50 animate-in slide-in-from-bottom-2 duration-200">
      <Button
        onClick={onClick}
        size="icon"
        className="h-10 w-10 rounded-full shadow-md hover:shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <ChevronDown className="h-5 w-5" />
      </Button>
    </div>
  );
};

export default ScrollToBottomButton;