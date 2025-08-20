# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
npm run dev                 # Start development server with custom Socket.IO server
npm run dev:next           # Start Next.js only (no Socket.IO server)
npm run build              # Build both server and Next.js app for production
npm run start              # Start production server
npm run lint               # Lint JavaScript/TypeScript files
```

### Build Commands
```bash
npm run build:server       # Build TypeScript server to dist/ directory
```

### Memory & Monitoring
```bash
npm run memory:report       # Generate memory usage report
npm run memory:cleanup      # Trigger manual memory cleanup
npm run memory:monitor      # Start continuous memory monitoring
npm run memory:thresholds   # Show memory threshold configuration
```

### Testing & Analysis
```bash
npm run analyze-bundle      # Analyze bundle size
npm run generate-types      # Generate Supabase types (requires project ID)
```

### Server Architecture
- **Custom Server**: Uses `server.ts` with Socket.IO for real-time features
- **Development**: Runs custom server that serves Next.js app
- **Production**: Same custom server for Socket.IO functionality
- The app requires the custom server to run properly due to Socket.IO integration

## Architecture Overview

### AI/Model System (OpenRouter-Based)
The application uses OpenRouter exclusively for AI model access with a sophisticated 3-tier routing system:

#### Model Configuration (`lib/ai/modelConfig.ts`)
- **Free Tier**: Auto-routing between `google/gemini-2.0-flash-exp:free` and `deepseek/deepseek-r1:free`
- **Basic Tier**: Same free models with paid fallbacks and higher limits
- **Premium Tier**: Access to advanced models like `openai/gpt-5` and `anthropic/claude-4` (when available)

#### Model Router (`lib/ai/modelRouter.ts`)
- Smart routing based on content analysis (code detection, academic content, complexity)
- Reasoning mode support (DeepSeek R1 for free/basic, o1-preview for premium)
- Cost control for premium users
- Context-aware model selection

#### OpenRouter Service (`lib/ai/openRouterService.ts`)
- Single OpenRouter client with proper headers and configuration
- Provider-specific reasoning configurations for different model families
- Cost estimation and model capability detection

### Real-time Architecture (Socket.IO)
- **Server**: `lib/server/socketHandlers.ts` - Main event handling
- **Client Manager**: `lib/client/socketManager.ts` - Connection management
- **Memory Management**: Built-in monitoring and cleanup systems
- **Room System**: Group chat with participant management and message broadcasting

### Database Architecture (Supabase)
- **PostgreSQL** with pgvector extension for document embeddings
- **Row Level Security (RLS)** for data isolation
- **Realtime subscriptions** for group chat features
- **Document storage** with semantic search capabilities

### Key Database Tables
- `users` - User profiles synced with auth.users
- `chat_sessions` & `chat_messages` - Personal chat history
- `user_documents` & `user_documents_vec` - Document storage and embeddings
- `rooms`, `room_messages`, `room_participants` - Group chat system
- `user_tiers` & `daily_message_usage` - Freemium system with usage tracking

## Development Patterns

### AI Integration
- Use `ModelRouter` for model selection instead of hardcoding models
- Check model availability with `isModelAvailableForTier()`
- Enable reasoning mode by passing `reasoningMode: true` to router
- All AI calls go through OpenRouter - no direct provider SDKs

### Socket.IO Usage
- Always use the custom server (`npm run dev`) for Socket.IO features
- Room management through `lib/server/socketHandlers.ts`
- Client connections managed by `lib/client/socketManager.ts`

### Database Operations
- Use Supabase client from `lib/server/supabase.ts`
- Respect RLS policies - queries are automatically filtered by user
- For document search, use the `match_documents()` SQL function

### Memory Management
- The app includes automatic memory monitoring and cleanup
- Memory thresholds: Warning at 2GB, Critical at 3GB
- Manual cleanup via API endpoints or npm scripts

## Environment Variables

### Required
- `OPENROUTER_API_KEY` - Single API key for all AI models
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Database
- `SUPABASE_SERVICE_ROLE_KEY` - For admin operations

### URLs (adjust for deployment)
- `NEXT_PUBLIC_APP_URL` & `APP_URL` - Application URLs
- `NEXT_PUBLIC_SOCKET_URL` - Socket.IO server URL (usually same as app URL)

### Optional Features
- `LLAMA_CLOUD_API_KEY` - Document processing
- `TAVILY_API_KEY` - Web search functionality
- `LANGFUSE_SECRET_KEY` - AI observability
- OAuth keys for Google/GitHub login

## Testing

### Running Tests
- Integration tests in `tests/` directory
- Performance tests: `scripts/load-test-socket.js`
- System validation: `validate-system.js`

### Key Test Areas
- Socket.IO connection handling
- AI model routing and responses
- Database RLS policies
- Memory management thresholds
- Real-time message broadcasting

## Common Tasks

### Adding New AI Models
1. Update `MODEL_TIERS` in `lib/ai/modelConfig.ts`
2. Add provider-specific configuration in `lib/ai/openRouterService.ts`
3. Test with different user tiers

### Debugging Real-time Issues
1. Check Socket.IO server is running (`npm run dev`)
2. Verify Supabase Realtime is enabled for required tables
3. Monitor browser console for WebSocket errors
4. Use `npm run memory:monitor` to check server health

### Database Schema Changes
1. Create migration in `supabase/migrations/`
2. Update types with `npm run generate-types`
3. Test RLS policies thoroughly

### Memory Issues
1. Use `npm run memory:report` to identify issues
2. Trigger cleanup with `npm run memory:cleanup`
3. Adjust thresholds in monitoring configuration if needed

## Important Notes

- The app requires the custom Socket.IO server to function properly
- All AI calls are routed through OpenRouter with automatic model selection
- Free tier users get smart auto-routing, paid tiers can choose specific models
- Reasoning models are opt-in only (not auto-selected for performance)
- Memory management is critical for production stability
- RLS policies enforce data isolation at the database level