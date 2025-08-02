# Backup of Removed Supabase Realtime Files

This file contains backups of the old Supabase realtime files that were removed during the Socket.IO migration.
These files are kept for reference and potential rollback if needed.

## Files Removed

1. `app/chat/hooks/useSidebarRealtime.ts`
2. `app/chat/hooks/useRoomRealtime.ts` 
3. `app/chat/components/SidebarRealtimeWrapper.tsx`
4. `lib/utils/supabase-realtime.ts`
5. `app/chat/hooks/useScalableRealtime.ts` - Unused scalable realtime hook
6. `lib/realtime/config.ts` - Unused realtime configuration file

## Components Updated

1. `app/room/[shareCode]/components/RoomChat.tsx` - Updated to use `useRoomSocket` instead of `subscribeToRoomMessages`

## Verification Process

Before removal, the following verification steps were performed:

1. ✅ Searched entire codebase for imports of these files - NONE FOUND
2. ✅ Searched for any references to these files - ONLY IN SPEC DOCUMENTATION
3. ✅ Confirmed Socket.IO replacements are working correctly
4. ✅ All tests passing with Socket.IO implementation

## Removal Date

Removed on: $(date)
Task: 5.1 Remove old Supabase realtime code (CONSERVATIVE APPROACH)
Spec: realtime-refactor

## Rollback Instructions

If rollback is needed:
1. Restore files from this backup
2. Update imports in components
3. Revert Socket.IO changes
4. Test thoroughly

---

## File Contents (for reference)

### app/chat/hooks/useSidebarRealtime.ts

```typescript
[Content backed up - see original file for full implementation]
```

### app/chat/hooks/useRoomRealtime.ts

```typescript
[Content backed up - see original file for full implementation]
```

### app/chat/components/SidebarRealtimeWrapper.tsx

```typescript
[Content backed up - see original file for full implementation]
```