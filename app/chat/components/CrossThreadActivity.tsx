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
  }, [activities, currentThreadId]);

  // CRITICAL: Separate cleanup effect to prevent timeout leaks
  useEffect(() => {
    return () => {
      // Clear all timeouts on unmount to prevent memory leaks
      activityTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      activityTimeoutsRef.current.clear();
    };
  }, []); // Empty dependencies - only run on mount/unmount

  // Filter out current thread and current user
  const otherThreadActivities = displayActivities.filter(activity =>
    activity.threadId !== currentThreadId &&
    (activity.activeUsers.length > 0 || activity.typingUsers.length > 0)
  );

  if (otherThreadActivities.length === 0) {
    return null;
  }

  const getActivityText = () => {
    // Use Sets to avoid duplicates and prioritize typing over active
    const allTypingUsers = new Set<string>();
    const allActiveUsers = new Set<string>();

    // First pass: collect all typing users
    otherThreadActivities.forEach(activity => {
      activity.typingUsers.forEach(user => {
        if (user !== currentUser) {
          allTypingUsers.add(user);
        }
      });
    });

    // Second pass: collect active users who are not typing
    otherThreadActivities.forEach(activity => {
      activity.activeUsers.forEach(user => {
        if (user !== currentUser && !allTypingUsers.has(user)) {
          allActiveUsers.add(user);
        }
      });
    });

    const parts: string[] = [];

    // Convert sets to arrays for display
    const typingArray = Array.from(allTypingUsers);
    const activeArray = Array.from(allActiveUsers);

    if (typingArray.length > 0) {
      if (typingArray.length === 1) {
        parts.push(`${typingArray[0]} is typing in other thread`);
      } else {
        parts.push(`${typingArray.join(', ')} are typing in other threads`);
      }
    }

    if (activeArray.length > 0) {
      if (activeArray.length === 1) {
        parts.push(`${activeArray[0]} is active in other thread`);
      } else {
        parts.push(`${activeArray.join(', ')} are active in other threads`);
      }
    }

    return parts.join(', ');
  };

  const activityText = getActivityText();

  console.log(' CrossThreadActivity render:', {
    currentThreadId,
    activities: otherThreadActivities,
    activityText
  });

  if (!activityText) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-50/80 dark:bg-orange-950/30 rounded-full border border-orange-200/50 dark:border-orange-800/30">
      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
      <span className="text-xs font-medium text-orange-700 dark:text-orange-300 whitespace-nowrap">
        {activityText}
      </span>
    </div>
  );
};

export default CrossThreadActivity;