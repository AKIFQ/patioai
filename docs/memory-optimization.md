# Memory Optimization Guide

## Overview

This system implements aggressive memory management to prevent memory leaks and maintain optimal performance. The memory usage was hitting critical levels (3.7GB+) due to socket connections, database queries, and thread accumulation.

## Memory Management Components

### 1. Memory Manager (`lib/monitoring/memoryManager.ts`)

**Features:**
- Continuous memory monitoring (every 10 seconds)
- Automatic cleanup at 2GB (warning) and 3GB (critical) thresholds
- Aggressive cleanup of socket data, error logs, and performance metrics
- Manual cleanup API endpoints

**Thresholds:**
- Warning: 2GB (moderate cleanup)
- Critical: 3GB (aggressive cleanup)

### 2. Updated Alert System

**Changes:**
- Increased memory thresholds from 500MB/1GB to 2GB/3GB
- Automatic cleanup trigger on critical alerts
- Reduced cooldown periods for faster response

### 3. Enhanced Socket Cleanup

**Improvements:**
- Aggressive event listener removal on disconnect
- Faster cleanup timeout (15s instead of 30s)
- Memory-triggered cleanup after disconnections
- Proper socket reference clearing

## Usage

### Manual Memory Management

```bash
# Check current memory status
npm run memory:report

# Trigger immediate cleanup
npm run memory:cleanup

# Start continuous monitoring
npm run memory:monitor

# Update thresholds (warning,critical in MB)
npm run memory:thresholds 1500,2500
```

### API Endpoints

```bash
# Get memory report
GET /api/monitoring/memory

# Trigger cleanup
POST /api/monitoring/memory
{
  "action": "cleanup"
}

# Update thresholds
POST /api/monitoring/memory
{
  "action": "updateThresholds",
  "thresholds": { "warning": 2000, "critical": 3000 }
}

# Aggressive cleanup (database + memory)
POST /api/cleanup/aggressive
```

### Monitoring Dashboard

The monitoring dashboard now includes:
- Real-time memory usage
- Cleanup history
- Memory status indicators
- Automatic alerts

## Automatic Cleanup Actions

### Moderate Cleanup (2GB threshold)
- Clean old socket connection data (1+ hour old)
- Clean old error logs (1+ hour old)
- Force garbage collection

### Aggressive Cleanup (3GB threshold)
- Clear all but last 50 socket events
- Clear all but last 20 error logs
- Clear performance metrics
- Clean database connections
- Force multiple garbage collections
- Clean monitoring history

### Database Cleanup
- Remove empty threads (2+ hours old)
- Remove empty chat sessions (24+ hours old)
- Clean abandoned room participants (6+ hours old)

## Performance Optimizations

### 1. Server Configuration
- Added `--expose-gc` flag for manual garbage collection
- Optimized Socket.IO configuration
- Enhanced graceful shutdown

### 2. Database Optimizations
- Connection pooling limits
- Batch operations for cleanup
- Optimized queries with limits

### 3. Memory Leak Prevention
- Proper event listener cleanup
- Socket reference clearing
- Timeout cleanup on disconnect
- Regular monitoring data pruning

## Monitoring

### Real-time Monitoring
```bash
# Start continuous monitoring (checks every 30s)
npm run memory:monitor
```

Output example:
```
[2025-01-08 10:30:00] Memory: 1850MB ⚠️ warning
[2025-01-08 10:30:30] Memory: 1200MB ✅ healthy
```

### Memory Report
```bash
npm run memory:report
```

Output example:
```
📊 Memory Report
================
Status: ✅ HEALTHY
Heap Used: 1200MB / 1800MB
RSS: 1400MB
External: 50MB
Array Buffers: 10MB

Thresholds:
  Warning: 2000MB
  Critical: 3000MB

🧹 Recent Cleanups:
  1. 2025-01-08 10:25:00 - Freed 800MB (6 actions)
  2. 2025-01-08 10:20:00 - Freed 400MB (4 actions)
```

## Troubleshooting

### High Memory Usage
1. Check current status: `npm run memory:report`
2. Trigger cleanup: `npm run memory:cleanup`
3. Monitor continuously: `npm run memory:monitor`
4. Check for memory leaks in application code

### Cleanup Not Working
1. Verify server is running with `--expose-gc` flag
2. Check API endpoints are accessible
3. Review server logs for cleanup errors
4. Consider restarting the application

### Performance Issues
1. Lower memory thresholds if needed
2. Increase cleanup frequency
3. Review database query performance
4. Monitor socket connection patterns

## Configuration

### Environment Variables
```bash
# Optional: Custom memory thresholds
MEMORY_WARNING_THRESHOLD=2000
MEMORY_CRITICAL_THRESHOLD=3000

# Optional: Cleanup intervals
MEMORY_CHECK_INTERVAL=10000
CLEANUP_COOLDOWN=30000
```

### Customization
You can customize thresholds and behavior by modifying:
- `lib/monitoring/memoryManager.ts` - Core memory management
- `lib/monitoring/alertSystem.ts` - Alert thresholds
- `scripts/memory-monitor.js` - Monitoring script

## Best Practices

1. **Regular Monitoring**: Use continuous monitoring in production
2. **Proactive Cleanup**: Don't wait for critical thresholds
3. **Database Maintenance**: Run aggressive cleanup periodically
4. **Code Reviews**: Check for memory leaks in new code
5. **Resource Limits**: Set appropriate container memory limits

## Integration with Existing Systems

The memory management system integrates with:
- Socket.IO monitoring
- Error tracking
- Performance monitoring
- Database cleanup
- Alert system

All existing functionality remains intact while adding automatic memory management.