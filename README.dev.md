# PatioAI - Developer Documentation

*Technical setup, deployment, and architecture guide for PatioAI*

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 15 with App Router and Server Components
- **UI Library**: Radix UI components with Tailwind CSS
- **Real-time**: Socket.IO for live collaboration
- **State Management**: React hooks with SWR for data fetching
- **Styling**: Tailwind CSS with custom design system

### Backend
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **Authentication**: Supabase Auth with multiple providers
- **Real-time**: Socket.IO server with memory monitoring
- **File Storage**: Supabase Storage for document uploads
- **Vector Search**: pgvector for semantic document search

### AI Integration
- **AI Providers**: OpenAI, Anthropic, Google AI, Perplexity
- **Document Processing**: LlamaIndex for PDF parsing and chunking
- **Vector Embeddings**: OpenAI embeddings for document search
- **Web Search**: Tavily API for real-time web information

### Infrastructure
- **Rate Limiting**: Upstash Redis (optional)
- **Telemetry**: Langfuse for AI observability (optional)
- **Deployment**: Vercel-ready with environment configuration
- **Monitoring**: Built-in memory management and performance monitoring

## 🚀 Quick Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase project
- At least one AI provider API key

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd patioai
npm install
```

### 2. Environment Configuration

Copy the environment template:
```bash
cp env.example .env.local
```

Configure your `.env.local`:

```env
# Core application URLs (for deployment, change these)
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
NEXT_PUBLIC_CLIENT_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:3000
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api

# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Provider Keys (Choose one or more)
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_api_key
PERPLEXITY_API_KEY=your_perplexity_api_key

# OAuth Configuration (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_SECRET_ID=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_SECRET_ID=your_github_client_secret

# Document Processing (Optional)
LLAMA_CLOUD_API_KEY=your_llamaindex_api_key

# Redis for Rate Limiting (Optional)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# Web Search (Optional)
TAVILY_API_KEY=your_tavily_api_key

# Telemetry (Optional)
LANGFUSE_SECRET_KEY=your_langfuse_secret_key

# Socket Configuration
SOCKET_TIMEOUT=20000
SOCKET_RETRIES=3
SOCKET_RECONNECTION_ATTEMPTS=5
SOCKET_RECONNECTION_DELAY=1000

# Testing
TEST_BASE_URL=http://127.0.0.1:3001
API_BASE=http://127.0.0.1:3000
SOCKET_URL=http://127.0.0.1:3000
```

### 3. Database Setup

#### Step 1: Enable Extensions
In your Supabase SQL Editor, run:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
```

#### Step 2: Create Tables
```sql
-- Users table (must exist before referencing in other tables)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  full_name text,
  email text,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  chat_title text,
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  chat_session_id uuid NOT NULL,
  content text,
  is_user_message boolean NOT NULL,
  sources jsonb,
  attachments jsonb,
  tool_invocations jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reasoning text,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_chat_session_id_fkey FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id)
);

-- User documents table
CREATE TABLE IF NOT EXISTS public.user_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  total_pages integer NOT NULL,
  ai_description text,
  ai_keyentities text[],
  ai_maintopics text[],
  ai_title text,
  filter_tags text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_documents_pkey PRIMARY KEY (id),
  CONSTRAINT user_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- User documents vector table
CREATE TABLE IF NOT EXISTS public.user_documents_vec (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  text_content text NOT NULL,
  page_number integer NOT NULL,
  embedding vector(1024),
  CONSTRAINT user_documents_vec_pkey PRIMARY KEY (id),
  CONSTRAINT user_documents_vec_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.user_documents(id)
);

-- Group chat rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  share_code text UNIQUE NOT NULL,
  creator_tier varchar(10) DEFAULT 'free',
  max_participants integer DEFAULT 5,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + interval '7 days'),
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Room messages table
CREATE TABLE IF NOT EXISTS public.room_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  sender_name text NOT NULL,
  content text,
  is_ai_response boolean DEFAULT false,
  sources jsonb,
  reasoning text,
  thread_id text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_messages_pkey PRIMARY KEY (id),
  CONSTRAINT room_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE
);

-- Room participants table
CREATE TABLE IF NOT EXISTS public.room_participants (
  room_id uuid NOT NULL,
  session_id text NOT NULL,
  display_name text NOT NULL,
  user_id uuid,
  joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  left_at timestamp with time zone,
  CONSTRAINT room_participants_pkey PRIMARY KEY (room_id, session_id),
  CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE,
  CONSTRAINT room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- User tiers table (for freemium model)
CREATE TABLE IF NOT EXISTS public.user_tiers (
  user_id uuid NOT NULL,
  tier varchar(10) DEFAULT 'free',
  upgraded_at timestamp with time zone,
  CONSTRAINT user_tiers_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_tiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Daily message usage tracking
CREATE TABLE IF NOT EXISTS public.daily_message_usage (
  user_id uuid NOT NULL,
  room_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE,
  message_count integer DEFAULT 0,
  CONSTRAINT daily_message_usage_pkey PRIMARY KEY (user_id, room_id, date),
  CONSTRAINT daily_message_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT daily_message_usage_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE
);
```

