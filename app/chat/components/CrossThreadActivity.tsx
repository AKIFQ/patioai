'use client';

import React, { useState, useEffect, useRef } from 'react';

interface ThreadActivity {
  threadId: string;
  threadName: string;
  activeUsers: string[];
  typingUsers: string[];
}

interface CrossThreadActivityProps {
  currentThreadId: string;
  activities: ThreadActivity[];
  currentUser: string;
}

const CrossThreadActivity: React.FC<CrossThreadActivityProps> = ({ 
  currentThreadId, 
  activities, 
  currentUser 
}) => {
  const [displayActivities, setDisplayActivities] = useState<ThreadActivity[]>([]);
  const activityTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Update activities with 10-second linger
  useEffect(() => {
    // Process incoming activities
    activities.forEach(activity => {
      if (activity.threadId !== currentThreadId) {
        // Clear existing timeout for this thread
        const existingTimeout = activityTimeoutsRef.current.get(activity.threadId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          activityTimeoutsRef.current.delete(activity.threadId);
        }
        
        // Update display activities immediately
        setDisplayActivities(prev => {
          const filtered = prev.filter(a => a.threadId !== activity.threadId);
          if (activity.activeUsers.length > 0 || activity.typingUsers.length > 0) {
            return [...filtered, activity];
          }
          return filtered;
        });
        
        // Set timeout to remove activity after 10 seconds of inactivity
        if (activity.activeUsers.length === 0 && activity.typingUsers.length === 0) {
          const timeout = setTimeout(() => {
            setDisplayActivities(prev => prev.filter(a => a.threadId !== activity.threadId));
            activityTimeoutsRef.current.delete(activity.threadId);
          }, 10000); // 10 seconds linger
          
          activityTimeoutsRef.current.set(activity.threadId, timeout);
        }
      }
    });
    
    // Cleanup timeouts on unmount
    return () => {
      activityTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      activityTimeoutsRef.current.clear();
    };
  }, [activities, currentThreadId]); // Removed activityTimeouts from dependencies

  // Filter out current thread and current user
  const otherThreadActivities = displayActivities.filter(activity => 
    activity.threadId !== currentThreadId && 
    (activity.activeUsers.length > 0 || activity.typingUsers.length > 0)
  );

  if (otherThreadActivities.length === 0) {
    return null;
  }

  const getActivityText = () => {
    const allTypingUsers: string[] = [];
    const allActiveUsers: string[] = [];
    
    otherThreadActivities.forEach(activity => {
      allTypingUsers.push(...activity.typingUsers.filter(user => user !== currentUser));
      allActiveUsers.push(...activity.activeUsers.filter(user => user !== currentUser && !allTypingUsers.includes(user)));
    });

    const parts: string[] = [];
    
    if (allTypingUsers.length > 0) {
      if (allTypingUsers.length === 1) {
        parts.push(`${allTypingUsers[0]} typing in other thread`);
      } else {
        parts.push(`${allTypingUsers.join(', ')} typing in other threads`);
      }
    }
    
    if (allActiveUsers.length > 0) {
      if (allActiveUsers.length === 1) {
        parts.push(`${allActiveUsers[0]} active in other thread`);
      } else {
        parts.push(`${allActiveUsers.join(', ')} active in other threads`);
      }
    }

    return parts.join(', ');
  };

  const activityText = getActivityText();
  
  console.log('🔄 CrossThreadActivity render:', {
    currentThreadId,
    activities: otherThreadActivities,
    activityText
  });
  
  if (!activityText) {
    return null;
  }

  return (
    <span className="text-xs text-muted-foreground/60 animate-pulse">
      {activityText}
    </span>
  );
};

export default CrossThreadActivity;