# Complex Group AI Chat Implementation Tasks
## Business-Critical Features Implementation

You're right - these ARE core business features. Here's how to implement them in manageable, testable vertical slices.

---

## Task 1: Basic Room Creation + Free Tier Limits (Week 1, Days 1-3)

### Goal: Create rooms with basic rate limiting to validate the tier system

### Backend Implementation:
1. **Database Setup**
   ```sql
   -- Core room tables
   CREATE TABLE rooms (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     name text,
     created_by uuid REFERENCES users(id) NOT NULL,
     share_code text UNIQUE NOT NULL,
     tier varchar(20) DEFAULT 'free',
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + interval '7 days'),
     max_participants integer DEFAULT 5
   );

   -- Usage tracking (core business logic)
   CREATE TABLE room_usage_tracking (
     room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
     date date DEFAULT CURRENT_DATE,
     total_messages integer DEFAULT 0,
     total_tokens_used integer DEFAULT 0,
     ai_requests_count integer DEFAULT 0,
     PRIMARY KEY (room_id, date)
   );

   -- User tier management
   CREATE TABLE user_subscriptions (
     user_id uuid REFERENCES users(id) PRIMARY KEY,
     tier varchar(20) DEFAULT 'free',
     daily_request_limit integer DEFAULT 15,
     room_participant_limit integer DEFAULT 5,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     expires_at timestamp with time zone
   );
   ```

2. **API Route: `/api/rooms/create`**
   ```typescript
   // Check user's tier and limits
   // Create room with appropriate tier settings
   // Initialize usage tracking
   ```

3. **Tier Validation Service**
   ```typescript
   // lib/business/TierManager.ts
   class TierManager {
     checkRoomCreationLimit(userId: string): Promise<boolean>
     getRoomLimits(tier: string): TierLimits
     validateParticipantLimit(roomId: string): Promise<boolean>
   }
   ```

### Frontend Implementation:
1. **Modified Chat Sidebar**
   - Add "Create Group Chat" button
   - Show tier limitations (e.g., "5 participants max - Free tier")

2. **Room Creation Modal**
   - Room name input
   - Tier limits displayed
   - Generate shareable link

### Testing Goals:
- ✅ Create room as free user
- ✅ See tier limitations in UI
- ✅ Get shareable link
- ✅ Verify 5-participant limit enforced

---

## Task 2: Smart Room Joining + Participant Tracking (Week 1, Days 4-5)

### Goal: Join rooms with proper user attribution and tier validation

### Backend Implementation:
1. **Database Addition**
   ```sql
   CREATE TABLE room_participants (
     room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
     user_id uuid REFERENCES users(id) NULL, -- NULL for anonymous
     session_id text NOT NULL,
     display_name text NOT NULL,
     joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     is_active boolean DEFAULT true,
     user_tier varchar(20) DEFAULT 'free',
     PRIMARY KEY (room_id, session_id)
   );
   ```

2. **API Route: `/api/rooms/[roomId]/join`**
   ```typescript
   // Validate room exists and not expired
   // Check participant limits based on room tier
   // Track user attribution (critical for AI context)
   // Handle both authenticated and anonymous users
   ```

3. **Participant Manager Service**
   ```typescript
   // lib/business/ParticipantManager.ts
   class ParticipantManager {
     addParticipant(roomId, userId, displayName, tier): Promise<void>
     getActiveParticipants(roomId): Promise<Participant[]>
     validateJoinLimits(roomId, userTier): Promise<boolean>
   }
   ```

### Frontend Implementation:
1. **Join Room Page** (`/rooms/[shareCode]`)
   - Display name input
   - Room info and participant count
   - Tier upgrade prompt if room is full

2. **Participant List Component**
   - Show active users with their tiers
   - Visual indication of who's speaking

### Testing Goals:
- ✅ Join room with valid share code
- ✅ See other participants
- ✅ Enforce 5-user limit for free rooms
- ✅ Proper user attribution setup

