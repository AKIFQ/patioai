/**
 * Unified User Identification System
 * Handles both authenticated and anonymous users consistently across Socket.IO and API
 */

export interface UserIdentity {
  /** Primary identifier used for socket authentication and channel joining */
  socketId: string;
  /** User UUID for authenticated users, null for anonymous */
  userId: string | null;
  /** Display name shown in UI */
  displayName: string;
  /** Session identifier for room participation */
  sessionId: string;
  /** Whether this is an authenticated user */
  isAuthenticated: boolean;
}

/**
 * Creates a consistent user identity for both authenticated and anonymous users
 */
export function createUserIdentity(
  userId: string | null,
  displayName: string
): UserIdentity {
  const isAuthenticated = !!userId;
  
  return {
    // CRITICAL: Use consistent identifier for socket channels
    // Format: "auth:{userId}" for authenticated, "anon:{displayName}" for anonymous
    socketId: isAuthenticated ? `auth:${userId}` : `anon:${displayName}`,
    userId,
    displayName,
    sessionId: isAuthenticated ? `auth_${userId}` : `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    isAuthenticated
  };
}

/**
 * Extracts user identity from socket authentication token
 */
export function parseSocketToken(token: string): UserIdentity {
  if (token.startsWith('auth:')) {
    // Authenticated user: "auth:{userId}"
    const userId = token.substring(5);
    return {
      socketId: token,
      userId,
      displayName: userId, // Will be resolved from database
      sessionId: `auth_${userId}`,
      isAuthenticated: true
    };
  } else {
    // Anonymous user: "anon:{displayName}" or legacy displayName
    const displayName = token.startsWith('anon:') ? token.substring(5) : token;
    return {
      socketId: `anon:${displayName}`,
      userId: null,
      displayName,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      isAuthenticated: false
    };
  }
}

/**
 * Gets the appropriate socket token for authentication
 */
export function getSocketToken(userId: string | null, displayName: string): string {
  return userId ? `auth:${userId}` : `anon:${displayName}`;
}

/**
 * Gets all possible user channel identifiers for event emission
 * Returns array of channels to emit to for backward compatibility
 */
export function getUserChannels(identity: UserIdentity): string[] {
  const channels = [`user:${identity.socketId}`];
  
  // For authenticated users, also emit to legacy UUID channel for backward compatibility
  if (identity.isAuthenticated && identity.userId) {
    channels.push(`user:${identity.userId}`);
  }
  
  // For anonymous users, also emit to legacy displayName channel for backward compatibility
  if (!identity.isAuthenticated) {
    channels.push(`user:${identity.displayName}`);
  }
  
  return channels;
}