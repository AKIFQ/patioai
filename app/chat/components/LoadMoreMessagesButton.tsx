'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronUp, Loader2 } from 'lucide-react';

interface LoadMoreMessagesButtonProps {
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  totalDisplayed: number;
  className?: string;
}

const LoadMoreMessagesButton: React.FC<LoadMoreMessagesButtonProps> = ({
  isLoading,
  hasMore,
  onLoadMore,
  totalDisplayed,
  className = ''
}) => {
  if (!hasMore) {
    return null;
  }

  return (
    <Button
      onClick={onLoadMore}
      disabled={isLoading}
      variant="ghost"
      size="sm"
      className="text-xs text-muted-foreground hover:text-foreground h-6 px-2 bg-background/80 backdrop-blur-sm border border-border/20 rounded-full shadow-sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Loading...
        </>
      ) : (
        <>
          <ChevronUp className="h-3 w-3 mr-1" />
          Load more messages
        </>
      )}
    </Button>
  );
};

export default LoadMoreMessagesButton;