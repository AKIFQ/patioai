<div align="center">
  <img src="public/logos/logo-horizontal.png" alt="PatioAI Logo" height="400" width="400" />
  
  # PatioAI - Collaborative AI Chat Platform
  
  *A modern full-stack AI chat application that enables both personal and group conversations with AI*
  
  Built with Next.js 15, Supabase, and real-time collaboration features
</div>

## Features

### Authentication & User Management
- **Multiple Auth Methods**: Email/password, magic links, and OAuth (Google, GitHub)
- **User Profiles**: Persistent user data with profile management
- **Row Level Security**: Secure data access with Supabase RLS policies

### Personal AI Chat
- **Interactive Chat Interface**: Modern, responsive chat UI with streaming responses
- **Multiple AI Providers**: OpenAI, Anthropic, Google AI, and Perplexity integration
- **Chat History**: Persistent chat sessions with smart categorization (today, yesterday, last 7 days, etc.)
- **Document Upload & RAG**: Upload PDFs and chat with your documents using vector search
- **Web Search Integration**: AI can search the web for real-time information
- **File Attachments**: Support for various file types in conversations

### Group AI Chat (New!)
- **Collaborative Rooms**: Create shareable chat rooms for group AI conversations
- **Real-time Collaboration**: Live messaging with all participants seeing responses simultaneously
- **Easy Joining**: Share simple room codes (e.g., "VACATION-2024") - no registration required for participants
- **Participant Management**: See who's in the room with live participant lists
- **Message Attribution**: AI responses include context of who said what
- **Freemium Model**: Free (5 participants, 7 days) and Pro (20 participants, 30 days) tiers

### Advanced AI Features
- **RAG (Retrieval-Augmented Generation)**: Chat with your uploaded documents
- **Vector Search**: Semantic search through document content using pgvector
- **Multiple Chat Models**: Switch between different AI providers and models
- **Reasoning Display**: See AI's thought process (when available)
- **Source Citations**: AI responses include sources and references
- **Tool Integration**: AI can use various tools for enhanced responses

### User Experience
- **Modern UI**: Built with Radix UI components and Tailwind CSS
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Dark/Light Mode**: Theme switching support
- **Real-time Updates**: Live chat streaming and document processing
- **Smart Categorization**: Automatic organization of chat history
- **Typing Indicators**: See when AI or other users are typing

##  Tech Stack

### Frontend
- **Framework**: Next.js 15 with App Router and Server Components
- **UI Library**: Radix UI components with Tailwind CSS
- **Real-time**: Supabase Realtime for live collaboration
- **State Management**: React hooks with SWR for data fetching
- **Styling**: Tailwind CSS with custom design system

### Backend
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **Authentication**: Supabase Auth with multiple providers
- **Real-time**: Supabase Realtime channels
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

##  Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase project
- At least one AI provider API key

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd patioai
npm install
```

### 2. Environment Setup

Create a `.env.local` file in your project root:

```env
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

Visit `http://localhost:3000` to see your application!

### 6. Test Group Chat (Optional)

1. Create an account and sign in
2. Click "Create Group Chat" 
3. Share the generated room code with others
4. Test real-time messaging and AI responses

## 📝 Usage

### Personal AI Chat
1. **Sign Up/Sign In**: Create an account using email, magic link, or OAuth
2. **Start Chatting**: Begin conversations with AI using multiple providers
3. **Upload Documents**: Upload PDFs to chat with your documents using RAG
4. **Organize Chats**: View chat history organized by timriods
5. **Switch Models**: Choose between different AI providers and models

### Group AI Chat
1. **Create a Room**: Click "Create Group Chat" to generate a shareable room
2. **Share the Link**: Share the room code (e.g., "VACATION-2024") with others
3. **Join Conversations**: Participants enter a display name to join instantly
4. **Collaborate**: Chat with AI together, see real-time responses and participant activity
5. **Manage Rooms**: Room creators can see participant lists and room settings

### Document Chat (RAG)
1. **Upload PDFs**: Upload documents through the chat interface
2. **Ask Questions**: Query your documents using natural language
3. **Get Cited Answers**: Receive responses with page references and sources
4. **Semantic Search**: Find relevant content across all your documents

### Freemium Features
- **Free Tier**: 5 participants per room, 7-day room expiration, 30 messages/day per room
- **Pro Tier**: 20 participants per room, 30-day room expiration, 100 messages/day per room

## Troubleshooting

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

##  License

Licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

## Deployment

This application is optimized for deployment on Vercel:

1. **Connect Repository**: Import your GitHub repository to Vercel
2. **Environment Variables**: Add all environment variables from `.env.local`
3. **Deploy**: Vercel will automatically build and deploy your application
4. **Custom Domain**: Configure your custom domain in Vercel settings

### Environment Variables for Production
Make sure to set all required environment variables in your deployment platform:
- Supabase credentials
- AI provider API keys  
- OAuth credentials (if using)
- Optional services (Redis, Langfuse, etc.)


## License

This project is proprietary software owned by Akif Azher Qureshi. While it builds upon open source work by ElectricCodeGuy (originally MIT licensed), the modifications and derivative work are proprietary and confidential.

**Important**: This software is not open source. Unauthorized copying, modification, or distribution is strictly prohibited. See the [LICENSE.md](LICENSE.md) file for complete terms and restrictions.

For licensing inquiries, please contact Akif Azher Qureshi.
