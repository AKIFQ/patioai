-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

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
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

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
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_chat_session_id_fkey FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id)
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE public.user_documents_vec ENABLE ROW LEVEL SECURITY;

-- Group Chat Tables

-- User tiers table for managing free vs pro users
CREATE TABLE IF NOT EXISTS public.user_tiers (
  user_id uuid NOT NULL,
  tier varchar(10) NOT NULL DEFAULT 'free',
  upgraded_at timestamp with time zone,
  CONSTRAINT user_tiers_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_tiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
ALTER TABLE public.user_tiers ENABLE ROW LEVEL SECURITY;

-- Rooms table for group chat rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  created_by uuid NOT NULL,
  share_code text NOT NULL,
  creator_tier varchar(10) NOT NULL DEFAULT 'free',
  max_participants integer NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp with time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '7 days'),
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_share_code_unique UNIQUE (share_code),
  CONSTRAINT rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Room participants table for tracking who's in each room
CREATE TABLE IF NOT EXISTS public.room_participants (
  room_id uuid NOT NULL,
  session_id text NOT NULL,
  display_name text NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_participants_pkey PRIMARY KEY (room_id, session_id),
  CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE
);
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- Room chat sessions table for tracking individual chat sessions within rooms
CREATE TABLE IF NOT EXISTS public.room_chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  session_id text NOT NULL,
  display_name text NOT NULL,
  chat_title text,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT room_chat_sessions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE
);
ALTER TABLE public.room_chat_sessions ENABLE ROW LEVEL SECURITY;

-- Room messages table for group chat messages
CREATE TABLE IF NOT EXISTS public.room_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  room_chat_session_id uuid,
  sender_name text NOT NULL,
  content text,
  is_ai_response boolean NOT NULL DEFAULT false,
  sources jsonb,
  reasoning text,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_messages_pkey PRIMARY KEY (id),
  CONSTRAINT room_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE,
  CONSTRAINT room_messages_session_fkey FOREIGN KEY (room_chat_session_id) REFERENCES public.room_chat_sessions(id) ON DELETE CASCADE
);
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

-- Daily message usage tracking for rate limiting
CREATE TABLE IF NOT EXISTS public.daily_message_usage (
  user_id uuid NOT NULL,
  room_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0,
  CONSTRAINT daily_message_usage_pkey PRIMARY KEY (user_id, room_id, date),
  CONSTRAINT daily_message_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT daily_message_usage_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE
);
ALTER TABLE public.daily_message_usage ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_share_code ON public.rooms(share_code);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON public.rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON public.room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_chat_sessions_room_id ON public.room_chat_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_room_chat_sessions_session_id ON public.room_chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_id_created_at ON public.room_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_room_messages_session_id ON public.room_messages(room_chat_session_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_room_date ON public.daily_message_usage(user_id, room_id, date);

-- Row Level Security Policies

-- User tiers policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_tiers' AND policyname = 'Users can view their own tier') THEN
    CREATE POLICY "Users can view their own tier" ON public.user_tiers FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_tiers' AND policyname = 'Users can insert their own tier') THEN
    CREATE POLICY "Users can insert their own tier" ON public.user_tiers FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_tiers' AND policyname = 'Users can update their own tier') THEN
    CREATE POLICY "Users can update their own tier" ON public.user_tiers FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Rooms policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Users can view all rooms') THEN
    CREATE POLICY "Users can view all rooms" ON public.rooms FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Users can create their own rooms') THEN
    CREATE POLICY "Users can create their own rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Users can update their own rooms') THEN
    CREATE POLICY "Users can update their own rooms" ON public.rooms FOR UPDATE USING (auth.uid() = created_by);
  END IF;
END $$;

-- Room participants policies (allow all users to view and manage participants)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can view room participants') THEN
    CREATE POLICY "Users can view room participants" ON public.room_participants FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can join rooms') THEN
    CREATE POLICY "Users can join rooms" ON public.room_participants FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can update their participation') THEN
    CREATE POLICY "Users can update their participation" ON public.room_participants FOR UPDATE USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can leave rooms') THEN
    CREATE POLICY "Users can leave rooms" ON public.room_participants FOR DELETE USING (true);
  END IF;
END $$;

-- Room chat sessions policies (allow all users to view and manage sessions)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_chat_sessions' AND policyname = 'Users can view room chat sessions') THEN
    CREATE POLICY "Users can view room chat sessions" ON public.room_chat_sessions FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_chat_sessions' AND policyname = 'Users can create room chat sessions') THEN
    CREATE POLICY "Users can create room chat sessions" ON public.room_chat_sessions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_chat_sessions' AND policyname = 'Users can update room chat sessions') THEN
    CREATE POLICY "Users can update room chat sessions" ON public.room_chat_sessions FOR UPDATE USING (true);
  END IF;
END $$;

-- Room messages policies (allow all users to view and create messages)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_messages' AND policyname = 'Users can view room messages') THEN
    CREATE POLICY "Users can view room messages" ON public.room_messages FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_messages' AND policyname = 'Users can create room messages') THEN
    CREATE POLICY "Users can create room messages" ON public.room_messages FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Daily usage policies (users can only see their own usage)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_message_usage' AND policyname = 'Users can view their own usage') THEN
    CREATE POLICY "Users can view their own usage" ON public.daily_message_usage FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_message_usage' AND policyname = 'Users can insert their own usage') THEN
    CREATE POLICY "Users can insert their own usage" ON public.daily_message_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_message_usage' AND policyname = 'Users can update their own usage') THEN
    CREATE POLICY "Users can update their own usage" ON public.daily_message_usage FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$; 