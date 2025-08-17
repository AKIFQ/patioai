import type { Socket } from 'socket.io-client';

export interface QueuedMessage {
  id: string;
  event: string;
  data: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

export interface MessageQueueOptions {
  maxRetries?: number;
  retryDelay?: number;
  queueSize?: number;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private options: Required<MessageQueueOptions>;

  constructor(private socket: Socket, options: MessageQueueOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      queueSize: options.queueSize ?? 100
    };
  }

  /**
   * Add a message to the queue
   */
  async enqueue(event: string, data: any, priority: 'high' | 'normal' = 'normal'): Promise<string> {
    const messageId = crypto.randomUUID();
    const queuedMessage: QueuedMessage = {
      id: messageId,
      event,
      data,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: this.options.maxRetries
    };

    // Prevent queue overflow
    if (this.queue.length >= this.options.queueSize) {
console.warn(' Message queue full, removing oldest message');
      this.queue.shift();
    }

    if (priority === 'high') {
      this.queue.unshift(queuedMessage);
    } else {
      this.queue.push(queuedMessage);
    }

    // Debug logging removed

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return messageId;
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    // Debug logging removed

    while (this.queue.length > 0) {
      const message = this.queue[0]; // Peek at first message
      
      try {
        const success = await this.sendMessage(message);
        
        if (success) {
          // Message sent successfully, remove from queue
          this.queue.shift();
          // Debug logging removed
        } else {
          // Failed to send, increment retry count
          message.retries++;
          
          if (message.retries >= message.maxRetries) {
            // Max retries reached, remove from queue
            this.queue.shift();
console.error(` Message failed after ${message.maxRetries} retries: ${message.event} (ID: ${message.id})`);
          } else {
            // Wait before retrying
console.warn(` Message failed, retrying (${message.retries}/${message.maxRetries}): ${message.event} (ID: ${message.id})`);
            await this.delay(this.options.retryDelay * message.retries); // Exponential backoff
          }
        }
      } catch (error) {
console.error(' Error processing message:', error);
        // Move to next message on unexpected errors
        this.queue.shift();
      }
    }

    this.processing = false;
    // Debug logging removed
  }

  /**
   * Attempt to send a single message
   */
  private async sendMessage(message: QueuedMessage): Promise<boolean> {
    if (!this.socket.connected) {
      // Debug logging removed
      return false;
    }

    try {
      // For critical events that need acknowledgment to ensure delivery
      const criticalEvents = ['invoke-ai', 'join-room', 'leave-room'];
      const usesAck = criticalEvents.includes(message.event);
      
      if (usesAck) {
        // Use emit with acknowledgment
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
console.warn(' Message timeout:', message.event);
            resolve(false);
          }, 10000); // Increased timeout for AI operations

          this.socket.emit(message.event, message.data, (ack: any) => {
            clearTimeout(timeout);
            if (ack?.error) {
console.error(' Message acknowledged with error:', ack.error);
              resolve(false);
            } else {
              // Debug logging removed
              resolve(true);
            }
          });
        });
      } else {
        // For non-critical events like typing, send without acknowledgment
        this.socket.emit(message.event, message.data);
        return true;
      }
    } catch (error) {
console.error(' Error sending message:', error);
      return false;
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      oldest: this.queue.length > 0 ? this.queue[0].timestamp : null
    };
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
    this.processing = false;
    // Debug logging removed
  }
}