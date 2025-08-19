# 🔐 Auto-Generated Room Passwords with Expiry

This document describes the implementation of the auto-generated room password system with automatic expiry.

## Overview

The system automatically generates secure passwords for all rooms, eliminating the need for manual password management while maintaining security through automatic expiry and regeneration.

## Features

### ✅ Automatic Password Generation
- **Secure Generation**: 8-character passwords with mixed case and numbers
- **No Manual Input**: Users cannot set their own passwords
- **Database Trigger**: Passwords are generated automatically when rooms are created

### ✅ Password Expiry
- **36-Hour Lifespan**: Passwords expire automatically after 36 hours
- **Automatic Regeneration**: Expired passwords are automatically regenerated
- **Continuous Security**: Ensures passwords remain secure over time

### ✅ Admin Controls
- **Password Visibility**: Only room creators/admins can view passwords
- **Manual Regeneration**: Admins can manually regenerate passwords if needed
- **Password Sharing**: Admins can share passwords with new users

### ✅ User Experience
- **Seamless Joining**: Users enter the current valid password to join
- **Session Persistence**: Once joined, users don't need to re-enter passwords
- **Clear Feedback**: Users are informed when passwords have expired

## Database Schema

### New Fields Added to `rooms` Table

```sql
ALTER TABLE "public"."rooms" 
ADD COLUMN "password_generated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "password_expires_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + interval '36 hours');
```

### Database Functions

#### `generate_secure_password()`
Generates a secure 8-character random password.

#### `regenerate_expired_passwords()`
Automatically regenerates passwords for all expired rooms.

#### `get_room_password(p_room_id, p_user_id)`
Returns password info for room admins only.

#### `auto_generate_room_password()`
Trigger function that generates passwords for new rooms.

## API Endpoints

### Room Creation
- **Endpoint**: `POST /api/rooms/create`
- **Changes**: No longer accepts password parameter
- **Behavior**: Automatically generates secure password

### Password Management
- **Endpoint**: `GET /api/rooms/[shareCode]/password`
- **Access**: Room admin only
- **Features**: View current password, expiry info, regenerate password

### Room Joining
- **Endpoint**: `POST /api/rooms/[shareCode]/join`
- **Validation**: Checks password expiry before allowing join
- **Error Handling**: Clear messages for expired passwords

## Components

### CreateRoomModal
- Removed password input fields
- Shows auto-generated password information
- Displays password in success view for admin

### RoomPasswordManager
- New component for password management
- Shows current password, expiry time, and regeneration options
- Only visible to room admins

## Security Features

### Password Generation
- Cryptographically secure random generation
- 8 characters with mixed case and numbers
- Generated server-side, never exposed to client

### Access Control
- Only room creators can view passwords
- Passwords are never logged or stored in plain text in logs
- Session-based authentication prevents unauthorized access

### Expiry Management
- Automatic expiry prevents long-term password exposure
- Regular regeneration ensures security
- Clear user feedback when passwords expire

## Implementation Details

### Database Triggers
```sql
CREATE TRIGGER "auto_generate_room_password_trigger"
    BEFORE INSERT ON "public"."rooms"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."auto_generate_room_password"();
```

### Password Regeneration
- Runs automatically via cron job every hour
- Can be triggered manually by room admins
- Updates both password and expiry timestamps

### Error Handling
- Clear error messages for expired passwords
- Graceful fallback for database function failures
- User-friendly feedback throughout the process

## Usage Examples

### Creating a Room
```typescript
const response = await fetch('/api/rooms/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Secure Room' })
});
// Password is automatically generated
```

### Viewing Room Password (Admin Only)
```typescript
const response = await fetch(`/api/rooms/${shareCode}/password`);
const passwordInfo = await response.json();
// Returns: { password, expiresAt, generatedAt, isExpired }
```

### Joining a Room
```typescript
const response = await fetch(`/api/rooms/${shareCode}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    displayName: 'John Doe', 
    sessionId: 'session123',
    password: 'currentPassword'
  })
});
```

## Migration Guide

### 1. Run Database Migration
```bash
# Apply the new migration
psql -d your_database -f supabase/migrations/20250131000001_auto_generated_passwords.sql
```

### 2. Update Application Code
- Remove password input from room creation forms
- Update room creation API calls
- Add password management components where needed

### 3. Set Up Cron Job
```bash
# Add to crontab (runs every hour)
0 * * * * /usr/bin/node /path/to/scripts/regenerate-expired-passwords.js
```

### 4. Test the System
- Create new rooms to verify auto-generation
- Test password expiry and regeneration
- Verify admin-only password access

## Monitoring and Maintenance

### Logs
- Password regeneration events are logged
- Failed operations are tracked with error details
- Success metrics are recorded

### Health Checks
- Monitor password expiry rates
- Track regeneration success/failure rates
- Alert on system failures

### Performance
- Database indexes on expiry fields
- Efficient password generation functions
- Minimal impact on room creation/joining

## Troubleshooting

### Common Issues

#### Passwords Not Generating
- Check database trigger is active
- Verify function permissions
- Check database logs for errors

#### Expired Passwords Not Regenerating
- Verify cron job is running
- Check database function permissions
- Review error logs

#### Admin Cannot View Passwords
- Verify user is room creator
- Check authentication status
- Review API endpoint permissions

### Debug Commands
```sql
-- Check trigger status
SELECT * FROM information_schema.triggers WHERE trigger_name = 'auto_generate_room_password_trigger';

-- View password expiry info
SELECT name, password_generated_at, password_expires_at FROM rooms WHERE share_code = 'YOUR_CODE';

-- Manually regenerate passwords
SELECT regenerate_expired_passwords();
```

## Future Enhancements

### Potential Improvements
- **Password Strength Options**: Different complexity levels
- **Custom Expiry Times**: Configurable by room type
- **Bulk Operations**: Regenerate multiple room passwords
- **Audit Trail**: Track password changes and access
- **Integration**: Webhook notifications for password changes

### Scalability Considerations
- **Batch Processing**: Handle large numbers of rooms
- **Caching**: Cache frequently accessed password info
- **Rate Limiting**: Prevent abuse of regeneration endpoints
- **Monitoring**: Enhanced metrics and alerting

## Conclusion

The auto-generated password system provides a secure, user-friendly solution for room access control while maintaining high security standards through automatic expiry and regeneration. The system is designed to be transparent to end users while giving admins full control over their room security. 