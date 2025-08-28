/**
 * Friendly, Quirky Error Message Generator
 * Creates user-friendly notifications with appropriate upgrade prompts
 */

import { type UserTier } from '@/lib/limits/tierLimits';

export interface NotificationMessage {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
  actionButton?: {
    text: string;
    action: 'upgrade' | 'retry' | 'new_thread' | 'compress' | 'login';
    url?: string;
  };
  upgradeTarget?: 'basic' | 'premium';
  dismissible: boolean;
  showUpgradeCard?: boolean;
}

/**
 * Generate appropriate error messages based on user tier and error type
 */
export class MessageGenerator {
  
  /**
   * AI Request Rate Limit Messages
   */
  static aiRequestLimitExceeded(userTier: UserTier, remaining?: { hourly?: number; daily?: number }): NotificationMessage {
    const messages = {
      anonymous: {
        title: "Whoa there, speed racer! 🏎️",
        message: "Anonymous users get 5 AI requests per day. You've used them all up! Sign up to unlock way more.",
        actionButton: { text: "Sign Up for More", action: 'login' as const }
      },
      free: {
        title: "You're on fire today! 🔥", 
        message: `Free users get 25 AI requests daily. You've maxed out! ${remaining?.daily ? `${remaining.daily} left today.` : 'Upgrade for 80 daily requests.'}`,
        actionButton: { text: "Upgrade to Basic", action: 'upgrade' as const }
      },
      basic: {
        title: "Impressive chatting! 💬",
        message: `Basic users get 80 AI requests daily. You've hit the limit! ${remaining?.daily ? `${remaining.daily} left today.` : 'Upgrade to Premium for 200 daily requests.'}`,
        actionButton: { text: "Upgrade to Premium", action: 'upgrade' as const }
      },
      premium: {
        title: "Even premiums need breaks! ☕",
        message: "You've reached the Premium daily limit of 200 AI requests. That's some serious AI chatting! Try again tomorrow.",
        actionButton: { text: "Got it", action: 'retry' as const }
      }
    };

    const msg = messages[userTier];
    return {
      ...msg,
      type: 'warning',
      upgradeTarget: userTier === 'free' ? 'basic' : userTier === 'basic' ? 'premium' : undefined,
      dismissible: true,
      showUpgradeCard: userTier !== 'premium'
    };
  }

  /**
   * Message Token Limit Messages
   */
  static messageTokenLimitExceeded(userTier: UserTier, tokenCount: number, limit: number): NotificationMessage {
    const messages = {
      anonymous: {
        title: "That's a novel, not a message! 📚",
        message: `Anonymous users can send up to 8K tokens per message. Yours is ${Math.round(tokenCount/1000)}K tokens. Sign up for longer messages!`,
        actionButton: { text: "Sign Up", action: 'login' as const }
      },
      free: {
        title: "Epic message detected! 📝",
        message: `Free users get 16K tokens per message. Yours is ${Math.round(tokenCount/1000)}K tokens. Try shortening it, or upgrade for 32K token messages!`,
        actionButton: { text: "Upgrade to Basic", action: 'upgrade' as const }
      },
      basic: {
        title: "That's a masterpiece! ✍️",
        message: `Basic users get 32K tokens per message. Yours is ${Math.round(tokenCount/1000)}K tokens. Consider breaking it up, or upgrade for 128K token messages!`,
        actionButton: { text: "Upgrade to Premium", action: 'upgrade' as const }
      },
      premium: {
        title: "Even War and Peace has limits! 📖",
        message: `Premium users get 128K tokens per message. Yours is ${Math.round(tokenCount/1000)}K tokens. Maybe try splitting this epic into multiple messages?`,
        actionButton: { text: "Split Message", action: 'retry' as const }
      }
    };

    const msg = messages[userTier];
    return {
      ...msg,
      type: 'error',
      upgradeTarget: userTier === 'free' ? 'basic' : userTier === 'basic' ? 'premium' : undefined,
      dismissible: true,
      showUpgradeCard: userTier !== 'premium'
    };
  }

