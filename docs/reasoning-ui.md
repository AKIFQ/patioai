# Reasoning UI Implementation

This document explains the new reasoning UI feature that displays AI reasoning process for Gemini models.

## Overview

The reasoning UI shows the AI's thinking process as it streams, then automatically minimizes when the real answer starts. This provides transparency into how the AI arrives at its conclusions.

## Features

- **Streaming Display**: Shows reasoning text as it streams from the AI
- **Auto-minimization**: Automatically collapses when the main response begins
- **Visual Indicators**: 
  - Animated dots during streaming
  - Color-coded status indicators (blue for thinking, green for complete)
  - Smooth animations and transitions
- **Interactive**: Users can manually expand/collapse the reasoning section

## Supported Models

The reasoning UI is enabled for:
- `gemini-2.5-pro` - With `thinkingConfig` enabled
- `gemini-2.5-flash` - With `thinkingConfig` enabled

## Implementation Details

### Components

1. **StreamingReasoningUI** (`app/chat/components/StreamingReasoningUI.tsx`)
   - Main component that displays the reasoning interface
   - Handles streaming state and auto-minimization
   - Provides smooth animations and visual feedback

2. **useReasoningStream** (`app/chat/hooks/useReasoningStream.ts`)
   - Custom hook that detects reasoning content in streaming messages
   - Parses reasoning from various formats (`<thinking>`, `**Reasoning:**`, etc.)
   - Manages streaming state and completion detection

### API Configuration

The following API routes have been updated to enable reasoning streaming:

- `/api/chat/route.ts` - Main chat endpoint
- `/api/rooms/[shareCode]/chat/route.ts` - Room chat endpoint  
- `/api/perplexity/route.ts` - Perplexity endpoint
- `/api/websitechat/route.ts` - Website chat endpoint

All routes now include `sendReasoning: true` in their response configuration.

### Model Configuration

Gemini models are configured with thinking capabilities:

```typescript
if (selectedModel === 'gemini-2.5-pro' || selectedModel === 'gemini-2.5-flash') {
  providerOptions.google = {
    thinkingConfig: {
      thinkingBudget: 2048,
      includeThoughts: true
    }
  } satisfies GoogleGenerativeAIProviderOptions;
}
```

## Usage

### For Regular Chats

The reasoning UI automatically appears when using Gemini models that support reasoning. No additional configuration is needed.

### For Room Chats

The reasoning UI works in room chats as well, showing the AI's thinking process to all participants.

## Customization

### Styling

The reasoning UI uses Tailwind CSS classes and can be customized by modifying:
- Colors: Blue gradient theme with dark mode support
- Animations: Smooth transitions and pulse effects
- Layout: Responsive design that works on all screen sizes

### Behavior

Key behavioral aspects:
- **Auto-scroll**: Automatically scrolls to show new reasoning content
- **Auto-minimize**: Collapses after 1 second when reasoning is complete
- **Manual control**: Users can expand/collapse at any time

## Technical Notes

### Reasoning Detection

The system detects reasoning content using multiple patterns:
- `<thinking>...</thinking>` tags
- `**Reasoning:**` headers
- `**Thinking:**` headers

### Performance

- Uses `React.memo` for optimized re-rendering
- Implements efficient text parsing and state management
- Minimal impact on overall chat performance

## Future Enhancements

Potential improvements:
- Support for more reasoning formats
- Customizable auto-minimize timing
- Reasoning history and replay
- Export reasoning to external formats

## Troubleshooting

### Reasoning Not Showing

1. Verify the model supports reasoning (Gemini 2.5 Pro/Flash)
2. Check that `sendReasoning: true` is set in API configuration
3. Ensure `thinkingConfig` is properly configured for Gemini models

### Performance Issues

1. Check browser console for any JavaScript errors
2. Verify React DevTools for unnecessary re-renders
3. Monitor network tab for streaming response issues

## Testing

To test the reasoning UI:

1. Start a chat with `gemini-2.5-pro` or `gemini-2.5-flash`
2. Ask a complex question that requires reasoning
3. Observe the reasoning UI appearing and streaming
4. Verify auto-minimization when the main response begins