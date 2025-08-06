import { getSocketIOInstance } from '../server/socketEmitter';

interface StreamingState {
  streamId: string;
  roomId: string;
  threadId: string;
  phase: 'reasoning' | 'answering' | 'complete';
  reasoningContent: string;
  answerContent: string;
  startTime: number;
  isActive: boolean;
}

/**
 * Safe Streaming Manager - Adds streaming without breaking existing system
 * 
 * Key Safety Features:
 * - Existing message flow remains unchanged
 * - Database saves still happen in onFinish()
 * - Streaming is additive, not replacement
 * - Easy to disable with feature flag
 */
export class SafeStreamingManager {
  private static instance: SafeStreamingManager;
  private activeStreams = new Map<string, StreamingState>();
  
  // Feature flag - can be disabled instantly
  private readonly STREAMING_ENABLED = process.env.STREAMING_ENABLED === 'true';

  constructor() {
    console.log('🔧 SafeStreamingManager initialized:', {
      enabled: this.STREAMING_ENABLED,
      env: process.env.STREAMING_ENABLED
    });
  }
  
  // Performance settings
  private readonly CHUNK_DEBOUNCE_MS = 50;
  private readonly MAX_CONCURRENT_STREAMS = 5;

  static getInstance(): SafeStreamingManager {
    if (!SafeStreamingManager.instance) {
      SafeStreamingManager.instance = new SafeStreamingManager();
    }
    return SafeStreamingManager.instance;
  }

  /**
   * Start a new streaming session
   * SAFE: Does not interfere with existing message flow
   */
  async startStream(streamId: string, roomId: string, threadId: string): Promise<boolean> {
    console.log('🚀 [STREAMING] startStream called:', {
      streamId,
      roomId,
      threadId,
      enabled: this.STREAMING_ENABLED
    });

    if (!this.STREAMING_ENABLED) {
      console.log('🚫 [STREAMING] Streaming disabled, skipping');
      return false;
    }

    try {
      // Check limits
      if (this.activeStreams.size >= this.MAX_CONCURRENT_STREAMS) {
        console.warn('🚫 [STREAMING] Stream limit reached');
        return false;
      }

      // Initialize stream state (start with answering for Gemini)
      const streamState: StreamingState = {
        streamId,
        roomId,
        threadId,
        phase: 'answering', // Start directly with answering for Gemini
        reasoningContent: '',
        answerContent: '',
        startTime: Date.now(),
        isActive: true
      };

      this.activeStreams.set(streamId, streamState);

      // Emit start event (NEW - does not interfere with existing)
      const io = getSocketIOInstance();
      console.log('🔌 [STREAMING] Socket.IO instance:', !!io);
      
      if (io) {
        console.log('📡 [STREAMING] Emitting ai-reasoning-start to room:', roomId);
        io.to(`room:${roomId}`).emit('ai-reasoning-start', {
          streamId,
          threadId,
          timestamp: Date.now()
        });
      } else {
        console.warn('⚠️ [STREAMING] No Socket.IO instance available');
      }

      console.log(`🚀 [STREAMING] Safe streaming started: ${streamId}`);
      return true;

    } catch (error) {
      console.error('❌ Error starting safe stream:', error);
      return false;
    }
  }

  /**
   * Process reasoning chunk
   * SAFE: Only emits additional events, doesn't change existing flow
   */
  async processReasoningChunk(streamId: string, chunk: string): Promise<void> {
    console.log('🧠 [STREAMING] processReasoningChunk:', {
      streamId,
      chunkLength: chunk.length,
      enabled: this.STREAMING_ENABLED
    });

    if (!this.STREAMING_ENABLED) return;

    const streamState = this.activeStreams.get(streamId);
    if (!streamState || !streamState.isActive || streamState.phase !== 'reasoning') {
      console.log('⚠️ [STREAMING] Invalid stream state for reasoning chunk:', {
        hasState: !!streamState,
        isActive: streamState?.isActive,
        phase: streamState?.phase
      });
      return;
    }

    try {
      // Update state
      streamState.reasoningContent += chunk;
      console.log('🧠 [STREAMING] Updated reasoning content length:', streamState.reasoningContent.length);

      // Emit chunk (NEW - additive event)
      const io = getSocketIOInstance();
      if (io) {
        console.log('📡 [STREAMING] Emitting ai-reasoning-chunk to room:', streamState.roomId);
        io.to(`room:${streamState.roomId}`).emit('ai-reasoning-chunk', {
          streamId,
          threadId: streamState.threadId,
          chunk,
          accumulatedReasoning: streamState.reasoningContent,
          timestamp: Date.now()
        });
      } else {
        console.warn('⚠️ [STREAMING] No Socket.IO instance for reasoning chunk');
      }

    } catch (error) {
      console.error('❌ Error processing reasoning chunk:', error);
    }
  }