  /**
   * Context Window Full Messages
   */
  static contextWindowFull(userTier: UserTier, percentage: number, canCompress: boolean): NotificationMessage {
    const messages = {
      anonymous: {
        title: "Conversation getting cozy! 🏠",
        message: `This chat is ${Math.round(percentage)}% full (32K token limit). Sign up for longer conversations with 128K tokens!`,
        actionButton: { text: "Sign Up", action: 'login' as const }
      },
      free: {
        title: "This conversation is epic! 🚀",
        message: `Your chat is ${Math.round(percentage)}% full (128K tokens). Start a new thread or upgrade for 512K token conversations!`,
        actionButton: { text: "New Thread", action: 'new_thread' as const }
      },
      basic: {
        title: "Marathon conversation! 🏃‍♀️",
        message: `Your chat is ${Math.round(percentage)}% full (512K tokens). Start fresh or upgrade to Premium for 2M tokens + smart compression!`,
        actionButton: { text: canCompress ? "Upgrade for Auto-Compress" : "New Thread", action: canCompress ? 'upgrade' as const : 'new_thread' as const }
      },
      premium: {
        title: "Conversation champion! 🏆",
        message: `Your chat is ${Math.round(percentage)}% full (2M tokens). Don't worry, I'll automatically compress older messages to keep the conversation flowing!`,
        actionButton: { text: "Auto-Compress", action: 'compress' as const }
      }
    };

    const msg = messages[userTier];
    return {
      ...msg,
      type: userTier === 'premium' ? 'info' : 'warning',
      upgradeTarget: userTier === 'free' ? 'basic' : userTier === 'basic' ? 'premium' : undefined,
      dismissible: userTier === 'premium',
      showUpgradeCard: userTier !== 'premium'
    };
  }

  /**
   * Concurrent Room Limit Messages
   */
  static concurrentRoomLimitExceeded(userTier: UserTier, currentCount: number, maxAllowed: number, currentRooms: string[]): NotificationMessage {
    const roomList = currentRooms.length > 0 ? `Currently in: ${currentRooms.slice(0, 2).join(', ')}${currentRooms.length > 2 ? '...' : ''}` : '';
    
    const messages = {
      anonymous: {
        title: "One room at a time! 🚪",
        message: `Anonymous users can only be in 1 room. ${roomList} Sign up to join up to 3 rooms simultaneously!`,
        actionButton: { text: "Sign Up", action: 'login' as const }
      },
      free: {
        title: "Room hopping limit reached! 🏠",
        message: `Free users can be in ${maxAllowed} rooms max. You're in ${currentCount} rooms. ${roomList} Upgrade for 5 concurrent rooms!`,
        actionButton: { text: "Upgrade to Basic", action: 'upgrade' as const }
      },
      basic: {
        title: "Popular person alert! 🎉",
        message: `Basic users can be in ${maxAllowed} rooms max. You're in ${currentCount} rooms. ${roomList} Upgrade to Premium for 15 concurrent rooms!`,
        actionButton: { text: "Upgrade to Premium", action: 'upgrade' as const }
      },
      premium: {
        title: "Room management master! 🏰",
        message: `Even Premium users have limits! You're in ${currentCount}/${maxAllowed} rooms. ${roomList} Consider leaving some rooms first.`,
        actionButton: { text: "Manage Rooms", action: 'retry' as const }
      }
    };

    const msg = messages[userTier];
    return {
      ...msg,
      type: 'warning',
      upgradeTarget: userTier === 'free' ? 'basic' : userTier === 'basic' ? 'premium' : undefined,
      dismissible: true,
      showUpgradeCard: userTier !== 'premium'
    };
  }

  /**
   * Room Creation Limit Messages
   */
  static roomCreationLimitExceeded(userTier: UserTier): NotificationMessage {
    const messages = {
      anonymous: {
        title: "Hold up, room creator! 🛠️",
        message: "Anonymous users can't create rooms. Sign up to start creating your own chat rooms!",
        actionButton: { text: "Sign Up to Create", action: 'login' as const }
      },
      free: {
        title: "Room creation on cooldown! ⏰",
        message: "Free users can create 2 rooms per hour. You've hit that limit! Upgrade to Basic for 5 rooms per hour.",
        actionButton: { text: "Upgrade to Basic", action: 'upgrade' as const }
      },
      basic: {
        title: "Prolific room builder! 🏗️",
        message: "Basic users can create 5 rooms per hour. You've maxed out! Upgrade to Premium for 15 rooms per hour.",
        actionButton: { text: "Upgrade to Premium", action: 'upgrade' as const }
      },
      premium: {
        title: "Room creation champion! 🎪",
        message: "Even Premium users have limits! You've created 15 rooms this hour. Take a breather and try again in a bit.",
        actionButton: { text: "Wait & Retry", action: 'retry' as const }
      }
    };

    const msg = messages[userTier];
    return {
      ...msg,
      type: 'warning',
      upgradeTarget: userTier === 'free' ? 'basic' : userTier === 'basic' ? 'premium' : undefined,
      dismissible: true,
      showUpgradeCard: userTier !== 'premium'
    };
  }

