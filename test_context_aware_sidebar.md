# Context-Aware Sidebar Test Plan

## What We've Implemented

### 1. Context-Aware Thread Display
- **Home Chat Context**: Shows all personal chats + all room threads from all rooms
- **Room Context**: Shows only threads for the current room

### 2. Thread-Based Architecture
- Migrated from complex session-based system to simple thread-based approach
- Each message belongs directly to a `thread_id` in `room_messages`
- Removed unused `room_chat_sessions` table and related code

### 3. Sidebar Behavior
- **When in Home Chat (`/chat`)**: 
  - Shows personal chat history
  - Shows all room threads grouped under "ROOM THREADS" section
  - Each room thread shows as: "Room Name • Date" with first message preview
  
- **When in Room (`/chat/room/[shareCode]`)**:
  - Shows room list at top (unchanged)
  - Shows only threads for current room under "ROOM THREADS"
  - Each thread shows as: "Date • Sender Name" with first message preview

### 4. URL Structure
- New: `/chat/room/[shareCode]?threadId=uuid` (preferred)
- Legacy: `/chat/room/[shareCode]?chatSession=uuid` (still supported)
- Auto-migration from legacy to new parameter

## Testing Steps

### Test 1: Home Context
1. Go to `/chat` (home)
2. Sidebar should show:
   - Personal chats in main section
   - "ROOM THREADS" section with threads from all rooms
   - Each room thread should show room name + date

### Test 2: Room Context  
1. Click on a room to enter it
2. Sidebar should show:
   - Room list at top (unchanged)
   - "ROOM THREADS" section with only threads from current room
   - Each thread should show date + sender name

### Test 3: Thread Navigation
1. Click on a thread in sidebar
2. Should navigate to correct room with threadId parameter
3. Should load messages for that specific thread
4. URL should use `threadId` parameter

### Test 4: New Thread Creation
1. Start new conversation in room
2. Should create new thread with UUID
3. Should appear in sidebar immediately
4. Should be context-aware (only show in current room's sidebar)

## Files Modified

### Core Changes
- `app/chat/layout.tsx`: Removed complex room thread processing, pass raw data to sidebar
- `app/chat/components/chat_history/ChatHistorySidebar.tsx`: Added context-aware thread processing
- `app/chat/room/[shareCode]/page.tsx`: Support both `threadId` and legacy `chatSession` params
- `app/chat/room/[shareCode]/components/RoomChatWrapper.tsx`: Updated to use `threadId` parameter

### Cleanup
- Deleted `app/api/rooms/[shareCode]/sessions/route.ts` (unused session-based API)
- Deleted `lib/utils/persistentId.ts` (unused utility)
- Created migration to remove `room_chat_sessions` table

### Database Migration
- `supabase/migrations/20250730260000_remove_unused_sessions.sql`: Clean up unused session table

## Expected Behavior

The sidebar now provides Discord-like experience:
- **Global view**: See all your conversations across all contexts
- **Room view**: Focus on just the current room's threads
- **Clean URLs**: Use `threadId` parameter consistently
- **Simple architecture**: Direct thread-based messaging without complex session management