#### Step 3: Enable Row Level Security
```sql
-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents_vec ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_message_usage ENABLE ROW LEVEL SECURITY;
```

#### Step 4: Create RLS Policies
```sql
-- Users table policies
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Chat sessions policies  
CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own chat sessions" ON public.chat_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Chat messages policies
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = chat_session_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can create own chat messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = chat_session_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can update own chat messages" ON public.chat_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = chat_session_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can delete own chat messages" ON public.chat_messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = chat_session_id AND user_id = auth.uid())
  );

-- User documents policies
CREATE POLICY "Users can view own documents" ON public.user_documents
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own documents" ON public.user_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.user_documents
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.user_documents
  FOR DELETE USING (auth.uid() = user_id);

-- User documents vector policies
CREATE POLICY "Users can view own document vectors" ON public.user_documents_vec
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_documents WHERE id = document_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can create own document vectors" ON public.user_documents_vec
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_documents WHERE id = document_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can update own document vectors" ON public.user_documents_vec
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_documents WHERE id = document_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can delete own document vectors" ON public.user_documents_vec
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_documents WHERE id = document_id AND user_id = auth.uid())
  );

-- Rooms policies
CREATE POLICY "Users can view rooms they created or joined" ON public.rooms
  FOR SELECT USING (
    created_by = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = id AND user_id = auth.uid())
  );
CREATE POLICY "Authenticated users can create rooms" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Room creators can update their rooms" ON public.rooms
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Room creators can delete their rooms" ON public.rooms
  FOR DELETE USING (auth.uid() = created_by);

-- Room messages policies (allow participants to view all messages in their rooms)
CREATE POLICY "Participants can view room messages" ON public.room_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_participants 
      WHERE room_id = room_messages.room_id 
      AND (user_id = auth.uid() OR session_id = current_setting('app.session_id', true))
    )
  );
CREATE POLICY "Participants can create room messages" ON public.room_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_participants 
      WHERE room_id = room_messages.room_id 
      AND (user_id = auth.uid() OR session_id = current_setting('app.session_id', true))
    )
  );

-- Room participants policies
CREATE POLICY "Participants can view room participants" ON public.room_participants
  FOR SELECT USING (
    user_id = auth.uid() OR 
    session_id = current_setting('app.session_id', true) OR
    EXISTS (SELECT 1 FROM public.room_participants rp2 WHERE rp2.room_id = room_id AND rp2.user_id = auth.uid())
  );
CREATE POLICY "Users can join rooms as participants" ON public.room_participants
  FOR INSERT WITH CHECK (true); -- Allow joining, room capacity checked in application
CREATE POLICY "Users can update their own participation" ON public.room_participants
  FOR UPDATE USING (user_id = auth.uid() OR session_id = current_setting('app.session_id', true));

-- User tiers policies
CREATE POLICY "Users can view own tier" ON public.user_tiers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own tier" ON public.user_tiers
  FOR ALL USING (auth.uid() = user_id);

-- Daily message usage policies
CREATE POLICY "Users can view own usage" ON public.daily_message_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own usage" ON public.daily_message_usage
  FOR ALL USING (auth.uid() = user_id);
```

#### Step 5: Create User Sync Trigger (Essential!)
```sql
-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create public.users record
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to sync existing users (run once)
CREATE OR REPLACE FUNCTION public.sync_existing_users()
RETURNS void AS $$
DECLARE
  auth_user RECORD;
BEGIN
  FOR auth_user IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
    WHERE pu.id IS NULL
  LOOP
    INSERT INTO public.users (id, full_name, email)
    VALUES (
      auth_user.id,
      auth_user.raw_user_meta_data->>'full_name',
      auth_user.email
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sync any existing users
SELECT public.sync_existing_users();
```

