# New Chat Functionality Test

## Test Cases

### Regular Chat (1:1)
1. **Navigate to** `http://localhost:3000/chat`
2. **Send a message** to create some chat history
3. **Click "New Chat" button** in the header
4. **Expected Result:**
   - Current conversation should be cleared from the UI
   - A new chat ID should be generated
   - Previous chat should appear in the sidebar under "CHATS"
   - URL should change to `/chat/{new-uuid}`

### Room Chat
1. **Navigate to** `http://localhost:3000/chat/room/OFFICE-2025?displayName=Test&sessionId=test123`
2. **Send a message** in the room
3. **Click "New Chat" button** in the header
4. **Expected Result:**
   - Current conversation view should be refreshed
   - Should stay in the same room
   - URL should refresh with a timestamp parameter
   - Room messages are shared, so "new chat" just refreshes the view

## Implementation Details

### Regular Chat Flow:
```typescript
// Generate new UUID
const newChatId = uuidv4();
// Navigate to new chat
router.push(`/chat/${newChatId}`);
// Refresh sidebar
await mutate((key) => Array.isArray(key) && key[0] === 'chatPreviews');
```

### Room Chat Flow:
```typescript
// Clear local messages
setMessages([]);
// Refresh same room
const newUrl = `/chat/room/${shareCode}?displayName=${displayName}&sessionId=${sessionId}&refresh=${Date.now()}`;
router.replace(newUrl);
```

## Files Modified:
- `app/chat/components/Chat.tsx` - Added New Chat button and functionality