import { useReducer, useCallback, useRef } from 'react';

// Action types for state management
export type StateAction<T> = 
  | { type: 'SET'; payload: T }
  | { type: 'UPDATE'; payload: Partial<T> }
  | { type: 'RESET'; payload?: T };

// Atomic state manager to prevent race conditions
export function atomicStateReducer<T extends Record<string, any>>(
  state: T,
  action: StateAction<T>
): T {
  switch (action.type) {
    case 'SET':
      return action.payload;
    case 'UPDATE':
      return { ...state, ...action.payload };
    case 'RESET':
      return action.payload || ({} as T);
    default:
      return state;
  }
}

// Hook for atomic state management
export function useAtomicState<T extends Record<string, any>>(
  initialState: T
) {
  const [state, dispatch] = useReducer(atomicStateReducer<T>, initialState);
  const lockRef = useRef<Set<string>>(new Set());

  const setState = useCallback((newState: T) => {
    dispatch({ type: 'SET', payload: newState });
  }, []);

  const updateState = useCallback((updates: Partial<T>) => {
    dispatch({ type: 'UPDATE', payload: updates });
  }, []);

  const resetState = useCallback((newInitialState?: T) => {
    dispatch({ type: 'RESET', payload: newInitialState });
  }, []);

  // Atomic operation with locking
  const atomicUpdate = useCallback(async <R>(
    key: string,
    operation: (currentState: T) => Promise<{ newState: Partial<T>; result?: R }> | { newState: Partial<T>; result?: R }
  ): Promise<R | undefined> => {
    // Check if operation is already in progress
    if (lockRef.current.has(key)) {
console.warn(` Atomic operation '${key}' already in progress, skipping`);
      return undefined;
    }

    // Acquire lock
    lockRef.current.add(key);

    try {
      const result = await operation(state);
      
      // Apply state changes atomically
      if (Object.keys(result.newState).length > 0) {
        dispatch({ type: 'UPDATE', payload: result.newState });
      }
      
      return result.result;
    } catch (error) {
console.error(` Error in atomic operation '${key}':`, error);
      throw error;
    } finally {
      // Release lock
      lockRef.current.delete(key);
    }
  }, [state]);

  return {
    state,
    setState,
    updateState,
    resetState,
    atomicUpdate,
    isLocked: (key: string) => lockRef.current.has(key)
  };
}

// Submission state interface for chat
export interface ChatSubmissionState {
  isSubmitting: boolean;
  lastSubmissionTime: number;
  submissionCount: number;
  pendingMessages: string[];
  errors: string[];
}

// Chat-specific atomic state hook
export function useChatSubmissionState() {
  const initialState: ChatSubmissionState = {
    isSubmitting: false,
    lastSubmissionTime: 0,
    submissionCount: 0,
    pendingMessages: [],
    errors: []
  };

  const {
    state,
    updateState,
    atomicUpdate,
    isLocked
  } = useAtomicState(initialState);

  const startSubmission = useCallback(async (messageId: string) => {
    return atomicUpdate('submit', async (currentState) => {
      if (currentState.isSubmitting) {
        throw new Error('Submission already in progress');
      }

      const now = Date.now();
      
      // Prevent rapid-fire submissions (debounce) - 1 second for AI operations
      if (now - currentState.lastSubmissionTime < 1000) {
        throw new Error('Please wait before sending another message');
      }

      return {
        newState: {
          isSubmitting: true,
          lastSubmissionTime: now,
          submissionCount: currentState.submissionCount + 1,
          pendingMessages: [...currentState.pendingMessages, messageId],
          errors: [] // Clear previous errors on new submission
        },
        result: { messageId, timestamp: now }
      };
    });
  }, [atomicUpdate]);

  const finishSubmission = useCallback((messageId: string, error?: string) => {
    return atomicUpdate('finish', async (currentState) => {
      const updatedPendingMessages = currentState.pendingMessages.filter(id => id !== messageId);
      const newErrors = error 
        ? [...currentState.errors.slice(-4), error] // Keep last 5 errors
        : currentState.errors;

      return {
        newState: {
          isSubmitting: updatedPendingMessages.length > 0, // Still submitting if other messages pending
          pendingMessages: updatedPendingMessages,
          errors: newErrors
        }
      };
    });
  }, [atomicUpdate]);

  const clearErrors = useCallback(() => {
    updateState({ errors: [] });
  }, [updateState]);

  return {
    state,
    startSubmission,
    finishSubmission,
    clearErrors,
    isSubmitting: isLocked('submit') || state.isSubmitting,
    hasPendingMessages: state.pendingMessages.length > 0
  };
}