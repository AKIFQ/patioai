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
      return `${otherTypingUsers[0]} typing`;
    } else if (otherTypingUsers.length === 2) {
      return `${otherTypingUsers[0]}, ${otherTypingUsers[1]} typing`;
    } else {
      return `${otherTypingUsers.slice(0, -1).join(', ')}, ${otherTypingUsers[otherTypingUsers.length - 1]} typing`;
    }
  };

  return (
    <div className="px-4 py-1 text-xs text-muted-foreground/60">
      {getTypingText()}
    </div>
  );
};

export default TypingIndicator;