#### Step 6: Create Vector Search Function
```sql
-- Similarity search function for document vectors
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1024),
  match_count int DEFAULT 10,
  filter_user_id uuid DEFAULT NULL,
  filter_files text[] DEFAULT NULL,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  text_content text,
  title text,
  doc_timestamp timestamp with time zone,
  ai_title text,
  ai_description text,
  ai_maintopics text[],
  ai_keyentities text[],
  filter_tags text,
  page_number int,
  total_pages int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    udv.id,
    udv.text_content,
    ud.title,
    ud.created_at as doc_timestamp,
    ud.ai_title,
    ud.ai_description,
    ud.ai_maintopics,
    ud.ai_keyentities,
    ud.filter_tags,
    udv.page_number,
    ud.total_pages,
    (1 - (udv.embedding <=> query_embedding)) AS similarity
  FROM user_documents_vec udv
  JOIN user_documents ud ON udv.document_id = ud.id
  WHERE 
    (filter_user_id IS NULL OR ud.user_id = filter_user_id)
    AND (filter_files IS NULL OR ud.filter_tags = ANY(filter_files))
    AND (1 - (udv.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY udv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### 4. Enable Realtime (Required for Group Chat)

In your Supabase dashboard:
1. Go to Settings → API
2. Enable Realtime for the following tables:
   - `room_messages`
   - `room_participants`

Or run this SQL in your Supabase SQL Editor:
```sql
-- Enable realtime for group chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
```

### 5. Run the Application

```bash
npm run dev
```

Visit the app at `NEXT_PUBLIC_APP_URL` (default `http://127.0.0.1:3000`).

## 🏗️ Architecture Overview

### Socket.IO Server Architecture

PatioAI uses a custom Socket.IO server integrated with Next.js for real-time features:

- **Server**: `server.ts` - Custom Node.js server with Socket.IO
- **Handlers**: `lib/server/socketHandlers.ts` - Event handling logic
- **Monitoring**: Built-in memory management and performance monitoring
- **Client**: `lib/client/socketManager.ts` - Client-side connection management

### Memory Management System

The application includes a sophisticated memory management system:

- **Memory Manager**: `lib/monitoring/memoryManager.ts` - Automatic cleanup
- **Performance Monitor**: `lib/monitoring/performanceMonitor.ts` - Performance tracking
- **Alert System**: `lib/monitoring/alertSystem.ts` - Memory threshold alerts
- **Socket Monitor**: `lib/monitoring/socketMonitor.ts` - Connection tracking

### Database Architecture

- **PostgreSQL with pgvector** for semantic search
- **Row Level Security (RLS)** for data isolation
- **Real-time subscriptions** for live updates
- **Optimized indexes** for performance

## 🚀 Deployment

### Vercel Deployment

1. **Connect Repository**: Import your GitHub repository to Vercel
2. **Environment Variables**: Add all environment variables from `.env.local`
3. **Build Settings**: Vercel will auto-detect Next.js configuration
4. **Deploy**: Automatic deployment on push

### Environment Variables for Production

Update these URLs for production:

```env
# Production URLs
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_CLIENT_URL=https://your-domain.com
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api

# Keep all other variables the same
```

### Custom Server Deployment

For platforms that support custom servers (Railway, Render, etc.):

```bash
# Build the application
npm run build

# Start the custom server
npm run start:server
```

## 🧪 Testing & Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server
npm run start:server    # Start custom Socket.IO server

# Testing
npm run test           # Run tests
npm run test:e2e       # Run end-to-end tests
npm run test:load      # Run load tests

# Monitoring
npm run monitor        # Start memory monitor
npm run validate       # Validate system health
```

### Development Tools

- **Memory Monitor**: `npm run monitor` - Real-time memory usage
- **System Validator**: `npm run validate` - Health checks
- **Load Testing**: `scripts/load-test-socket.js` - Socket.IO load testing

## 🔧 Configuration

### Socket.IO Configuration

Configure Socket.IO behavior via environment variables:

```env
SOCKET_TIMEOUT=20000                    # Connection timeout
SOCKET_RETRIES=3                       # Retry attempts
SOCKET_RECONNECTION_ATTEMPTS=5         # Auto-reconnection attempts
SOCKET_RECONNECTION_DELAY=1000         # Reconnection delay
```

### AI Provider Configuration

Each AI provider can be configured independently:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic  
ANTHROPIC_API_KEY=sk-ant-...

# Google AI
GOOGLE_GENERATIVE_AI_API_KEY=...

# Perplexity
PERPLEXITY_API_KEY=pplx-...
```

### Rate Limiting

