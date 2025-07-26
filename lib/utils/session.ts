// Utility functions for managing room sessions

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return generateSessionId();
  }

  let sessionId = localStorage.getItem('room_session_id');
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem('room_session_id', sessionId);
  }
  return sessionId;
}

export function getStoredDisplayName(shareCode: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(`room_${shareCode}_displayName`);
}

export function storeDisplayName(shareCode: string, displayName: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(`room_${shareCode}_displayName`, displayName);
}

export function clearRoomSession(shareCode?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  if (shareCode) {
    localStorage.removeItem(`room_${shareCode}_displayName`);
  } else {
    // Clear all room-related data
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('room_') && key.endsWith('_displayName')) {
        localStorage.removeItem(key);
      }
    });
  }
}