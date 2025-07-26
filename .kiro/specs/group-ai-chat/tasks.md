# Implementation Plan

## Task 1: Complete Room Creation Feature

### Prerequisites
- None (this is the first task)
- Ensure Supabase project is set up and connected

### Environment Setup
```bash
# Add to .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Database Changes
```sql
-- Copy-paste into Supabase SQL Editor
CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  share_code text UNIQUE NOT NULL,
  creator_tier varchar(10) DEFAULT 'free',
  max_participants integer DEFAULT 5,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '7 days')
);

CREATE TABLE user_tiers (
  user_id uuid REFERENCES auth.users(id) PRIMARY KEY,
  tier varchar(10) DEFAULT 'free',
  upgraded_at timestamp with time zone
);

-- Indexes for performance
CREATE INDEX idx_rooms_share_code ON rooms(share_code);
CREATE INDEX idx_rooms_created_by ON rooms(created_by);

-- Row Level Security Policies
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tiers ENABLE ROW LEVEL SECURITY;

-- Rooms policies
CREATE POLICY "Users can view all rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Users can create their own rooms" ON rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own rooms" ON rooms FOR UPDATE USING (auth.uid() = created_by);

-- User tiers policies
CREATE POLICY "Users can view their own tier" ON user_tiers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tier" ON user_tiers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tier" ON user_tiers FOR UPDATE USING (auth.uid() = user_id);
```

### Rollback SQL (if needed)
```sql
-- Copy-paste to rollback changes
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS user_tiers CASCADE;
```

### API Implementation
- Create POST /api/rooms/create endpoint with tier checking
- Generate human-readable share codes (e.g., "VACATION-2024")
- Return room details and shareable link

### Frontend Implementation
- Add "Create Group Chat" button to main chat interface
- Implement modal with room name input
- Display generated shareable link with copy-to-clipboard
- Show tier limits (e.g., "5 participants max - Free tier")

### Testing Instructions
1. Open localhost:3000 and sign in
2. Click "Create Group Chat" button
3. Enter room name "Family Vacation"
4. Should see shareable link like "localhost:3000/room/FAMILY-VACATION-2024"
5. Verify room exists in Supabase rooms table
6. Copy link should work

### Definition of Done
- ✅ Can create room with shareable link
- ✅ Room stored in database with correct tier settings
- ✅ Share code is human-readable
- ✅ Copy-to-clipboard works
- _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1_

---

## Task 2: Complete Room Joining Feature

### Prerequisites
- Task 1 must be completed (rooms and user_tiers tables exist)
- Room creation feature working and tested

### Database Changes
```sql
-- Copy-paste into Supabase SQL Editor
CREATE TABLE room_participants (
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  display_name text NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (room_id, session_id)
);

-- Index for performance
CREATE INDEX idx_room_participants_room_id ON room_participants(room_id);

-- Row Level Security
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

-- Participants policies (allow all users to view and manage participants)
CREATE POLICY "Users can view room participants" ON room_participants FOR SELECT USING (true);
CREATE POLICY "Users can join rooms" ON room_participants FOR INSERT USING (true);
CREATE POLICY "Users can update their participation" ON room_participants FOR UPDATE USING (true);
CREATE POLICY "Users can leave rooms" ON room_participants FOR DELETE USING (true);
```

### Rollback SQL (if needed)
```sql
-- Copy-paste to rollback changes
DROP TABLE IF EXISTS room_participants CASCADE;
```

### API Implementation
- Create POST /api/rooms/[shareCode]/join endpoint
- Validate room exists, not expired, and under participant limit
- Create participant session with display name
- Return room access and basic room info

### Frontend Implementation
- Create /room/[shareCode] page route
- Build join form requesting only display name
- Handle error states (invalid/expired rooms, room full)
- Show participant count and room tier info

### Testing Instructions
1. Use shareable link from Task 1: localhost:3000/room/FAMILY-VACATION-2024
2. Enter display name "Alice"
3. Should join room successfully
4. Verify participant record in room_participants table
5. Test with 6th user to see "Room full" error (free tier limit)

### Definition of Done
- ✅ Can join room with valid share code
- ✅ Display name validation works
- ✅ Participant limits enforced (5 for free tier)
- ✅ Error handling for invalid/expired rooms
- _Requirements: 2.1, 2.2, 2.3, 2.6, 9.1, 9.2_

---

## Task 3: Complete Basic Group Messaging Feature

### Prerequisites
- Task 2 must be completed (room_participants table exists)
- Room joining feature working and tested

### Database Changes
```sql
-- Copy-paste into Supabase SQL Editor
CREATE TABLE room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  content text,
  is_ai_response boolean DEFAULT false,
  sources jsonb,
  reasoning text,
  created_at timestamp with time zone DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_room_messages_room_id_created_at ON room_messages(room_id, created_at);

