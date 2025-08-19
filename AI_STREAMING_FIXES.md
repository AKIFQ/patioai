# AI Streaming Fixes & Analysis

## Issues Identified & Fixed

### 1. **Timeout Too Aggressive** ✅ FIXED
- **Problem**: 120 seconds timeout was too long for user experience
- **Fix**: Reduced to 30s for DeepSeek, 20s for other models
- **Location**: `lib/server/aiResponseHandler.ts` lines 89-90, 127-128

### 2. **Reasoning Not Streaming Properly** ✅ FIXED
- **Problem**: Complex reasoning extraction logic was failing
- **Fix**: Simplified to stream all content including `<think>` tags, let frontend handle extraction
- **Location**: `lib/server/aiResponseHandler.ts` lines 540-560

### 3. **Memory Protection Too Aggressive** ✅ FIXED
- **Problem**: Emergency mode was blocking normal AI responses
- **Fix**: Use fixed generous limits (1MB response, 500KB reasoning) instead of dynamic emergency limits
- **Location**: `lib/server/aiResponseHandler.ts` lines 360-365

### 4. **Better Error Handling** ✅ ADDED
- **Problem**: Generic error messages, no proper cleanup
- **Fix**: Specific error messages for timeouts, rate limits, model issues + proper UI cleanup
- **Location**: `lib/server/aiResponseHandler.ts` lines 888-915

## AI Invoke Flow Analysis

```
1. Frontend: Chat.tsx handleSubmit() 
   ↓
2. Frontend: useRoomSocket.invokeAI()
   ↓  
3. Socket: 'invoke-ai' event → socketHandlers.ts
   ↓
4. Backend: aiHandler.streamAIResponse()
   ↓
5. Backend: ModelRouter.routeModel() 
   ↓
6. Backend: streamText() with AbortSignal.timeout()
   ↓
7. Backend: Stream processing loop
   ↓
8. Socket Events: 'ai-stream-start', 'ai-stream-chunk', 'ai-stream-end'
   ↓
9. Frontend: useRoomSocket event handlers
   ↓
10. Frontend: Chat.tsx state updates & UI rendering
```

## Key Components

### Backend Flow
- **socketHandlers.ts**: Receives `invoke-ai` event, calls `aiHandler.streamAIResponse()`
- **aiResponseHandler.ts**: Main streaming logic, model routing, timeout handling
- **modelRouter.ts**: Routes models based on tier and reasoning mode
- **openRouterService.ts**: Provides model instances with proper configuration

### Frontend Flow  
- **Chat.tsx**: Main chat component, handles AI invocation and state
- **useRoomSocket.ts**: Socket event handlers for streaming events
- **StreamingReasoningUI.tsx**: Displays reasoning content (if detected)

## Test Coverage

Created comprehensive tests:
- **scripts/test-ai-streaming.ts**: Full TypeScript test suite
- **scripts/test-ai-simple.js**: Simple Node.js test for quick verification

### Test Scenarios
1. Basic AI streaming (gemini-2.5-flash)
2. Reasoning mode (deepseek-r1) 
3. Timeout handling
4. Error handling
5. Stream event flow (start → chunks → end)

## Configuration

### Timeouts
- **DeepSeek models**: 30 seconds (reasoning takes longer)
- **Other models**: 20 seconds (faster response expected)
- **Socket timeout**: 10 seconds for message acknowledgment

### Memory Limits
- **Response size**: 1MB (generous for AI responses)
- **Reasoning size**: 500KB (generous for thinking content)

### Model Routing
- **Free tier**: Auto-routes to gemini-2.5-flash or deepseek-chat-v3-0324:free
- **Reasoning mode**: Routes to deepseek/deepseek-r1 for free users
- **Fallback**: Automatic fallback on rate limits or errors

## Expected Behavior After Fixes

### Normal Streaming
1. User sends message → AI invoke acknowledged within 1s
2. Stream starts → `ai-stream-start` event within 3-5s  
3. Chunks stream → Multiple `ai-stream-chunk` events
4. Stream ends → `ai-stream-end` event with complete text

### Reasoning Mode
1. Same as normal + reasoning detection
2. `ai-reasoning-start` when `<think>` tags detected
3. `ai-stream-chunk` events with `isReasoning: true` flag
4. Frontend can extract and display reasoning separately

### Error Scenarios
1. **Timeout**: Clear error message, UI cleanup, suggest shorter prompt
2. **Rate limit**: Automatic fallback to different model
3. **Model error**: Specific error message, fallback attempt

## Testing Commands

```bash
# Build and verify
npm run build:server

# Run simple test (requires server running)
node scripts/test-ai-simple.js

# Run comprehensive test (requires server running)  
npx tsx scripts/test-ai-streaming.ts
```

## Monitoring

The system now provides better logging:
- Model routing decisions
- Timeout configurations  
- Reasoning detection
- Error categorization
- Stream event timing

All logs are prefixed with emojis for easy identification:
- 🤖 AI streaming start
- 📦 Stream chunks
- 🧠 Reasoning detection  
- ❌ Errors
- ✅ Success events