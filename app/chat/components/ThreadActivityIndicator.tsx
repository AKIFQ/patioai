'use client';

import React from 'react';

interface ThreadActivityIndicatorProps {
  activeUsers: string[];
  typingUsers: string[];
  currentUser: string;
  isCurrentThread?: boolean;
}

const ThreadActivityIndicator: React.FC<ThreadActivityIndicatorProps> = ({ 
  activeUsers, 
  typingUsers, 
  currentUser,
  isCurrentThread = false 
}) => {
  // Filter out current user
  const otherActiveUsers = activeUsers.filter(user => user !== currentUser);
  const otherTypingUsers = typingUsers.filter(user => user !== currentUser);

  if (isCurrentThread) {
    return (
      <span className="text-xs text-muted-foreground/60">
        you are here
      </span>
    );
  }

  if (otherTypingUsers.length > 0) {
    if (otherTypingUsers.length === 1) {
      return (
        <span className="text-xs text-muted-foreground/60">
          {otherTypingUsers[0]} typing
        </span>
      );
    } else {
      return (
        <span className="text-xs text-muted-foreground/60">
          {otherTypingUsers.join(', ')} typing
        </span>
      );
    }
  }

  if (otherActiveUsers.length > 0) {
    if (otherActiveUsers.length === 1) {
      return (
        <span className="text-xs text-muted-foreground/60">
          {otherActiveUsers[0]} active
        </span>
      );
    } else {
      return (
        <span className="text-xs text-muted-foreground/60">
          {otherActiveUsers.join(', ')} active
        </span>
      );
    }
  }

  return (
    <span className="text-xs text-muted-foreground/60">
      idle
    </span>
  );
};

export default ThreadActivityIndicator;