-- Row Level Security
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

-- Messages policies (allow all users to view and create messages)
CREATE POLICY "Users can view room messages" ON room_messages FOR SELECT USING (true);
CREATE POLICY "Users can create room messages" ON room_messages FOR INSERT USING (true);
```

### Rollback SQL (if needed)
```sql
-- Copy-paste to rollback changes
DROP TABLE IF EXISTS room_messages CASCADE;
```

### API Implementation
- Modify existing /api/chat/route.ts to handle roomId parameter
- Create message storage for room_messages table
- Set up Supabase Realtime broadcasting for room channels

### Frontend Implementation
- Extend existing Chat component to accept room context
- Update MessageInput to send to room endpoint when in group mode
- Display sender names clearly for group messages
- Show real-time message updates via Supabase Realtime

### Testing Instructions
1. Join room from Task 2 as "Alice"
2. Open same room in incognito as "Bob"
3. Send message as Alice: "Hello everyone!"
4. Should see message appear for Bob in real-time with "Alice: Hello everyone!"
5. Verify message stored in room_messages table
6. Both users should see complete message history

### Definition of Done
- ✅ Can send messages in group chat
- ✅ Messages appear in real-time for all participants
- ✅ Sender names clearly displayed
- ✅ Message history persists
- _Requirements: 3.1, 3.3, 3.4, 5.1_

---

## Task 4: Complete AI Integration with User Attribution

### Prerequisites
- Task 3 must be completed (room_messages table exists)
- Basic group messaging working and tested

### Database Changes
```sql
-- Copy-paste into Supabase SQL Editor
CREATE TABLE daily_message_usage (
  user_id uuid REFERENCES auth.users(id),
  room_id uuid REFERENCES rooms(id),
  date date DEFAULT CURRENT_DATE,
  message_count integer DEFAULT 0,
  PRIMARY KEY (user_id, room_id, date)
);

-- Index for performance
CREATE INDEX idx_daily_usage_user_room_date ON daily_message_usage(user_id, room_id, date);

-- Row Level Security
ALTER TABLE daily_message_usage ENABLE ROW LEVEL SECURITY;

