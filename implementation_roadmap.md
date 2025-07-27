# Implementation Roadmap: Unified Chat Architecture

## 🎯 Goal: Single /chat interface for all chat types

## Phase 1: Foundation (Day 1)
### Database Schema
- [ ] Add room_id column to chat_sessions
- [ ] Create migration script for existing room_messages
- [ ] Update RLS policies for room access

### URL Structure
- [ ] Refactor /chat/page.tsx to handle ?room= parameter
- [ ] Remove /chat/room/[shareCode]/page.tsx
- [ ] Update all room links to use /chat?room=CODE

## Phase 2: Unified API (Day 2)
### Single Chat API
- [ ] Extend /api/chat to detect room context
- [ ] Add room message handling to existing flow
- [ ] Remove /api/rooms/[shareCode]/chat

### Message Flow
```typescript
// Unified message creation
if (roomContext) {
  // Create room message in chat_sessions with room_id
} else {
  // Create personal message in chat_sessions with room_id = null
}
```

## Phase 3: Smart Sidebar (Day 3)
### Context-Aware Display
- [ ] Add activeRoom state to sidebar
- [ ] Toggle between personal/room chat lists
- [ ] Update "Home Chat" to clear room context

### State Management
```typescript
const [activeRoom, setActiveRoom] = useState<string | null>(
  searchParams.get('room')
);
```

## Phase 4: UI/UX Polish (Day 4-5)
### Layout Optimization
- [ ] Remove navbar/footer from chat pages
- [ ] Optimize viewport height usage
- [ ] Add loading states and skeletons

### User Experience
- [ ] Smooth transitions between modes
- [ ] Breadcrumb navigation
- [ ] Room context indicators

## 🎯 End Result

### Single Chat Interface
```
/chat → Shows personal chats in sidebar, personal chat area
/chat?room=CODE → Shows room chats in sidebar, room chat area
```

### Zero Duplication
- One ChatComponent handles all scenarios
- One API endpoint handles all messages
- One database table stores all chats
- One sidebar component shows relevant chats

### Perfect UX
- Familiar interface in all contexts
- Seamless switching between personal/room modes
- All features (AI, files, etc.) work everywhere
- Fast, responsive, no layout conflicts

## 📊 Current vs Target

### Current (Dual Architecture)
```
Personal: /chat/[id] → ChatComponent → /api/chat → chat_messages
Room:     /room/[code] → RoomComponent → /api/rooms/chat → room_messages
```

### Target (Unified Architecture)
```
Personal: /chat → ChatComponent → /api/chat → chat_sessions (room_id=null)
Room:     /chat?room=code → ChatComponent → /api/chat → chat_sessions (room_id=uuid)
```

## 🚀 Benefits Achieved
- ✅ Single source of truth
- ✅ Zero code duplication  
- ✅ Consistent user experience
- ✅ Easy to maintain and extend
- ✅ All features work everywhere