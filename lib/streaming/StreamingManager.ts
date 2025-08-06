import { getSocketIOInstance } from '../server/socketEmitter';

interface StreamState {
  id: string;
  roomId: string;
  threadId: string;
  content: string;
  startTime: number;
  lastChunk: number;
  isActive: boolean;
  chunkCount: number;
}

interface ChunkBuffer {
  content: string;
  timer: NodeJS.Timeout | null;
  lastFlush: number;
}

export class StreamingManager {
  private static instance: StreamingManager;
  private activeStreams = new Map<string, StreamState>();
  private chunkBuffers = new Map<string, ChunkBuffer>();
  
  // Configuration
  private readonly CHUNK_BATCH_TIMEOUT = 50; // ms
  private readonly MAX_CHUNK_SIZE = 100; // characters
  private readonly STREAM_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_CONCURRENT_STREAMS = 10;

  static getInstance(): StreamingManager {
    if (!StreamingManager.instance) {
      StreamingManager.instance = new StreamingManager();
    }
    return StreamingManager.instance;
  }

  async startStream(streamId: string, roomId: string, threadId: string, senderName: string = 'AI Assistant'): Promise<boolean> {
    try {
      // Check concurrent stream limit
      const activeCount = Array.from(this.activeStreams.values()).filter(s => s.isActive).length;
      if (activeCount >= this.MAX_CONCURRENT_STREAMS) {
        console.warn(`🚫 Stream limit reached: ${activeCount}/${this.MAX_CONCURRENT_STREAMS}`);
        return false;
      }

      // Initialize stream state
      const streamState: StreamState = {
        id: streamId,
        roomId,
        threadId,
        content: '',
        startTime: Date.now(),
        lastChunk: Date.now(),
        isActive: true,
        chunkCount: 0
      };

      this.activeStreams.set(streamId, streamState);
      
      // Initialize chunk buffer
      this.chunkBuffers.set(streamId, {
        content: '',
        timer: null,
        lastFlush: Date.now()
      });

      // Emit stream start event
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${roomId}`).emit('ai-stream-start', {
          streamId,
          threadId,
          senderName,
          timestamp: Date.now()
        });
        console.log(`🚀 Stream started: ${streamId} for room ${roomId}`);
      }

      // Set stream timeout
      setTimeout(() => {
        this.timeoutStream(streamId);
      }, this.STREAM_TIMEOUT);

      return true;
    } catch (error) {
      console.error('❌ Error starting stream:', error);
      return false;
    }
  }

  async processChunk(streamId: string, chunk: string): Promise<void> {
    try {
      const streamState = this.activeStreams.get(streamId);
      const chunkBuffer = this.chunkBuffers.get(streamId);
      
      if (!streamState || !streamState.isActive || !chunkBuffer) {
        console.warn(`⚠️ Stream not found or inactive: ${streamId}`);
        return;
      }

      // Update stream state
      streamState.content += chunk;
      streamState.lastChunk = Date.now();
      streamState.chunkCount++;

      // Add to buffer
      chunkBuffer.content += chunk;

      // Flush buffer if it's large enough or enough time has passed
      const shouldFlush = 
        chunkBuffer.content.length >= this.MAX_CHUNK_SIZE ||
        Date.now() - chunkBuffer.lastFlush >= this.CHUNK_BATCH_TIMEOUT;

      if (shouldFlush) {
        this.flushChunkBuffer(streamId);
      } else if (!chunkBuffer.timer) {
        // Set timer to flush after timeout
        chunkBuffer.timer = setTimeout(() => {
          this.flushChunkBuffer(streamId);
        }, this.CHUNK_BATCH_TIMEOUT);
      }

    } catch (error) {
      console.error('❌ Error processing chunk:', error);
      this.errorStream(streamId, error.message);
    }
  }

  private flushChunkBuffer(streamId: string): void {
    const chunkBuffer = this.chunkBuffers.get(streamId);
    const streamState = this.activeStreams.get(streamId);
    
    if (!chunkBuffer || !streamState || !chunkBuffer.content) {
      return;
    }

    try {
      const io = getSocketIOInstance();
      if (io && streamState.isActive) {
        io.to(`room:${streamState.roomId}`).emit('ai-stream-chunk', {
          streamId,
          threadId: streamState.threadId,
          chunk: chunkBuffer.content,
          accumulatedText: streamState.content,
          chunkIndex: streamState.chunkCount,
          timestamp: Date.now()
        });
      }

      // Reset buffer
      chunkBuffer.content = '';
      chunkBuffer.lastFlush = Date.now();
      if (chunkBuffer.timer) {
        clearTimeout(chunkBuffer.timer);
        chunkBuffer.timer = null;
      }

    } catch (error) {
      console.error('❌ Error flushing chunk buffer:', error);
    }
  }

  async completeStream(streamId: string, finalText: string, reasoning?: string, sources?: any[]): Promise<void> {
    try {
      const streamState = this.activeStreams.get(streamId);
      if (!streamState) {
        console.warn(`⚠️ Stream not found for completion: ${streamId}`);
        return;
      }

      // Flush any remaining chunks
      this.flushChunkBuffer(streamId);

      // Mark as inactive
      streamState.isActive = false;

      // Emit completion event
      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${streamState.roomId}`).emit('ai-stream-complete', {
          streamId,
          threadId: streamState.threadId,
          finalText,
          reasoning,
          sources,
          duration: Date.now() - streamState.startTime,
          chunkCount: streamState.chunkCount,
          timestamp: Date.now()
        });
      }

