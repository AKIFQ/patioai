# 🚀 Production Setup Guide

## Final Steps to Reach 10/10 Production Readiness

### 1. Run Final Security Fixes

Execute the `final_security_fixes.sql` file:

```sql
-- Run this in Supabase SQL Editor
BEGIN;

-- Fix the remaining RLS policy gap for room_participants
DROP POLICY IF EXISTS "Users can view room participants" ON room_participants;
CREATE POLICY "Participants can view room participants" ON room_participants
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM room_participants rp2 
    WHERE rp2.room_id = room_participants.room_id 
    AND rp2.user_id = auth.uid()
  )
);

-- Add missing DELETE policy for rooms
CREATE POLICY "Users can delete their own rooms" ON rooms
FOR DELETE USING (created_by = auth.uid());

COMMIT;
```

### 2. Set Up Automated Cleanup

#### Option A: Supabase Cron (Recommended)

Add this to your Supabase project:

```sql
-- Create a cron job to run daily cleanup at 2 AM UTC
SELECT cron.schedule(
  'cleanup-expired-rooms',
  '0 2 * * *', -- Daily at 2 AM UTC
  'SELECT cleanup_expired_rooms();'
);
```

#### Option B: External Cron Job

Set up a cron job on your server to call the cleanup endpoint:

```bash
# Add to your crontab (crontab -e)
0 2 * * * curl -X POST https://yourdomain.com/api/admin/cleanup -H "Authorization: Bearer YOUR_TOKEN"
```

#### Option C: Vercel Cron (if using Vercel)

Add to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/admin/cleanup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### 3. Monitor Your System

#### Check Room Statistics

```bash
# Get current room stats
curl https://yourdomain.com/api/admin/cleanup
```

#### Manual Cleanup

```bash
# Run cleanup manually
curl -X POST https://yourdomain.com/api/admin/cleanup
```

### 4. Security Verification

Run this query to verify all policies are secure:

```sql
SELECT 
  tablename,
  policyname,
  cmd,
  CASE 
    WHEN tablename = 'room_participants' AND cmd = 'SELECT' AND qual = 'true' THEN '❌ INSECURE'
    WHEN tablename = 'room_messages' AND cmd = 'SELECT' AND qual = 'true' THEN '❌ INSECURE'
    WHEN qual LIKE '%auth.uid()%' OR qual LIKE '%room_participants%' THEN '✅ SECURE'
    WHEN qual = 'true' THEN '⚠️ PERMISSIVE'
    ELSE '✅ SECURE'
  END as security_status
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('rooms', 'room_participants', 'room_messages', 'room_chat_sessions')
ORDER BY tablename, cmd, policyname;
```

**Expected Result**: All policies should show ✅ SECURE or ⚠️ PERMISSIVE (only for safe operations).

### 5. Performance Monitoring

#### Key Metrics to Monitor

1. **Room Statistics**:
   ```sql
   SELECT get_room_stats();
   ```

2. **Daily Usage Patterns**:
   ```sql
   SELECT 
     date,
     COUNT(DISTINCT user_id) as active_users,
     SUM(message_count) as total_messages
   FROM daily_message_usage 
   WHERE date >= CURRENT_DATE - INTERVAL '7 days'
   GROUP BY date
   ORDER BY date DESC;
   ```

3. **Room Capacity Utilization**:
   ```sql
   SELECT 
     r.max_participants,
     COUNT(rp.session_id) as current_participants,
     ROUND(COUNT(rp.session_id)::numeric / r.max_participants * 100, 2) as utilization_percent
   FROM rooms r
   LEFT JOIN room_participants rp ON r.id = rp.room_id
   WHERE r.expires_at > NOW()
   GROUP BY r.id, r.max_participants
   ORDER BY utilization_percent DESC;
   ```

### 6. Backup Strategy

#### Database Backups
- Supabase automatically handles backups
- Consider setting up additional backups for critical data

#### Code Backups
- Ensure your code is in version control
- Tag releases for easy rollback

### 7. Error Monitoring

Set up error monitoring for:
- Failed room joins
- Message sending failures
- Daily usage limit hits
- Database connection issues

### 8. Load Testing

Before going live, test:
- Concurrent room joining
- High message volume
- Daily usage limits
- Room capacity limits

## 🎯 Production Readiness Checklist

- [ ] Final security fixes applied
- [ ] Automated cleanup scheduled
- [ ] Monitoring endpoints set up
- [ ] Security verification passed
- [ ] Performance metrics configured
- [ ] Backup strategy implemented
- [ ] Error monitoring configured
- [ ] Load testing completed

## 🚨 Emergency Procedures

### If Room Security is Compromised

```sql
-- Emergency: Disable all room access
UPDATE rooms SET expires_at = NOW() WHERE expires_at > NOW();
```

### If Database is Under Attack

```sql
-- Emergency: Enable strict RLS on all tables
ALTER TABLE rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE room_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE room_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE room_chat_sessions FORCE ROW LEVEL SECURITY;
```

### If Daily Limits are Being Bypassed

```sql
-- Check for anomalous usage
SELECT 
  user_id,
  room_id,
  date,
  message_count
FROM daily_message_usage 
WHERE message_count > 100
ORDER BY message_count DESC;
```

## 📊 Success Metrics

Your system is production-ready when:
- ✅ All security policies are properly configured
- ✅ No unauthorized access to room data
- ✅ Daily usage limits are enforced
- ✅ Room capacity limits work under load
- ✅ Expired rooms are automatically cleaned up
- ✅ Performance is acceptable under expected load

**Congratulations! Your group chat system is now production-ready! 🎉**