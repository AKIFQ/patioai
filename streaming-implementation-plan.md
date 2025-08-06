# AI Response Streaming Implementation Plan

## Overview
Implement real-time streaming for AI responses that properly handles the complex structure of reasoning + main answer, similar to ChatGPT and DeepSeek.

## Current AI Response Structure

### 1. Reasoning Phase (Thinking)
- Shows live streaming of AI's reasoning process
- Displayed in an expanded reasoning block
- User can see the AI "thinking" in real-time

### 2. Main Answer Phase
- Reasoning block minimizes/collapses
- Main answer starts streaming
- User sees the final response being generated

## Streaming Flow Design

### Phase 1: Reasoning Streaming
```
[AI Message Bubble]
┌─ Reasoning (Expanded) ─────────────┐
│ 🤔 Thinking...                     │
│ I need to analyze this question... │
│ Let me consider the context...     │ ← Streams live
│ Based on the information...        │
└────────────────────────────────────┘
```

### Phase 2: Answer Streaming
```
[AI Message Bubble]
┌─ Reasoning (Collapsed) ─┐
│ 🤔 View reasoning ▼     │ ← Minimized
└─────────────────────────┘

Here's my response:
This is the main answer... ← Streams live
```

## Technical Implementation

### 1. Socket Events Structure
```typescript
// Reasoning phase
'ai-reasoning-start': { messageId, threadId }
'ai-reasoning-chunk': { messageId, threadId, reasoningChunk }
'ai-reasoning-complete': { messageId, threadId, fullReasoning }

// Answer phase  
'ai-answer-start': { messageId, threadId }
'ai-answer-chunk': { messageId, threadId, answerChunk }
'ai-answer-complete': { messageId, threadId, fullAnswer }
```

### 2. Component State Management
```typescript
interface StreamingMessage {
  id: string;
  phase: 'reasoning' | 'answering' | 'complete';
  reasoning: {
    content: string;
    isStreaming: boolean;
    isExpanded: boolean;
  };
  answer: {
    content: string;
    isStreaming: boolean;
  };
}
```

### 3. API Route Modifications
```typescript
const result = streamText({
  // ... existing config
  onChunk: async (chunk) => {
    if (chunk.type === 'reasoning-delta') {
      // Stream reasoning
      emitRoomEvent(shareCode, 'ai-reasoning-chunk', {
        messageId: streamingMessageId,
        threadId,
        reasoningChunk: chunk.reasoningDelta
      });
    } else if (chunk.type === 'text-delta') {
      // Stream main answer
      emitRoomEvent(shareCode, 'ai-answer-chunk', {
        messageId: streamingMessageId,
        threadId,
        answerChunk: chunk.textDelta
      });
    }
  }
});
```

## UI/UX Behavior

### Reasoning Phase
1. **Reasoning block appears expanded**
2. **"🤔 Thinking..." indicator shows**
3. **Reasoning text streams character by character**
4. **User can see AI's thought process live**

### Transition to Answer
1. **Reasoning streaming stops**
2. **Reasoning block smoothly collapses**
3. **"View reasoning ▼" button appears**
4. **Main answer area appears below**

### Answer Phase
1. **Main answer streams character by character**
2. **Reasoning stays collapsed but accessible**
3. **User can expand reasoning if needed**

## Implementation Steps

### Step 1: Extend Socket Events
- Add reasoning-specific events
- Add answer-specific events
- Handle phase transitions

### Step 2: Update API Route
- Detect reasoning vs answer chunks
- Emit appropriate events for each phase
- Handle phase transitions properly

### Step 3: Create Streaming Components
- `StreamingReasoningBlock` - Handles reasoning display
- `StreamingAnswerBlock` - Handles answer display
- `StreamingMessageContainer` - Orchestrates both

### Step 4: State Management
- Track streaming phases
- Manage reasoning expansion/collapse
- Handle smooth transitions

### Step 5: Animation & UX
- Smooth collapse/expand animations
- Typing indicators for each phase
- Visual feedback for phase transitions

## Key Considerations

### 1. Performance
- Debounce rapid chunks (50ms batches)
- Optimize re-renders during streaming
- Clean up completed streams

### 2. Error Handling
- Handle reasoning stream failures
- Handle answer stream failures
- Graceful fallback to complete message

### 3. Accessibility
- Screen reader announcements
- Keyboard navigation for reasoning toggle
- Focus management during transitions

### 4. Mobile Optimization
- Touch-friendly reasoning toggle
- Optimized animations for mobile
- Battery-conscious streaming frequency

## Example User Experience

```
User: "Explain quantum computing"

[AI Message appears]
┌─ Reasoning (Expanded, Streaming) ──────────────┐
│ 🤔 Thinking...                                 │
│ I need to explain quantum computing in a way   │
│ that's accessible. Let me break this down:     │
│ 1. Classical vs quantum bits                   │
│ 2. Superposition and entanglement             │
│ 3. Practical applications...                   │
└────────────────────────────────────────────────┘

[Reasoning completes, starts collapsing]

┌─ Reasoning ─┐
│ 🤔 View ▼   │  ← Collapsed
└─────────────┘

Quantum computing is a revolutionary approach... ← Starts streaming
```

## Benefits

1. **Engaging UX** - Users see AI "thinking" like ChatGPT
2. **Transparency** - Reasoning process is visible
3. **Faster Perceived Speed** - Content appears immediately
4. **Educational** - Users learn from AI's reasoning
5. **Professional Feel** - Matches modern AI interfaces

## Risk Mitigation

1. **Fallback System** - Always save complete message to DB
2. **Connection Handling** - Graceful degradation on disconnect
3. **Performance Monitoring** - Track streaming performance
4. **User Preference** - Option to disable streaming
5. **Testing Strategy** - Comprehensive streaming tests

This implementation will provide a sophisticated, ChatGPT-like streaming experience while maintaining the robustness of the current system.