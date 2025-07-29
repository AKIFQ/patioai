import React from 'react';

interface TypingIndicatorProps {
  typingUsers: string[];
  currentUser: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers, currentUser }) => {
  // Filter out current user from typing users
  const otherTypingUsers = typingUsers.filter(user => user !== currentUser);

  if (otherTypingUsers.length === 0) {
    return null;
  }

  const getTypingText = () => {
    if (otherTypingUsers.length === 1) {
      return `${otherTypingUsers[0]} is typing...`;
    } else if (otherTypingUsers.length === 2) {
      return `${otherTypingUsers[0]} and ${otherTypingUsers[1]} are typing...`;
    } else {
      return `${otherTypingUsers.slice(0, -1).join(', ')} and ${otherTypingUsers[otherTypingUsers.length - 1]} are typing...`;
    }
  };

  return (
    <div className="px-4 py-2 text-sm text-muted-foreground italic">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span>{getTypingText()}</span>
      </div>
    </div>
  );
};

export default TypingIndicator;