Configure rate limiting with Upstash Redis:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## 🐛 Troubleshooting

### Common Issues

#### Database & Authentication
1. **User sync issues**
   - Ensure the user sync trigger was created properly
   - Try signing out and signing back in
   - Check that the `public.users` table exists

2. **Database connection errors**
   - Verify your Supabase environment variables
   - Check that all SQL steps were executed successfully
   - Ensure RLS policies are properly configured

#### Group Chat Issues
3. **Real-time not working**
   - Verify Realtime is enabled for `room_messages` and `room_participants` tables
   - Check browser console for WebSocket connection errors
   - Ensure Supabase project has Realtime enabled

4. **Can't join rooms**
   - Check if room has expired (7 days for free, 30 days for pro)
   - Verify room participant limits (5 for free, 20 for pro)
   - Check browser console for API errors

5. **Messages not syncing**
   - Check network connection
   - Verify Realtime subscription is active
   - Try refreshing the page

#### AI & Document Issues
6. **AI responses not working**
   - Verify AI provider API keys are set correctly
   - Check rate limits on your AI provider accounts
   - Review API usage quotas

7. **Document upload/RAG not working**
   - Ensure `LLAMA_CLOUD_API_KEY` is set (if using LlamaIndex)
   - Check file size limits (usually 10MB max)
   - Verify pgvector extension is installed

#### General Issues
8. **Application features not working**
   - Check your configuration and environment variables
   - Verify all required services are properly set up
   - Check browser console and network tab for errors

### Debug Mode
Enable debug logging by setting:
```env
NODE_ENV=development
```

This will show additional console logs for troubleshooting real-time connections and API calls.

## 📊 Monitoring & Performance

### Built-in Monitoring

The application includes comprehensive monitoring:

- **Memory Usage**: Automatic cleanup at configurable thresholds
- **Performance Metrics**: Operation timing and success rates
- **Socket Connections**: Connection tracking and cleanup
- **Error Tracking**: Categorized error logging and alerting

### Memory Management

The system automatically manages memory with:

- **Automatic Cleanup**: Triggered at memory thresholds
- **Configurable Thresholds**: Warning (2GB) and Critical (3GB) levels
- **Manual Triggers**: API endpoints for manual cleanup
- **Monitoring Dashboard**: Real-time memory usage display

### API Monitoring Endpoints

```bash
# Health check
GET /api/health

# Memory status
GET /api/monitoring/memory

# Performance metrics
GET /api/monitoring/performance

# Trigger cleanup
POST /api/monitoring/memory
```

## 🔒 Security

### Authentication

- **Multiple Providers**: Email, magic link, OAuth (Google, GitHub)
- **JWT Tokens**: Secure token-based authentication
- **Row Level Security**: Database-level access control

### Data Protection

- **Encryption**: All data encrypted at rest and in transit
- **CORS Configuration**: Properly configured cross-origin policies
- **Input Validation**: Comprehensive input sanitization
- **Rate Limiting**: Protection against abuse

### Environment Security

- **Secret Management**: All secrets via environment variables
- **CSRF Protection**: Built-in CSRF token validation
- **Audit Logging**: Security event logging and monitoring

## 📚 Advanced Topics

### Scaling for High Traffic

For applications expecting 1000+ concurrent users:

#### Option 1: Custom WebSocket Server
```env
NEXT_PUBLIC_REALTIME_PROVIDER=websocket
NEXT_PUBLIC_WEBSOCKET_URL=ws://your-websocket-server.com
```

#### Option 2: Pusher (Medium Scale)
```env
NEXT_PUBLIC_REALTIME_PROVIDER=pusher
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=us2
```

#### Option 3: Socket.IO with Redis
For enterprise scale, implement Socket.IO with Redis clustering.

### Custom AI Providers

To add custom AI providers:

1. Create provider in `lib/ai/providers/`
2. Update provider selection logic
3. Add environment variables
4. Test integration

### Document Processing Customization

Customize document processing:

1. Modify chunking strategy in `lib/documents/`
2. Adjust embedding model
3. Update vector search parameters
4. Configure similarity thresholds

## 🤝 Contributing

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request

### Code Standards

- **TypeScript**: Full type safety
- **ESLint**: Code quality enforcement
- **Prettier**: Code formatting
- **Testing**: Comprehensive test coverage

### Pull Request Guidelines

- Clear description of changes
- Tests for new features
- Documentation updates
- Performance considerations

---

**Need help?** Check the [main README](./README.md) for user documentation or open an issue for technical support. 