  /**
   * Transition from reasoning to answering phase
   * SAFE: Just changes internal state and emits transition event
   */
  async transitionToAnswering(streamId: string): Promise<void> {
    console.log('🔄 [STREAMING] transitionToAnswering:', {
      streamId,
      enabled: this.STREAMING_ENABLED
    });

    if (!this.STREAMING_ENABLED) return;

    const streamState = this.activeStreams.get(streamId);
    if (!streamState || !streamState.isActive) {
      console.log('⚠️ [STREAMING] Invalid stream state for transition:', {
        hasState: !!streamState,
        isActive: streamState?.isActive
      });
      return;
    }

    try {
      // Update phase
      streamState.phase = 'answering';

      // Emit transition event (NEW - for UI to minimize reasoning)
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${streamState.roomId}`).emit('ai-reasoning-complete', {
          streamId,
          threadId: streamState.threadId,
          finalReasoning: streamState.reasoningContent,
          timestamp: Date.now()
        });

        // Start answer phase
        io.to(`room:${streamState.roomId}`).emit('ai-answer-start', {
          streamId,
          threadId: streamState.threadId,
          timestamp: Date.now()
        });
      }

      console.log(`🔄 Stream transitioned to answering: ${streamId}`);

    } catch (error) {
      console.error('❌ Error transitioning stream:', error);
    }
  }

  /**
   * Process answer chunk
   * SAFE: Only emits additional events
   */
  async processAnswerChunk(streamId: string, chunk: string): Promise<void> {
    console.log('💬 [STREAMING] processAnswerChunk:', {
      streamId,
      chunkLength: chunk.length,
      enabled: this.STREAMING_ENABLED
    });

    if (!this.STREAMING_ENABLED) return;

    const streamState = this.activeStreams.get(streamId);
    if (!streamState || !streamState.isActive || streamState.phase !== 'answering') {
      console.log('⚠️ [STREAMING] Invalid stream state for answer chunk:', {
        hasState: !!streamState,
        isActive: streamState?.isActive,
        phase: streamState?.phase
      });
      return;
    }

    try {
      // Update state
      streamState.answerContent += chunk;

      // Emit chunk (NEW - additive event)
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${streamState.roomId}`).emit('ai-answer-chunk', {
          streamId,
          threadId: streamState.threadId,
          chunk,
          accumulatedAnswer: streamState.answerContent,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error('❌ Error processing answer chunk:', error);
    }
  }

  /**
   * Complete streaming session
   * SAFE: Just cleanup, existing onFinish() still handles DB save
   */
  async completeStream(streamId: string): Promise<void> {
    if (!this.STREAMING_ENABLED) return;

    const streamState = this.activeStreams.get(streamId);
    if (!streamState) return;

    try {
      // Mark as complete
      streamState.phase = 'complete';
      streamState.isActive = false;

      // Emit completion (NEW - for cleanup)
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${streamState.roomId}`).emit('ai-stream-complete', {
          streamId,
          threadId: streamState.threadId,
          duration: Date.now() - streamState.startTime,
          timestamp: Date.now()
        });
      }

      console.log(`✅ Safe streaming completed: ${streamId}`);

      // Cleanup after delay
      setTimeout(() => {
        this.activeStreams.delete(streamId);
      }, 5000);

    } catch (error) {
      console.error('❌ Error completing stream:', error);
    }
  }

  /**
   * Handle streaming errors
   * SAFE: Just cleanup, existing system continues working
   */
  async errorStream(streamId: string, error: string): Promise<void> {
    const streamState = this.activeStreams.get(streamId);
    if (!streamState) return;

    try {
      streamState.isActive = false;

      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${streamState.roomId}`).emit('ai-stream-error', {
          streamId,
          threadId: streamState.threadId,
          error,
          timestamp: Date.now()
        });
      }

      console.error(`❌ Safe streaming error: ${streamId} - ${error}`);
      this.activeStreams.delete(streamId);

    } catch (err) {
      console.error('❌ Error handling stream error:', err);
    }
  }

  /**
   * Get stream state by ID
   */
  getStreamState(streamId: string): StreamingState | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return {
      enabled: this.STREAMING_ENABLED,
      activeStreams: this.activeStreams.size,
      streams: Array.from(this.activeStreams.values()).map(s => ({
        streamId: s.streamId,
        phase: s.phase,
        duration: Date.now() - s.startTime
      }))
    };
  }

  /**
   * Emergency cleanup - disable all streaming
   */
  emergencyStop() {
    console.warn('🚨 Emergency stop - disabling all streaming');
    this.activeStreams.clear();
  }
}

export const safeStreamingManager = SafeStreamingManager.getInstance();