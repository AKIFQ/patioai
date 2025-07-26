# Requirements Document

## Introduction

The Group AI Chat feature transforms the existing single-user AI chat system into a collaborative platform where multiple users can participate in AI conversations together. This MVP focuses on the core insight: people want to chat with AI together. The system leverages existing authentication, database infrastructure, and chat components while adding minimal complexity for group functionality. Advanced features like password protection and complex user management are deferred to future phases.

## Requirements

### Requirement 1

**User Story:** As a registered user, I want to create a group chat room, so that I can get a shareable link to invite others to collaborate with AI.

#### Acceptance Criteria

1. WHEN a registered user clicks "Create Group Chat" THEN the system SHALL generate a new group chat room with a unique shareable link
2. WHEN a group chat room is created THEN the system SHALL store the room details with the creator as the owner
3. WHEN a group chat room is created THEN the system SHALL provide a shareable link that allows others to join without registration
4. WHEN a group chat room is created THEN the system SHALL generate a human-readable share code for the URL (e.g., "VACATION-2024")
5. WHEN a group chat room is created THEN the system SHALL set an automatic expiration of 30 days
6. IF a user is not authenticated THEN the system SHALL redirect them to sign in before allowing room creation

### Requirement 2

**User Story:** As anyone with a group chat link, I want to join the conversation easily, so that I can participate without complex registration.

#### Acceptance Criteria

1. WHEN a user clicks a valid group chat link THEN the system SHALL display a join form requesting only a display name
2. WHEN a user enters a display name THEN the system SHALL add them to the group chat immediately
3. WHEN a user joins successfully THEN the system SHALL store their session and display name for the duration of their participation
4. WHEN a user joins THEN the system SHALL display them in the participant list to other users
5. WHEN a user joins THEN the system SHALL grant them access to the complete chat history
6. IF a registered user joins their own room THEN the system SHALL recognize them as the owner and use their account display name
7. IF a group chat link is invalid or expired THEN the system SHALL display an appropriate error message

### Requirement 3

**User Story:** As a participant in a group chat, I want to send messages and see AI responses in real-time, so that all participants can collaborate effectively.

#### Acceptance Criteria

1. WHEN any participant sends a message THEN the system SHALL display it to all participants in real-time
2. WHEN the AI responds to a message THEN the system SHALL display the response to all participants simultaneously
3. WHEN a participant joins mid-conversation THEN the system SHALL display the complete chat history
4. WHEN a participant sends a message THEN the system SHALL clearly identify the sender to other participants
5. WHEN the AI is processing a response THEN the system SHALL show a typing indicator to all participants

### Requirement 4

**User Story:** As a participant in a group chat, I want to see who else is in the room, so that I know who I'm collaborating with.

#### Acceptance Criteria

1. WHEN a user is in a group chat THEN the system SHALL display a list of all current participants
2. WHEN a participant joins or leaves THEN the system SHALL update the participant list in real-time for all users
3. WHEN displaying participants THEN the system SHALL show display names and indicate the room creator

### Requirement 5

**User Story:** As a group chat creator, I want the conversation to be automatically saved, so that participants can reference it later within a reasonable timeframe.

#### Acceptance Criteria

1. WHEN messages are sent in a group chat THEN the system SHALL automatically save them to the database
2. WHEN a group chat is created THEN the system SHALL set an automatic expiration of 30 days
3. WHEN a group chat expires THEN the system SHALL automatically delete the conversation data
4. WHEN participants rejoin an active room THEN the system SHALL display the complete conversation history

### Requirement 6

**User Story:** As a user, I want to easily distinguish between my personal chats and group chats, so that I can navigate efficiently between different conversation types.

#### Acceptance Criteria

1. WHEN viewing the chat sidebar THEN the system SHALL clearly separate personal chats from group chats
2. WHEN displaying group chats THEN the system SHALL show participant count and room status
3. WHEN a user has participated in group chats THEN the system SHALL list them in their chat history
4. WHEN displaying chat previews THEN the system SHALL use distinct visual indicators for group vs personal chats

### Requirement 7

**User Story:** As a group chat participant, I want the AI to know who said what, so that responses feel natural and contextually aware.

#### Acceptance Criteria

1. WHEN the AI responds THEN it SHALL format context as "DisplayName: message" for user attribution
2. WHEN multiple users participate THEN the AI SHALL address users by name when relevant
3. WHEN building context THEN the system SHALL include the last 30 messages with sender names
4. WHEN conversations exceed 50 messages THEN the system SHALL show "Earlier messages not included" warning

### Requirement 8

**User Story:** As a system administrator, I want to prevent abuse with simple limits, so that the service remains sustainable.

#### Acceptance Criteria

1. WHEN free users send messages THEN they SHALL be limited to 30 messages per day per room
2. WHEN pro users send messages THEN they SHALL be limited to 100 messages per day per room
3. WHEN limits are hit THEN the system SHALL show upgrade prompts
4. WHEN limits reset THEN users SHALL regain access at midnight UTC

### Requirement 9

**User Story:** As a user, I want clear free vs paid tiers with obvious benefits, so that I can choose the right plan for my needs.

#### Acceptance Criteria

1. WHEN free users create rooms THEN they SHALL be limited to 5 participants maximum
2. WHEN pro users create rooms THEN they SHALL be allowed 20 participants maximum
3. WHEN free rooms are created THEN they SHALL expire after 7 days
4. WHEN pro rooms are created THEN they SHALL expire after 30 days
5. WHEN users hit limits THEN they SHALL see clear upgrade options

### Requirement 10

**User Story:** As a participant in a long chat, I want AI responses to stay relevant, so that the conversation remains productive.

#### Acceptance Criteria

1. WHEN conversations exceed 50 messages THEN the system SHALL only send the last 30 messages to AI
2. WHEN truncating context THEN the system SHALL preserve user names for attribution
3. WHEN conversations get very long THEN the system SHALL show "Earlier messages not included" warning
4. WHEN the AI responds THEN it SHALL not reference information from truncated messages