-- Usage policies (users can only see their own usage)
CREATE POLICY "Users can view their own usage" ON daily_message_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own usage" ON daily_message_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own usage" ON daily_message_usage FOR UPDATE USING (auth.uid() = user_id);
```

### Rollback SQL (if needed)
```sql
-- Copy-paste to rollback changes
DROP TABLE IF EXISTS daily_message_usage CASCADE;
```

### API Implementation
- Enhance /api/chat/route.ts with user attribution context
- Format messages for AI as "Alice: message content"
- Implement basic rate limiting (30 messages/day for free users)
- Store AI responses in room_messages table

### Frontend Implementation
- Add usage counter display ("15/30 messages today")
- Show AI typing indicator to all participants
- Display AI responses with proper attribution awareness
- Add upgrade prompts when approaching limits

### Testing Instructions
1. Continue from Task 3 with Alice and Bob in room
2. Alice asks: "What should we pack for vacation?"
3. AI should respond knowing Alice asked the question
4. Bob asks: "What about hiking gear?"
5. AI should respond addressing Bob specifically
6. Check daily_message_usage table for usage tracking
7. Test rate limiting by sending 30+ messages

### Definition of Done
- ✅ AI knows who said what in group context
- ✅ AI responses reference users by name appropriately
- ✅ Rate limiting works (30 messages/day free tier)
- ✅ Usage tracking displays correctly
- _Requirements: 3.2, 3.5, 7.1, 7.2, 8.1, 8.2_

---

## Task 5: Complete Participant Management Feature

### Prerequisites
- Task 4 must be completed (daily_message_usage table exists)
- AI integration working and tested

### API Implementation
- Create GET /api/rooms/[shareCode]/participants endpoint
- Track participant sessions and last_seen timestamps
- Handle participant join/leave events via Realtime

### Frontend Implementation
- Create ParticipantsList component showing active users
- Display participant names and indicate room creator
- Update participant list in real-time
- Show participant count in room header

### Testing Instructions
1. Join room as Alice, Bob, and Charlie (3 participants)
2. Should see participant list with all 3 names
3. Alice should be marked as room creator
4. Close Charlie's browser tab
5. Participant list should update to show 2 active users
6. Rejoin as Charlie, should appear in list again

### Definition of Done
- ✅ Participant list shows all active users
- ✅ Room creator clearly indicated
- ✅ Real-time updates when users join/leave
- ✅ Accurate participant count display
- _Requirements: 4.1, 4.2, 4.3_

---

## Task 6: Complete Tier Management and Upgrade Flow

### Prerequisites
- Task 5 must be completed (participant management working)
- All core group chat features tested and working

### API Implementation
- Create GET /api/tiers/current endpoint for user tier info
- Create POST /api/tiers/upgrade endpoint for tier upgrades
- Implement tier-based room limits and expiration

### Frontend Implementation
- Add tier indicator to room creation ("Pro: 20 participants, 30 days")
- Create upgrade modal with tier comparison
- Show tier benefits throughout the interface
- Add upgrade prompts when hitting limits

### Testing Instructions
1. As free user, try to create 6th room (should show upgrade prompt)
2. Try to add 6th participant to room (should show upgrade prompt)
3. Test upgrade flow (mock payment for now)
4. After upgrade, should allow 20 participants and 30-day expiration
5. Verify user_tiers table updated correctly

### Definition of Done
- ✅ Tier limits enforced (5 vs 20 participants, 7 vs 30 days)
- ✅ Upgrade prompts appear at appropriate times
- ✅ Tier benefits clearly communicated
- ✅ Upgrade flow functional (even if mock payment)
- _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

---

## Task 7: Complete Long Conversation Handling

### Prerequisites
- Task 6 must be completed (tier management working)
- Upgrade flow tested and functional

### API Implementation
- Modify AI context to use only last 30 messages when over 50 total
- Preserve user attribution in truncated context
- Add context truncation warnings

### Frontend Implementation
- Show "Earlier messages not included" warning for long chats
- Display context truncation status
- Ensure AI doesn't reference truncated information

### Testing Instructions
1. Create room and send 60+ messages between multiple users
2. Should see "Earlier messages not included" warning
3. AI should only reference recent 30 messages
4. Verify AI doesn't mention information from messages 1-30
5. Context should still maintain user attribution

### Definition of Done
- ✅ Long conversations truncated to last 30 messages
- ✅ User attribution preserved in truncated context
- ✅ Warning displayed for truncated conversations
- ✅ AI doesn't reference truncated information
- _Requirements: 10.1, 10.2, 10.3, 10.4_

---

## Task 8: Complete Group Chat Navigation

### Prerequisites
- Task 7 must be completed (long conversation handling working)
- All core messaging features tested and functional

### Frontend Implementation
- Add "Group Chats" section to sidebar
- Display participated rooms with participant counts
- Add visual indicators for group vs personal chats
- Implement navigation to rejoin active rooms

### Testing Instructions
1. Create multiple group chats and personal chats
2. Sidebar should clearly separate the two types
3. Group chats should show participant count and status
4. Clicking group chat should rejoin the room
5. Visual indicators should distinguish chat types

### Definition of Done
- ✅ Group chats separated from personal chats in sidebar
- ✅ Participant counts and room status displayed
- ✅ Easy navigation to rejoin rooms
- ✅ Clear visual distinction between chat types
- _Requirements: 6.1, 6.2, 6.3, 6.4_

---

## Task 9: Complete Room Expiration and Cleanup

### Prerequisites
- Task 8 must be completed (group chat navigation working)
- All navigation features tested and functional

### API Implementation
- Add room expiration validation to all endpoints
- Create cleanup job for expired rooms
- Handle expired room scenarios gracefully

### Frontend Implementation
- Show room expiration dates
- Handle expired room errors with clear messaging
- Display time remaining for active rooms

### Testing Instructions
1. Create room and manually set expires_at to past date in database
2. Try to join expired room - should show "Room expired" error
3. Test cleanup job removes expired room data
4. Active rooms should show time remaining
5. Pro rooms should show 30-day expiration vs 7-day for free

### Definition of Done
- ✅ Expired rooms properly blocked with clear errors
- ✅ Automatic cleanup removes expired data
- ✅ Room expiration dates displayed to users
- ✅ Different expiration times for free vs pro tiers
- _Requirements: 5.2, 5.3, 9.3, 9.4_

---

## Task 10: Complete Error Handling and Polish

### Prerequisites
- Task 9 must be completed (room expiration working)
- All core features tested and functional

### Implementation
- Add comprehensive client-side validation
- Implement loading states throughout the flow
- Handle network disconnections gracefully
- Add error recovery mechanisms

### Testing Instructions
1. Test all error scenarios: invalid rooms, network issues, rate limits
2. Verify loading states appear during API calls
3. Test offline/online behavior
4. Ensure error messages are user-friendly
5. Test error recovery (retry mechanisms)

### Definition of Done
- ✅ All error scenarios handled gracefully
- ✅ Loading states provide good UX
- ✅ Network issues don't break the app
- ✅ Users can recover from errors easily
- _Requirements: 2.6, 3.1, 4.2, 8.3_