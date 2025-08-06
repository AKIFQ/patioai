# 🎛️ Streaming Control Guide

## How to Turn Streaming ON/OFF

### Method 1: Environment Variable (Recommended)

#### Turn ON Streaming
```bash
# In your .env file
STREAMING_ENABLED=true
```

#### Turn OFF Streaming  
```bash
# In your .env file
STREAMING_ENABLED=false
```

**Then restart your application:**
```bash
npm run dev
# or
yarn dev
```

### Method 2: Emergency Stop (Instant)

If you need to disable streaming immediately without restarting:

```typescript
// In any server-side code or API route
import { safeStreamingManager } from '@/lib/streaming/SafeStreamingManager';

// Emergency stop all streaming
safeStreamingManager.emergencyStop();
```

### Method 3: Runtime Control (Advanced)

You can also control streaming programmatically:

```typescript
// Check if streaming is enabled
const stats = safeStreamingManager.getStats();
console.log('Streaming enabled:', stats.enabled);
console.log('Active streams:', stats.activeStreams);

// Get detailed stream information
console.log('Stream details:', stats.streams);
```

## What Happens When You Turn It OFF

### ✅ **Safe Behavior**
- **Existing messages continue working** - No interruption to current functionality
- **Database saves unchanged** - All messages still saved properly
- **Socket events still work** - Regular `room-message-created` events continue
- **UI remains stable** - No broken components or missing messages
- **No data loss** - Everything works exactly as before

### 🔄 **Graceful Degradation**
- Active streams complete gracefully
- New requests skip streaming entirely
- Users see regular messages (complete responses)
- No error messages or broken UI

## Testing Streaming

### Development Testing
```bash
# Enable streaming in development
STREAMING_ENABLED=true

# Test with a single message
# You should see:
# 1. "🤔 Thinking..." with live reasoning
# 2. Reasoning collapses to "View reasoning ▼"
# 3. Main answer streams below
```

### Production Rollout
```bash
# Start with streaming disabled
STREAMING_ENABLED=false

# Enable for testing
STREAMING_ENABLED=true

# Monitor logs for any issues
# If problems occur, immediately set back to false
```

## Monitoring Streaming

### Check Streaming Status
```bash
# Look for these logs in your console:
🚀 Safe streaming started: stream-xxx
🧠 Reasoning started: stream-xxx  
🔄 Stream transitioned to answering: stream-xxx
✅ Safe streaming completed: stream-xxx

# If streaming is disabled, you'll see:
🚫 Streaming disabled, skipping
```

### Performance Monitoring
```typescript
// Get streaming statistics
const stats = safeStreamingManager.getStats();
console.log({
  enabled: stats.enabled,           // true/false
  activeStreams: stats.activeStreams, // number of active streams
  streams: stats.streams            // detailed stream info
});
```

## Troubleshooting

### Problem: Streaming Not Working
**Solution:**
1. Check `.env` file: `STREAMING_ENABLED=true`
2. Restart your application
3. Check console for streaming logs
4. Verify no errors in browser console

### Problem: Messages Appearing Twice
**Solution:**
1. This is normal during development
2. Streaming message appears first, then regular message replaces it
3. In production, timing is better optimized

### Problem: Performance Issues
**Solution:**
1. Set `STREAMING_ENABLED=false` immediately
2. Check server resources
3. Monitor active stream count
4. Consider reducing concurrent users

### Problem: Socket Connection Issues
**Solution:**
1. Streaming will automatically fallback to regular messages
2. Check Socket.IO connection status
3. Regular message flow continues working

## Best Practices

### 🚀 **Enabling Streaming**
- Test in development first
- Enable during low-traffic periods
- Monitor performance metrics
- Have rollback plan ready

### 🛡️ **Safety First**
- Always keep `STREAMING_ENABLED=false` as default
- Only enable when actively testing/using
- Monitor server resources
- Set up alerts for high stream counts

### 📊 **Monitoring**
- Check streaming logs regularly
- Monitor active stream count
- Watch for error patterns
- Track user experience metrics

## Quick Commands

```bash
# Enable streaming
echo "STREAMING_ENABLED=true" >> .env

# Disable streaming  
echo "STREAMING_ENABLED=false" >> .env

# Check current setting
grep STREAMING_ENABLED .env

# Restart application
npm run dev
```

## Emergency Procedures

### 🚨 **If Something Goes Wrong**

1. **Immediate Action:**
   ```bash
   # Set in .env file
   STREAMING_ENABLED=false
   ```

2. **Restart Application:**
   ```bash
   # Kill current process (Ctrl+C)
   # Then restart
   npm run dev
   ```

3. **Verify Fix:**
   - Check that messages still work normally
   - Verify no streaming logs appear
   - Confirm user experience is normal

4. **Investigation:**
   - Check server logs for errors
   - Review streaming statistics
   - Identify root cause before re-enabling

Remember: **The system is designed to be safe**. Turning off streaming will never break your existing chat functionality!