---

## Task 3: Message Flow + User Attribution (Week 2, Days 1-2)

### Goal: Send messages with proper user tracking for AI context

### Backend Implementation:
1. **Database Addition**
   ```sql
   CREATE TABLE room_messages (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
     participant_id uuid REFERENCES room_participants(room_id, session_id),
     sender_name text NOT NULL,
     sender_tier varchar(20) NOT NULL,
     content text,
     is_ai_response boolean DEFAULT false,
     token_count integer DEFAULT 0,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Enhanced `/api/chat/route.ts`**
   ```typescript
   // Add roomId parameter support
   // Track message attribution (WHO said WHAT)
   // Update usage counters
   // Validate tier limits before processing
   ```

3. **Message Attribution Service**
   ```typescript
   // lib/business/MessageAttributor.ts
   class MessageAttributor {
     formatMessagesForAI(roomId: string): Promise<AttributedMessage[]>
     trackMessageTokens(messageId: string, tokens: number): Promise<void>
     validateDailyLimits(userId: string, roomId: string): Promise<boolean>
   }
   ```

### Frontend Implementation:
1. **Enhanced Chat Component**
   - Show sender names clearly
   - Display tier badges
   - Show usage warnings

2. **Usage Indicator**
   - "5/15 messages used today" for free users
   - Progress bars for limits

### Testing Goals:
- ✅ Send messages with proper attribution
- ✅ See usage counters update
- ✅ Hit daily limits and see warnings
- ✅ Messages clearly show who sent them

---

## Task 4: AI Integration + Context Management (Week 2, Days 3-5)

### Goal: AI responds to group with proper context and attribution

### Backend Implementation:
1. **Context Manager Service**
   ```typescript
   // lib/ai/ContextManager.ts
   class ContextManager {
     buildContextForRoom(roomId: string): Promise<ContextData>
     compressContext(messages: Message[], targetTokens: number): Promise<Message[]>
     maintainUserAttribution(messages: Message[]): AttributedMessage[]
     calculateTokenUsage(messages: Message[]): number
   }
   ```

2. **Enhanced AI API**
   ```typescript
   // Modified /api/chat/route.ts
   // Format messages: "Alice: How do we plan our vacation?"
   // "Bob: I prefer mountains over beaches"
   // Track token usage per room and user
   // Apply tier-specific models
   ```

3. **Token Budget Manager**
   ```typescript
   // lib/business/TokenBudgetManager.ts
   class TokenBudgetManager {
     checkBudgetBeforeRequest(roomId: string, estimatedTokens: number): Promise<boolean>
     updateTokenUsage(roomId: string, actualTokens: number): Promise<void>
     getTierTokenLimits(tier: string): TokenLimits
   }
   ```

### Frontend Implementation:
1. **AI Response with Attribution**
   - AI mentions users by name: "As Alice mentioned, mountains are great for hiking"
   - Show token usage in real-time

2. **Usage Dashboard**
   - Daily token usage
   - Room-level statistics
   - Upgrade prompts

### Testing Goals:
- ✅ AI responds knowing who said what
- ✅ Token counting works correctly
- ✅ Hit token limits and see graceful degradation
- ✅ Context compression maintains quality

---

## Task 5: Rate Limiting + Tier Management (Week 3, Days 1-3)

### Goal: Full tier system with proper rate limiting

### Backend Implementation:
1. **Advanced Rate Limiter**
   ```typescript
   // lib/business/AdvancedRateLimiter.ts
   class AdvancedRateLimiter {
     checkUserDailyLimit(userId: string, tier: string): Promise<boolean>
     checkRoomTokenLimit(roomId: string, tier: string): Promise<boolean>
     applyGracefulDegradation(roomId: string): Promise<void>
     upgradeToNextTier(userId: string): Promise<boolean>
   }
   ```

2. **Tier Configuration**
   ```typescript
   const TIER_CONFIGS = {
     free: {
       maxParticipants: 5,
       dailyRequestsPerUser: 15,
       roomTokenLimit: 120000,
       aiModels: ['groq-llama-3-8b', 'gemini-1.5-flash']
     },
     pro: {
       maxParticipants: 20,
       dailyRequestsPerUser: 50,
       roomTokenLimit: 2000000,
       aiModels: ['gpt-4o', 'claude-3-sonnet']
     }
   }
   ```

### Frontend Implementation:
1. **Tier Upgrade Flow**
   - Usage warnings at 80%
   - Smooth upgrade path
   - Feature comparison

2. **Admin Dashboard** (for room creators)
   - Room analytics
   - Participant management
   - Usage statistics

### Testing Goals:
- ✅ Free tier limits work correctly
- ✅ Upgrade prompts appear appropriately
- ✅ Pro tier features unlock properly
- ✅ Rate limiting prevents abuse

---

## Task 6: Context Compression + Quality Assurance (Week 3, Days 4-5)

### Goal: Maintain conversation quality with intelligent context management

### Backend Implementation:
1. **Smart Context Compression**
   ```typescript
   // lib/ai/SmartCompression.ts
   class SmartCompression {
     compressOlderMessages(messages: Message[], targetTokens: number): Promise<Message[]>
     preserveCriticalContext(messages: Message[]): Message[]
     maintainUserVoices(messages: Message[]): Message[]
     qualityCheck(compressed: Message[], original: Message[]): QualityScore
   }
   ```

2. **Quality Monitoring**
   ```typescript
   // lib/monitoring/QualityMonitor.ts
   class QualityMonitor {
     trackResponseQuality(roomId: string, response: string): Promise<void>
     detectAttributionErrors(response: string, context: Message[]): Promise<boolean>
     adjustCompressionStrategy(roomId: string, qualityScore: number): Promise<void>
   }
   ```

### Frontend Implementation:
1. **Context Quality Indicators**
   - Show when compression is active
   - Quality score for responses
   - "See full context" option

2. **Error Detection**
   - Flag misattributed responses
   - Allow users to correct AI mistakes

### Testing Goals:
- ✅ Long conversations stay coherent
- ✅ User attribution remains accurate
- ✅ Quality doesn't degrade below 80%
- ✅ Compression warnings appear

---

## Task 7: Real-time Updates + Final Polish (Week 4)

### Goal: Complete real-time experience with all business features

### Backend Implementation:
1. **Supabase Realtime Integration**
   - Message broadcasting
   - Participant presence
   - Usage limit updates
   - Quality alerts

2. **Final Business Logic**
   - Daily limit resets
   - Tier upgrade handling
   - Usage analytics
   - Error logging

### Frontend Implementation:
1. **Real-time Everything**
   - Live message updates
   - Live participant list
   - Live usage counters
   - Live quality indicators

2. **Polish**
   - Loading states
   - Error handling
   - Mobile responsiveness
   - Performance optimization

### Testing Goals:
- ✅ Full real-time collaboration works
- ✅ All tier features work correctly
- ✅ Business logic is sound
- ✅ Ready for production

---

## Key Business Logic Integration Points

### 1. **User Attribution Throughout**
Every message, every token, every interaction tracks who did what. This enables:
- Proper AI context ("As Bob mentioned...")
- Individual rate limiting
- Quality attribution tracking

### 2. **Tier-Based Feature Gating**
Every API call checks tier limits:
- Participant limits
- Token budgets
- Model access
- Feature availability

### 3. **Real-time Usage Tracking**
Business metrics updated in real-time:
- Token consumption
- Request counts
- Quality scores
- Upgrade opportunities

### 4. **Progressive Enhancement**
Each task builds on the previous one while adding core business value.

**This approach gives you enterprise-level features in manageable, testable chunks.** 