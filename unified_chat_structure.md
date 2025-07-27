# Unified Chat Architecture Implementation

## 🎯 Core Principle: Single Chat Interface

### URL Structure
```
/chat → Personal chat mode
/chat?room=OFFICE-2025 → Room chat mode
```

### State Management
```typescript
// Single source of truth
const [activeRoom, setActiveRoom] = useState<string | null>(null);

// Context-aware behavior
const chatContext = activeRoom 
  ? { type: 'room', shareCode: activeRoom }
  : { type: 'personal' };
```

### Component Hierarchy
```
/chat/page.tsx (Single page for all chats)
├── ChatComponent (Universal chat interface)
│   ├── roomContext?: { shareCode, participants }
│   └── Adapts behavior based on context
├── Sidebar (Context-aware)
│   ├── Personal chats (when activeRoom = null)
│   └── Room chats (when activeRoom = shareCode)
└── Layout (Minimal, chat-focused)
```

## 🔄 Implementation Steps

### 1. Refactor Chat Page
- Single `/chat/page.tsx` handles all scenarios
- Use searchParams to detect room context
- Pass room context to ChatComponent

### 2. Unified API
- Extend `/api/chat` to handle room context
- Remove separate room chat APIs
- Single message flow for all chats

### 3. Smart Sidebar
- Toggle between personal/room modes
- Single chat history component
- Context-aware message display

### 4. Database Migration
- Add room_id to chat_sessions
- Migrate room_messages data
- Update RLS policies

## ✅ Benefits of This Architecture

1. **Zero Code Duplication** - One ChatComponent for everything
2. **Consistent UX** - Same interface everywhere
3. **Easy Feature Addition** - New features work in all contexts
4. **Simple State Management** - Single activeRoom state
5. **Maintainable** - One source of truth for chat logic