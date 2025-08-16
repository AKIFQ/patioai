export type UserTier = 'anonymous' | 'free' | 'basic' | 'premium';

export type ResourceKey =
  | 'ai_requests'
  | 'reasoning_messages'
  | 'room_creation'
  | 'file_uploads'
  | 'room_switch_attempts';

interface Limits {
  hourly?: number;
  daily?: number;
  monthly?: number;
}

type TierMatrix = Record<ResourceKey, Limits>;

interface TierConfig {
  resources: TierMatrix;
  concurrentRooms?: number;
  roomThreadLimit?: number;
  fileSizeMB?: number;
  storageMB?: number;
  perMessageInputTokens?: number;
  contextWindowTokens?: number;
}

export const TIER_LIMITS: Record<UserTier, TierConfig> = {
  anonymous: {
    resources: {
      reasoning_messages: { hourly: 15, daily: 50 },
      ai_requests: { hourly: 5, daily: 15 },
      room_creation: { hourly: 0, daily: 0 },
      file_uploads: { hourly: 1, daily: 2 },
      room_switch_attempts: { hourly: 10, daily: 50 }
    },
    concurrentRooms: 1,
    roomThreadLimit: 30,
    fileSizeMB: 5,
    storageMB: 50,
    perMessageInputTokens: 8000,
    contextWindowTokens: 32000
  },
  free: {
    resources: {
      reasoning_messages: { hourly: 30, daily: 100, monthly: 2000 },
      ai_requests: { hourly: 8, daily: 25, monthly: 400 },
      room_creation: { hourly: 2, daily: 5, monthly: 50 },
      file_uploads: { hourly: 3, daily: 8, monthly: 100 },
      room_switch_attempts: { hourly: 50, daily: 200 }
    },
    concurrentRooms: 3,
    roomThreadLimit: 30,
    fileSizeMB: 5,
    storageMB: 50,
    perMessageInputTokens: 16000,
    contextWindowTokens: 128000
  },
  basic: {
    resources: {
      reasoning_messages: { hourly: 80, daily: 300, monthly: 8000 },
      ai_requests: { hourly: 25, daily: 80, monthly: 1500 },
      room_creation: { hourly: 5, daily: 15, monthly: 200 },
      file_uploads: { hourly: 8, daily: 25, monthly: 400 },
      room_switch_attempts: { hourly: 100, daily: 400 }
    },
    concurrentRooms: 5,
    roomThreadLimit: 60,
    fileSizeMB: 15,
    storageMB: 500,
    perMessageInputTokens: 32000,
    contextWindowTokens: 512000
  },
  premium: {
    resources: {
      reasoning_messages: { hourly: 200, daily: 800, monthly: 20000 },
      ai_requests: { hourly: 60, daily: 200, monthly: 4000 },
      room_creation: { hourly: 15, daily: 50, monthly: 1000 },
      file_uploads: { hourly: 20, daily: 80, monthly: 1500 },
      room_switch_attempts: { hourly: 300, daily: 1200 }
    },
    concurrentRooms: 15,
    roomThreadLimit: 200,
    fileSizeMB: 50,
    storageMB: 5000,
    perMessageInputTokens: 128000,
    contextWindowTokens: 2000000
  }
};

export function getTierLimits(tier: UserTier): TierConfig {
  return TIER_LIMITS[tier];
}

export function getPeriodStart(period: 'hour' | 'day' | 'month'): string {
  const now = new Date();
  if (period === 'hour') {
    now.setMinutes(0, 0, 0);
  } else if (period === 'day') {
    now.setHours(0, 0, 0, 0);
  } else {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

