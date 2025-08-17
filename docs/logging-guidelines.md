# Logging Guidelines

## Essential Logs to Keep

After cleanup, these are the **essential logs** that should remain in production:

### Server-Side Logs (Always Visible)

#### 🔧 System Events
```
📨 Room chat API received: {displayName: 'AKIF QURESHI', lastMessage: 'hi '}
✅ Message saved: {isFirstMessage: true}
🆕 NEW THREAD CREATED - emitting thread-created event
📢 Emitted thread-created to 1 user channels for sidebar updates
```

#### 🤖 AI & Model Operations
```
🚨 MODEL ROUTER CALLED: {selectedModel: 'gemini-2.5-flash'}
🎯 Model routing: gemini-2.5-flash → deepseek/deepseek-chat-v3-0324:free
🔍 FINAL MODEL BEING USED: deepseek/deepseek-chat-v3-0324:free
✅ streamWithAutoFallback completed, starting stream processing
✅ AI message saved to DB
📡 AI message broadcasted to all users in room
```

#### 🔌 Socket & Connection Management
```
Socket connected: 6IkdgSwKg6Far27UAAAB (User: auth_e857bd15-9f48-433e-b19d-4c15224bd2b5)
📊 Socket Monitor: User auth_e857bd15-9f48-433e-b19d-4c15224bd2b5 connected (1 active)
✅ SOCKET: User auth_e857bd15-9f48-433e-b19d-4c15224bd2b5 joined room F85ED7605F6D (family)
Socket disconnected: 6IkdgSwKg6Far27UAAAB - Reason: ping timeout
📊 Socket Monitor: User disconnected after 99s (1 active)
```

#### 💾 Database Operations
```
Added user to room: {userId: 'e857bd15-9f48-433e-b19d-4c15224bd2b5', displayName: 'john depp'}
Loaded messages for thread a0ef2671-3c9d-43a2-b388-ef5172ccb2f9: 7
💾 SAVING MESSAGE: {sender: 'AKIF QURESHI', isAI: false, contentPreview: 'hi '}
✅ Message saved successfully: {dbId: '55b10214...', sender: 'AKIF QURESHI', isFirstMessage: true}
```

#### 📬 Real-time Sync
```
📬 User auth_e857bd15-9f48-433e-b19d-4c15224bd2b5 requesting missed messages since 2025-08-16T23:03:19.641Z
```

#### 🧠 Memory & Performance
```
⚠️ High memory usage: 591MB
⚠️ WARNING: Memory usage 591MB - triggering moderate cleanup
🧹 Starting moderate memory cleanup...
✅ Moderate cleanup completed: freed 10MB
🚨 CRITICAL: Memory usage 779MB - triggering aggressive cleanup
```

### Client-Side Logs (Development Only)

Client-side logs are now controlled by the logger utility and only show in development mode.

## Removed Verbose Logs

### ❌ Removed Debug Logs
- Individual streaming deltas (`📦 Received delta: text-delta "..."`)
- Detailed model metadata and headers
- Component lifecycle logs
- Typing indicators
- Personal channel join/leave events
- Repeated API call logs
- Detailed system prompts and token counts
- URL update notifications
- Chat ID change notifications

### ❌ Removed Browser Console Spam
- React component mount/unmount logs
- Message processing debug info
- Real-time message duplicate checks
- Reasoning state updates
- Participant list changes
- Cross-thread activity logs

## Usage

### Cleanup Scripts
```bash
# Clean up client-side console logs
npm run cleanup:logs

# Clean up server-side verbose logs  
npm run cleanup:server-logs

# Clean up all logs
npm run cleanup:all-logs
```

### Using the Logger Utility
```typescript
import { logger } from '@/lib/utils/logger';

// Essential system events (always logged)
logger.system('Server started on port 3000');

// Error logging (always logged)
logger.error('Database connection failed', { userId: '123' }, error);

// Development-only logs
logger.debug('Processing message', { messageId: 'abc' });
logger.socket('User connected', { socketId: 'xyz' });
logger.ai('Model routing decision', { model: 'gpt-4' });
```

## Benefits

1. **Cleaner Production Logs**: Only essential system events are logged
2. **Better Performance**: Reduced I/O from excessive logging
3. **Easier Debugging**: Important events stand out from the noise
4. **Professional Output**: Clean, focused log messages
5. **Maintained Functionality**: All debugging info still available in development mode

## Log Levels

- **Production**: `error`, `warn`, essential system events
- **Development**: `error`, `warn`, `info`, `debug`, all system events