  /**
   * File Upload Limit Messages
   */
  static fileUploadLimitExceeded(userTier: UserTier): NotificationMessage {
    const messages = {
      anonymous: {
        title: "Easy on the uploads! 📁",
        message: "Anonymous users get 1 upload per hour. You've used it! Sign up for more upload power.",
        actionButton: { text: "Sign Up", action: 'login' as const }
      },
      free: {
        title: "Upload enthusiasm detected! 📤",
        message: "Free users get 3 uploads per hour. You've used them all! Upgrade to Basic for 8 uploads per hour.",
        actionButton: { text: "Upgrade to Basic", action: 'upgrade' as const }
      },
      basic: {
        title: "File sharing superstar! ⭐",
        message: "Basic users get 8 uploads per hour. You've hit the limit! Upgrade to Premium for 20 uploads per hour.",
        actionButton: { text: "Upgrade to Premium", action: 'upgrade' as const }
      },
      premium: {
        title: "Upload machine! 🚀",
        message: "Premium users get 20 uploads per hour. Even you have limits! Try again in a bit.",
        actionButton: { text: "Wait & Retry", action: 'retry' as const }
      }
    };

    const msg = messages[userTier];
    return {
      ...msg,
      type: 'warning',
      upgradeTarget: userTier === 'free' ? 'basic' : userTier === 'basic' ? 'premium' : undefined,
      dismissible: true,
      showUpgradeCard: userTier !== 'premium'
    };
  }

  /**
   * Emergency Circuit Breaker Messages
   */
  static systemEmergencyMode(actionType: 'ai_disabled' | 'queue_enabled' | 'captcha_required' | 'uploads_disabled'): NotificationMessage {
    const messages = {
      ai_disabled: {
        title: "System taking a breather! 😅",
        message: "We're experiencing high AI demand. Anonymous AI is temporarily paused. Sign up for priority access!",
        actionButton: { text: "Sign Up for Priority", action: 'login' as const }
      },
      queue_enabled: {
        title: "Popular place today! 🎢",
        message: "High traffic detected! Messages are being queued to ensure quality responses. Your message will be processed shortly.",
        actionButton: { text: "Got it", action: 'retry' as const }
      },
      captcha_required: {
        title: "Beep boop, human check! 🤖",
        message: "High registration activity detected. Please complete a quick captcha to verify you're human.",
        actionButton: { text: "Verify Human", action: 'retry' as const }
      },
      uploads_disabled: {
        title: "File server needs coffee! ☕",
        message: "Upload servers are taking a quick break due to high activity. File uploads will be back shortly!",
        actionButton: { text: "Retry Later", action: 'retry' as const }
      }
    };

    const msg = messages[actionType];
    return {
      ...msg,
      type: 'warning',
      dismissible: false,
      showUpgradeCard: actionType === 'ai_disabled'
    };
  }

  /**
   * Success Messages with Upgrade Hints
   */
  static successWithUpgradeHint(userTier: UserTier, action: string): NotificationMessage {
    if (userTier === 'premium') {
      return {
        title: "Mission accomplished! 🎯",
        message: `${action} completed successfully. You're already on Premium - living the good life!`,
        type: 'success',
        dismissible: true,
        showUpgradeCard: false
      };
    }

    const upgradeHints = {
      anonymous: {
        message: `${action} completed! Sign up to unlock even more features and higher limits.`,
        actionButton: { text: "Explore Plans", action: 'login' as const }
      },
      free: {
        message: `${action} completed! Upgrade to Basic for more AI requests, longer messages, and additional features.`,
        actionButton: { text: "See Basic Features", action: 'upgrade' as const }
      },
      basic: {
        message: `${action} completed! Upgrade to Premium for unlimited features and priority support.`,
        actionButton: { text: "Go Premium", action: 'upgrade' as const }
      }
    };

    const hint = upgradeHints[userTier as keyof typeof upgradeHints];
    return {
      title: "Success! ✨",
      message: hint.message,
      type: 'success',
      actionButton: hint.actionButton,
      upgradeTarget: userTier === 'free' ? 'basic' : 'premium',
      dismissible: true,
      showUpgradeCard: false
    };
  }

  /**
   * Generic Error with Friendly Tone
   */
  static genericError(message: string): NotificationMessage {
    const friendlyMessages = [
      "Oops, something went sideways! 🤷‍♀️",
      "Well, that didn't go as planned! 😅", 
      "Houston, we have a problem! 🚀",
      "Uh oh, gremlins in the machine! 🔧",
      "That's not supposed to happen! 🤔"
    ];

    return {
      title: friendlyMessages[Math.floor(Math.random() * friendlyMessages.length)],
      message: message || "Something unexpected happened. Our team has been notified!",
      type: 'error',
      actionButton: { text: "Try Again", action: 'retry' },
      dismissible: true,
      showUpgradeCard: false
    };
  }
}

/**
 * Helper function to get appropriate upgrade pricing
 */
export function getUpgradePricing(target: 'basic' | 'premium'): { price: string; features: string[] } {
  if (target === 'basic') {
    return {
      price: '$10/month',
      features: [
        '80 AI requests daily',
        '32K tokens per message', 
        '5 concurrent rooms',
        '8 file uploads hourly',
        'Priority support'
      ]
    };
  } else {
    return {
      price: '$50/month', 
      features: [
        '200 AI requests daily',
        '128K tokens per message',
        '15 concurrent rooms', 
        '20 file uploads hourly',
        'Smart context compression',
        'Advanced AI models',
        'Priority processing'
      ]
    };
  }
}