      console.log(`✅ Stream completed: ${streamId} (${streamState.chunkCount} chunks, ${Date.now() - streamState.startTime}ms)`);

      // Cleanup after a delay to allow client processing
      setTimeout(() => {
        this.cleanupStream(streamId);
      }, 5000);

    } catch (error) {
      console.error('❌ Error completing stream:', error);
      this.errorStream(streamId, error.message);
    }
  }

  private errorStream(streamId: string, errorMessage: string): void {
    try {
      const streamState = this.activeStreams.get(streamId);
      if (!streamState) return;

      streamState.isActive = false;

      const io = getSocketIOInstance();
      if (io) {
        io.to(`room:${streamState.roomId}`).emit('ai-stream-error', {
          streamId,
          threadId: streamState.threadId,
          error: errorMessage,
          timestamp: Date.now()
        });
      }

      console.error(`❌ Stream error: ${streamId} - ${errorMessage}`);
      this.cleanupStream(streamId);

    } catch (error) {
      console.error('❌ Error handling stream error:', error);
    }
  }

  private timeoutStream(streamId: string): void {
    const streamState = this.activeStreams.get(streamId);
    if (streamState && streamState.isActive) {
      console.warn(`⏰ Stream timeout: ${streamId}`);
      this.errorStream(streamId, 'Stream timeout');
    }
  }

  private cleanupStream(streamId: string): void {
    // Clean up stream state
    this.activeStreams.delete(streamId);
    
    // Clean up chunk buffer
    const chunkBuffer = this.chunkBuffers.get(streamId);
    if (chunkBuffer?.timer) {
      clearTimeout(chunkBuffer.timer);
    }
    this.chunkBuffers.delete(streamId);

    console.log(`🧹 Stream cleaned up: ${streamId}`);
  }

  // Utility methods
  getActiveStreamCount(): number {
    return Array.from(this.activeStreams.values()).filter(s => s.isActive).length;
  }

  getStreamState(streamId: string): StreamState | undefined {
    return this.activeStreams.get(streamId);
  }

  // Cleanup all streams (for shutdown)
  cleanup(): void {
    for (const [streamId] of this.activeStreams) {
      this.cleanupStream(streamId);
    }
  }
}

export const streamingManager = StreamingManager.getInstance();