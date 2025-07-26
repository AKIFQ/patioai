#  AI Chat Bot with RAG (Retrieval-Augmented Generation)

A modern full-stack web application built with Next.js 15 and Supabase. Customize it for your specific use case.

##  Features

-  **Authentication**: Email/password, magic links, and OAuth (Google, GitHub)
- **Chat Interface**: Interactive messaging system
- **File Management**: Upload and manage files
- **Content Management**: Handle various types of content
-  **Responsive UI**: Modern interface built with Radix UI and Tailwind CSS
-  **Row Level Security**: Secure data access with Supabase RLS policies
-  **Chat History**: Persistent chat sessions with categorization
-  **Real-time Updates**: Live chat streaming and document processing

##  Tech Stack

- **Framework**: Next.js 15 with App Router and Server Components
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **Authentication**: Supabase Auth
- **AI Providers**: OpenAI, Anthropic, Google AI, Perplexity
- **Vector Database**: pgvector for semantic search
- **UI**: Radix UI components with Tailwind CSS
- **Document Processing**: LlamaIndex for PDF parsing
- **Rate Limiting**: Upstash Redis
- **Telemetry**: Langfuse (optional)

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
```

#### Step 3: Enable Row Level Security
```sql
-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents_vec ENABLE ROW LEVEL SECURITY;
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

### 4. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` to see your application!

## 📝 Usage

1. **Sign Up/Sign In**: Create an account or sign in with existing credentials
2. **Customize**: Adapt the application to your specific needs
3. **Build**: Add your features and functionality

## 🔧 Troubleshooting

### Common Issues

3. **User sync issues**
   - Ensure the user sync trigger was created properly
   - Try signing out and signing back in

2. **Database connection errors**
   - Verify your Supabase environment variables
   - Check that all SQL steps were executed successfully

3. **Application features not working**
   - Check your configuration and environment variables
   - Verify all required services are properly set up

##  License

Licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

##  Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

##  Support

If you encounter any issues, please check the troubleshooting section above or open an issue on GitHub. 