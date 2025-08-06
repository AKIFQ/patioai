# 🔍 Streaming Debug Checklist

## What to Check in Console Logs

When you send a message, look for these logs in order:

### 1. API Route Logs
```
🎬 [requestId] Generated stream ID: stream-xxx
🚀 [requestId] Starting streaming session...
🚀 [requestId] Stream started result: true/false
```

### 2. SafeStreamingManager Logs
```
🔧 SafeStreamingManager initialized: { enabled: true, env: 'true' }
🚀 [STREAMING] startStream called: { streamId, roomId, threadId, enabled: true }
🔌 [STREAMING] Socket.IO instance: true/false
📡 [STREAMING] Emitting ai-reasoning-start to room: roomId
🚀 [STREAMING] Safe streaming started: streamId
```

### 3. Chunk Processing Logs
```
📦 [requestId] Received chunk: { type: 'text-delta', hasTextDelta: true, ... }
🧠 [requestId] Processing reasoning chunk... (if reasoning-delta)
💬 [requestId] Processing text chunk... (if text-delta)
```

### 4. Client Socket Logs
```
🔌 [SOCKET] Setting up streaming listeners: true
🔌 [SOCKET] Streaming handlers available: ['onReasoningStart', ...]
🔌 [SOCKET] Setting up ai-reasoning-start listener
```

### 5. Client Event Logs
```
🧠 [CLIENT] Reasoning start event received: { streamId, threadId, ... }
🧠 [CLIENT] Processing reasoning start: streamId
🧠 [CLIENT] Reasoning chunk event received: { streamId, chunkLength, ... }
```

### 6. UI Rendering Logs
```
🎨 [CLIENT] Rendering messages: { realtimeCount: 2, streamingCount: 1, totalCount: 3 }
```

## Common Issues & Solutions

### Issue 1: No streaming logs at all
**Check:** `STREAMING_ENABLED=true` in .env file
**Solution:** Restart your dev server after changing .env

### Issue 2: Stream starts but no chunks
**Check:** Look for chunk type logs - might be different than expected
**Solution:** The AI model might not support reasoning-delta chunks

### Issue 3: Socket events not received
**Check:** Socket.IO connection and room joining
**Solution:** Verify you're in the correct room

### Issue 4: Messages not displaying
**Check:** UI rendering logs show streaming messages
**Solution:** Check message format and component rendering

## Quick Test Steps

1. **Enable streaming:** Set `STREAMING_ENABLED=true` in .env
2. **Restart server:** `npm run dev`
3. **Open browser console:** F12 → Console tab
4. **Send a message:** Type and press Shift+Enter
5. **Watch logs:** Look for the sequence above
6. **Check UI:** Should see streaming reasoning → collapsed → answer

## Debug Commands

```bash
# Check streaming status
grep STREAMING_ENABLED .env

# Restart with logs
npm run dev | grep STREAMING

# Test Socket.IO connection
# In browser console:
window.io?.connected
```