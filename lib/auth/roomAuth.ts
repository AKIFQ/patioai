// Room authentication utilities for anonymous users
import { useRouter } from 'next/navigation';

/**
 * Triggers signin page for anonymous users in rooms
 * After signin, user will be redirected back to the same room with their authenticated details
 */
export function useRoomAuth() {
  const signInToRoom = () => {
    // Get current URL to return to after signin
    const currentUrl = window.location.href;
    
    // Navigate to signin page with return URL
    const signinUrl = `/signin?returnUrl=${encodeURIComponent(currentUrl)}`;
    window.location.href = signinUrl;
  };

  return { signInToRoom };
}

/**
 * Server-side function to update room participant from anonymous to authenticated
 */
export async function updateRoomParticipantToAuth(
  roomId: string, 
  sessionId: string, 
  userId: string, 
  displayName: string
) {
  try {
    const response = await fetch('/api/rooms/update-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId,
        sessionId,
        userId,
        displayName
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update participant');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating room participant:', error);
    throw error;
  }
}