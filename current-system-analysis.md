# Current System Analysis

## Current Flow (Working System)

### 1. API Route Flow
```
User Input → API Route → streamText() → onFinish() → saveRoomMessage() → Socket.IO Emit
```

**Key Points:**
- Uses `streamText()` but only emits complete message in `onFinish()`
- Saves to database via `SocketDatabaseService.insertRoomMessage()`
- Emits `room-message-created` event with complete message
- Includes `reasoning` and `sources` in the saved message

### 2. Client Reception Flow
```
Socket.IO → useRoomSocket → handleNewRoomMessage → onNewMessage → Chat.handleNewMessage → realtimeMessages
```

**Key Points:**
- `useRoomSocket` receives `room-message-created` events
- Converts to Message format with reasoning/sources
- `Chat.handleNewMessage` adds to `realtimeMessages` state
- Deduplicates messages by ID to prevent re-renders

### 3. UI Rendering Flow
```
realtimeMessages → VirtualizedMessageList → ChatMessage → RoomReasoningBlock
```

**Key Points:**
- `VirtualizedMessageList` renders all messages
- `ChatMessage` handles individual message rendering
- `RoomReasoningBlock` shows reasoning in accordion (starts open)
- No re-rendering issues due to proper memoization

## Current Reasoning Handling

### RoomReasoningBlock Component
- **Starts expanded** when reasoning exists
- **Auto-minimizes** when `isStreaming` prop is true
- **Accordion UI** with blue styling
- **Markdown rendering** for reasoning content
- **Proper state management** to avoid re-renders

## Streaming Implementation Strategy

### Phase 1: Add Streaming Infrastructure (No Breaking Changes)
1. **Add new socket events** alongside existing ones
2. **Extend API route** to emit chunks while keeping `onFinish()`
3. **Add streaming state** to Chat component
4. **Keep existing flow** as fallback

### Phase 2: Streaming Components
1. **Extend RoomReasoningBlock** to handle streaming
2. **Add streaming message container**
3. **Implement smooth transitions**

### Phase 3: Integration
1. **Merge streaming and regular messages**
2. **Handle edge cases**
3. **Performance optimization**

## Critical Considerations

### 1. No Re-render Issues
- Current system uses proper memoization
- `handleNewMessage` has empty dependency array
- Messages are deduplicated by ID
- **Must maintain this pattern**

### 2. Database Consistency
- Current system saves complete message to DB
- Socket events are emitted after DB save
- **Must keep this as source of truth**

### 3. Reasoning Flow
- Reasoning starts expanded
- Should stream live during reasoning phase
- Should minimize when answer phase starts
- **Must maintain smooth UX**

## Implementation Plan

### Step 1: Extend Socket Events (Safe)
```typescript
// Add new events alongside existing
'ai-reasoning-chunk'  // For reasoning streaming
'ai-answer-chunk'     // For answer streaming
'ai-stream-complete'  // For cleanup

// Keep existing
'room-message-created' // Still works as fallback
```

### Step 2: Extend API Route (Safe)
```typescript
const result = streamText({
  // ... existing config
  onChunk: async (chunk) => {
    // NEW: Emit streaming chunks
    if (chunk.type === 'reasoning-delta') {
      emitReasoningChunk(streamId, chunk.reasoningDelta);
    } else if (chunk.type === 'text-delta') {
      emitAnswerChunk(streamId, chunk.textDelta);
    }
  },
  onFinish: async (event) => {
    // EXISTING: Keep this exactly the same
    // This ensures DB consistency and fallback
  }
});
```

### Step 3: Extend Client (Safe)
```typescript
// Add streaming state alongside existing
const [streamingMessages, setStreamingMessages] = useState(new Map());

// Keep existing message handling
const handleNewMessage = useCallback((newMessage) => {
  // EXISTING: Keep this exactly the same
}, []);

// Add new streaming handlers
const handleReasoningChunk = useCallback((data) => {
  // NEW: Handle reasoning streaming
}, []);
```

### Step 4: Extend UI (Safe)
```typescript
// Merge streaming and regular messages for display
const allMessages = useMemo(() => {
  const regular = realtimeMessages;
  const streaming = Array.from(streamingMessages.values());
  return [...regular, ...streaming];
}, [realtimeMessages, streamingMessages]);
```

## Safety Measures

### 1. Feature Flag
```typescript
const STREAMING_ENABLED = process.env.STREAMING_ENABLED === 'true';
```

### 2. Fallback System
- If streaming fails, regular message still works
- Database save is unchanged
- UI gracefully handles both modes

### 3. Gradual Rollout
- Test with single room first
- Monitor performance metrics
- Easy rollback if issues

This approach ensures we add streaming **without breaking anything** in the current working system.