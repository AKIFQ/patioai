

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cleanup_expired_rooms"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM rooms WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true, 
    'deleted_rooms', deleted_count,
    'timestamp', NOW()
  );
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_rooms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_room_messages"("room_id_param" "uuid", "limit_param" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "room_id" "uuid", "sender_name" "text", "content" "text", "is_ai_response" boolean, "created_at" timestamp with time zone, "room_chat_session_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rm.id,
    rm.room_id,
    rm.sender_name,
    rm.content,
    rm.is_ai_response,
    rm.created_at,
    rm.room_chat_session_id
  FROM room_messages rm
  WHERE rm.room_id = room_id_param
  ORDER BY rm.created_at DESC
  LIMIT limit_param;
END;
$$;


ALTER FUNCTION "public"."get_recent_room_messages"("room_id_param" "uuid", "limit_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_id_from_share_code"("share_code_param" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  room_uuid uuid;
BEGIN
  SELECT id INTO room_uuid
  FROM rooms 
  WHERE share_code = share_code_param;
  
  RETURN room_uuid;
END;
$$;


ALTER FUNCTION "public"."get_room_id_from_share_code"("share_code_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_info_by_share_code"("share_code_param" "text") RETURNS TABLE("room_id" "uuid", "room_name" "text", "share_code" "text", "max_participants" integer, "creator_tier" character varying, "expires_at" timestamp with time zone, "created_at" timestamp with time zone, "created_by" "uuid", "participant_count" integer, "is_expired" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    r.share_code,
    r.max_participants,
    r.creator_tier,
    r.expires_at,
    r.created_at,
    r.created_by,
    get_room_participant_count(r.id) as participant_count,
    (r.expires_at <= NOW()) as is_expired
  FROM rooms r
  WHERE r.share_code = share_code_param;
END;
$$;


ALTER FUNCTION "public"."get_room_info_by_share_code"("share_code_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_participant_count"("room_id_param" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  participant_count integer;
BEGIN
  SELECT COUNT(*) 
  INTO participant_count
  FROM room_participants 
  WHERE room_id = room_id_param;
  
  RETURN COALESCE(participant_count, 0);
END;
$$;


ALTER FUNCTION "public"."get_room_participant_count"("room_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  total_rooms integer;
  active_rooms integer;
  expired_rooms integer;
  total_participants integer;
BEGIN
  SELECT COUNT(*) FROM rooms INTO total_rooms;
  SELECT COUNT(*) FROM rooms WHERE expires_at > NOW() INTO active_rooms;
  SELECT COUNT(*) FROM rooms WHERE expires_at <= NOW() INTO expired_rooms;
  SELECT COUNT(*) FROM room_participants INTO total_participants;
  
  RETURN json_build_object(
    'total_rooms', total_rooms,
    'active_rooms', active_rooms,
    'expired_rooms', expired_rooms,
    'total_participants', total_participants,
    'timestamp', NOW()
  );
END;
$$;


ALTER FUNCTION "public"."get_room_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_rooms_with_counts"("user_id_param" "uuid") RETURNS TABLE("room_id" "uuid", "room_name" "text", "share_code" "text", "max_participants" integer, "creator_tier" character varying, "expires_at" timestamp with time zone, "created_at" timestamp with time zone, "created_by" "uuid", "participant_count" integer, "is_creator" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    r.share_code,
    r.max_participants,
    r.creator_tier,
    r.expires_at,
    r.created_at,
    r.created_by,
    get_room_participant_count(r.id) as participant_count,
    (r.created_by = user_id_param) as is_creator
  FROM rooms r
  WHERE 
    -- User created the room
    r.created_by = user_id_param
    OR
    -- User is a participant in the room
    EXISTS (
      SELECT 1 FROM room_participants rp 
      WHERE rp.room_id = r.id 
      AND rp.user_id = user_id_param
    )
  AND r.expires_at > NOW()
  ORDER BY r.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_user_rooms_with_counts"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_daily_usage"("p_user_id" "uuid", "p_room_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO daily_message_usage (user_id, room_id, date, message_count)
  VALUES (p_user_id, p_room_id, p_date, 1)
  ON CONFLICT (user_id, room_id, date)
  DO UPDATE SET message_count = daily_message_usage.message_count + 1
  RETURNING message_count INTO new_count;
  
  RETURN new_count;
END;
$$;


ALTER FUNCTION "public"."increment_daily_usage"("p_user_id" "uuid", "p_room_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_room_safely"("p_room_id" "uuid", "p_session_id" "text", "p_display_name" "text", "p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_count integer;
  max_count integer;
  existing_participant boolean;
  room_expired boolean;
BEGIN
  -- Check if room exists and get max participants
  SELECT max_participants, expires_at < NOW() 
  INTO max_count, room_expired
  FROM rooms 
  WHERE id = p_room_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Room not found');
  END IF;
  
  IF room_expired THEN
    RETURN json_build_object('success', false, 'error', 'Room has expired');
  END IF;
  
  -- Check if participant already exists
  SELECT EXISTS(
    SELECT 1 FROM room_participants 
    WHERE room_id = p_room_id AND user_id = p_user_id
  ) INTO existing_participant;
  
  IF existing_participant THEN
    -- Update existing participant
    UPDATE room_participants 
    SET display_name = p_display_name,
        session_id = p_session_id,
        joined_at = NOW()
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    RETURN json_build_object('success', true, 'message', 'Updated existing participation');
  ELSE
    -- Check current participant count atomically
    SELECT COUNT(*) FROM room_participants 
    WHERE room_id = p_room_id INTO current_count;
    
    IF current_count >= max_count THEN
      RETURN json_build_object('success', false, 'error', 'Room is full');
    END IF;
    
    -- Insert new participant
    INSERT INTO room_participants (room_id, session_id, display_name, user_id)
    VALUES (p_room_id, p_session_id, p_display_name, p_user_id);
    
    RETURN json_build_object('success', true, 'message', 'Successfully joined room');
  END IF;
  
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Room capacity exceeded due to concurrent joins');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."join_room_safely"("p_room_id" "uuid", "p_session_id" "text", "p_display_name" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 10, "filter_user_id" "uuid" DEFAULT NULL::"uuid", "filter_files" "text"[] DEFAULT NULL::"text"[], "similarity_threshold" double precision DEFAULT 0.5) RETURNS TABLE("id" "uuid", "text_content" "text", "title" "text", "doc_timestamp" timestamp with time zone, "ai_title" "text", "ai_description" "text", "ai_maintopics" "text"[], "ai_keyentities" "text"[], "filter_tags" "text", "page_number" integer, "total_pages" integer, "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_count" integer, "filter_user_id" "uuid", "filter_files" "text"[], "similarity_threshold" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_session_context"("session_id_param" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM set_config('app.session_id', session_id_param, true);
END;
$$;


ALTER FUNCTION "public"."set_session_context"("session_id_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_existing_users"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  auth_user RECORD;
BEGIN
  -- Loop through all auth.users that don't have a corresponding public.users record
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
$$;


ALTER FUNCTION "public"."sync_existing_users"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_session_id" "uuid" NOT NULL,
    "content" "text",
    "is_user_message" boolean NOT NULL,
    "sources" "jsonb",
    "attachments" "jsonb",
    "tool_invocations" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reasoning" "text"
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "chat_title" "text"
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_message_usage" (
    "user_id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "message_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."daily_message_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "chat_title" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."room_chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "sender_name" "text" NOT NULL,
    "content" "text",
    "is_ai_response" boolean DEFAULT false NOT NULL,
    "sources" "jsonb",
    "reasoning" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "room_chat_session_id" "uuid"
);


ALTER TABLE "public"."room_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_participants" (
    "room_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "user_id" "uuid",
    CONSTRAINT "room_participants_display_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "display_name")) > 0))
);


ALTER TABLE "public"."room_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "created_by" "uuid" NOT NULL,
    "share_code" "text" NOT NULL,
    "creator_tier" character varying(10) DEFAULT 'free'::character varying NOT NULL,
    "max_participants" integer DEFAULT 5 NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '7 days'::interval) NOT NULL,
    CONSTRAINT "rooms_max_participants_valid" CHECK ((("max_participants" > 0) AND ("max_participants" <= 50))),
    CONSTRAINT "rooms_name_not_empty" CHECK ((("name" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "name")) > 0)))
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "total_pages" integer NOT NULL,
    "ai_description" "text",
    "ai_keyentities" "text"[],
    "ai_maintopics" "text"[],
    "ai_title" "text",
    "filter_tags" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."user_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_documents_vec" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "text_content" "text" NOT NULL,
    "page_number" integer NOT NULL,
    "embedding" "extensions"."vector"(1024)
);


ALTER TABLE "public"."user_documents_vec" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tiers" (
    "user_id" "uuid" NOT NULL,
    "tier" character varying(10) DEFAULT 'free'::character varying NOT NULL,
    "upgraded_at" timestamp with time zone
);


ALTER TABLE "public"."user_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_message_usage"
    ADD CONSTRAINT "daily_message_usage_pkey" PRIMARY KEY ("user_id", "room_id", "date");



ALTER TABLE ONLY "public"."room_chat_sessions"
    ADD CONSTRAINT "room_chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_chat_sessions"
    ADD CONSTRAINT "room_chat_sessions_room_session_unique" UNIQUE ("room_id", "session_id");



ALTER TABLE ONLY "public"."room_messages"
    ADD CONSTRAINT "room_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_participants"
    ADD CONSTRAINT "room_participants_pkey" PRIMARY KEY ("room_id", "session_id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_share_code_unique" UNIQUE ("share_code");



ALTER TABLE ONLY "public"."user_documents"
    ADD CONSTRAINT "user_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_documents"
    ADD CONSTRAINT "user_documents_user_title_unique" UNIQUE ("user_id", "title");



ALTER TABLE ONLY "public"."user_documents_vec"
    ADD CONSTRAINT "user_documents_vec_document_page_unique" UNIQUE ("document_id", "page_number");



ALTER TABLE ONLY "public"."user_documents_vec"
    ADD CONSTRAINT "user_documents_vec_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tiers"
    ADD CONSTRAINT "user_tiers_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "chat_sessions_created_at_idx" ON "public"."chat_sessions" USING "btree" ("created_at");



CREATE INDEX "idx_chat_messages_chat_session_id" ON "public"."chat_messages" USING "btree" ("chat_session_id");



CREATE INDEX "idx_chat_messages_session_created" ON "public"."chat_messages" USING "btree" ("chat_session_id", "created_at");



CREATE INDEX "idx_chat_sessions_created_at" ON "public"."chat_sessions" USING "btree" ("created_at");



CREATE INDEX "idx_chat_sessions_user_created" ON "public"."chat_sessions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_chat_sessions_user_id" ON "public"."chat_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_room_chat_sessions_room_id" ON "public"."room_chat_sessions" USING "btree" ("room_id");



CREATE INDEX "idx_room_chat_sessions_room_session" ON "public"."room_chat_sessions" USING "btree" ("room_id", "session_id");



CREATE INDEX "idx_room_chat_sessions_session_id" ON "public"."room_chat_sessions" USING "btree" ("session_id");



CREATE INDEX "idx_room_chat_sessions_updated_at" ON "public"."room_chat_sessions" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_room_messages_realtime" ON "public"."room_messages" USING "btree" ("room_id", "created_at" DESC, "id");



CREATE INDEX "idx_room_messages_room_ai_created" ON "public"."room_messages" USING "btree" ("room_id", "is_ai_response", "created_at");



CREATE INDEX "idx_room_messages_room_id_created_at" ON "public"."room_messages" USING "btree" ("room_id", "created_at");



CREATE INDEX "idx_room_messages_session_created" ON "public"."room_messages" USING "btree" ("room_chat_session_id", "created_at");



CREATE INDEX "idx_room_messages_session_id" ON "public"."room_messages" USING "btree" ("room_chat_session_id");



CREATE INDEX "idx_room_messages_session_null" ON "public"."room_messages" USING "btree" ("room_id", "room_chat_session_id") WHERE ("room_chat_session_id" IS NULL);



CREATE INDEX "idx_room_participants_room_id" ON "public"."room_participants" USING "btree" ("room_id");



CREATE INDEX "idx_room_participants_user_id" ON "public"."room_participants" USING "btree" ("user_id");



CREATE INDEX "idx_rooms_created_by" ON "public"."rooms" USING "btree" ("created_by");



CREATE INDEX "idx_rooms_expires_at" ON "public"."rooms" USING "btree" ("expires_at");



CREATE INDEX "idx_user_documents_filter_tags" ON "public"."user_documents" USING "btree" ("filter_tags");



CREATE INDEX "idx_user_documents_user_created" ON "public"."user_documents" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_user_documents_user_id" ON "public"."user_documents" USING "btree" ("user_id");



CREATE INDEX "idx_user_documents_vec_document_id" ON "public"."user_documents_vec" USING "btree" ("document_id");



CREATE INDEX "user_documents_vec_embedding_idx" ON "public"."user_documents_vec" USING "hnsw" ("embedding" "extensions"."vector_l2_ops") WITH ("m"='16', "ef_construction"='64');



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."daily_message_usage"
    ADD CONSTRAINT "daily_message_usage_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_message_usage"
    ADD CONSTRAINT "daily_message_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."room_chat_sessions"
    ADD CONSTRAINT "room_chat_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_messages"
    ADD CONSTRAINT "room_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_messages"
    ADD CONSTRAINT "room_messages_session_fkey" FOREIGN KEY ("room_chat_session_id") REFERENCES "public"."room_chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_participants"
    ADD CONSTRAINT "room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_participants"
    ADD CONSTRAINT "room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_documents"
    ADD CONSTRAINT "user_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_documents_vec"
    ADD CONSTRAINT "user_documents_vec_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."user_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tiers"
    ADD CONSTRAINT "user_tiers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



CREATE POLICY "Authenticated users can join available rooms" ON "public"."room_participants" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND (( SELECT "count"(*) AS "count"
   FROM "public"."room_participants" "room_participants_1"
  WHERE ("room_participants_1"."room_id" = "room_participants_1"."room_id")) < ( SELECT "rooms"."max_participants"
   FROM "public"."rooms"
  WHERE ("rooms"."id" = "room_participants"."room_id"))) AND (( SELECT "rooms"."expires_at"
   FROM "public"."rooms"
  WHERE ("rooms"."id" = "room_participants"."room_id")) > "now"())));



CREATE POLICY "Participants can create room chat sessions" ON "public"."room_chat_sessions" FOR INSERT WITH CHECK (((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_chat_sessions"."room_id") AND ("rp"."user_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_chat_sessions"."room_id") AND ("rp"."session_id" = "current_setting"('app.session_id'::"text", true)))))));



CREATE POLICY "Participants can create room messages" ON "public"."room_messages" FOR INSERT WITH CHECK (((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_messages"."room_id") AND ("rp"."user_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_messages"."room_id") AND ("rp"."session_id" = "current_setting"('app.session_id'::"text", true)))))));



CREATE POLICY "Participants can update own chat sessions" ON "public"."room_chat_sessions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_chat_sessions"."room_id") AND ("rp"."user_id" = "auth"."uid"()) AND ("rp"."session_id" = "room_chat_sessions"."session_id")))));



CREATE POLICY "Users can create own chat messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."chat_session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create own chat sessions" ON "public"."chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own document vectors" ON "public"."user_documents_vec" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_documents"
  WHERE (("user_documents"."id" = "user_documents_vec"."document_id") AND ("user_documents"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create own documents" ON "public"."user_documents" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own rooms" ON "public"."rooms" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete own chat messages" ON "public"."chat_messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."chat_session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own chat sessions" ON "public"."chat_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own document vectors" ON "public"."user_documents_vec" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_documents"
  WHERE (("user_documents"."id" = "user_documents_vec"."document_id") AND ("user_documents"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own documents" ON "public"."user_documents" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own rooms" ON "public"."rooms" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can insert own data" ON "public"."users" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own tier" ON "public"."user_tiers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own usage" ON "public"."daily_message_usage" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave or be removed by creator" ON "public"."room_participants" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."rooms" "r"
  WHERE (("r"."id" = "room_participants"."room_id") AND ("r"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Users can only access their own document vectors" ON "public"."user_documents_vec" USING ((EXISTS ( SELECT 1
   FROM "public"."user_documents"
  WHERE (("user_documents"."id" = "user_documents_vec"."document_id") AND ("user_documents"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can only access their own documents" ON "public"."user_documents" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own chat messages" ON "public"."chat_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."chat_session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own chat sessions" ON "public"."chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own data" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own document vectors" ON "public"."user_documents_vec" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_documents"
  WHERE (("user_documents"."id" = "user_documents_vec"."document_id") AND ("user_documents"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own documents" ON "public"."user_documents" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own participation" ON "public"."room_participants" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own rooms" ON "public"."rooms" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own tier" ON "public"."user_tiers" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own usage" ON "public"."daily_message_usage" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view all rooms" ON "public"."rooms" FOR SELECT USING (true);



CREATE POLICY "Users can view messages from their sessions" ON "public"."chat_messages" USING (("chat_session_id" IN ( SELECT "chat_sessions"."id"
   FROM "public"."chat_sessions"
  WHERE ("chat_sessions"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own chat messages" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."chat_session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own chat sessions" ON "public"."chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own data" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view own document vectors" ON "public"."user_documents_vec" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_documents"
  WHERE (("user_documents"."id" = "user_documents_vec"."document_id") AND ("user_documents"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own documents" ON "public"."user_documents" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view room chat sessions for accessible rooms" ON "public"."room_chat_sessions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_chat_sessions"."room_id") AND ("rp"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_chat_sessions"."room_id") AND ("rp"."session_id" = "current_setting"('my.session_id'::"text", true))))) OR (EXISTS ( SELECT 1
   FROM "public"."rooms" "r"
  WHERE (("r"."id" = "room_chat_sessions"."room_id") AND ("r"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Users can view room messages for accessible rooms" ON "public"."room_messages" FOR SELECT USING (((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_messages"."room_id") AND ("rp"."user_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE (("rp"."room_id" = "room_messages"."room_id") AND ("rp"."session_id" = "current_setting"('app.session_id'::"text", true))))) OR (("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."rooms" "r"
  WHERE (("r"."id" = "room_messages"."room_id") AND ("r"."created_by" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp"
  WHERE ("rp"."room_id" = "room_messages"."room_id")))));



CREATE POLICY "Users can view room participants for accessible rooms" ON "public"."room_participants" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp2"
  WHERE (("rp2"."room_id" = "room_participants"."room_id") AND ("rp2"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_participants" "rp2"
  WHERE (("rp2"."room_id" = "room_participants"."room_id") AND ("rp2"."session_id" = "current_setting"('my.session_id'::"text", true))))) OR (EXISTS ( SELECT 1
   FROM "public"."rooms" "r"
  WHERE (("r"."id" = "room_participants"."room_id") AND ("r"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own tier" ON "public"."user_tiers" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own usage" ON "public"."daily_message_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_message_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_documents_vec" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_participants";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";















































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."cleanup_expired_rooms"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_rooms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_rooms"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_room_messages"("room_id_param" "uuid", "limit_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_room_messages"("room_id_param" "uuid", "limit_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_room_messages"("room_id_param" "uuid", "limit_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_room_id_from_share_code"("share_code_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_id_from_share_code"("share_code_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_id_from_share_code"("share_code_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_room_info_by_share_code"("share_code_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_info_by_share_code"("share_code_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_info_by_share_code"("share_code_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_room_participant_count"("room_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_participant_count"("room_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_participant_count"("room_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_room_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_rooms_with_counts"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_rooms_with_counts"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_rooms_with_counts"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_daily_usage"("p_user_id" "uuid", "p_room_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_daily_usage"("p_user_id" "uuid", "p_room_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_daily_usage"("p_user_id" "uuid", "p_room_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_room_safely"("p_room_id" "uuid", "p_session_id" "text", "p_display_name" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."join_room_safely"("p_room_id" "uuid", "p_session_id" "text", "p_display_name" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_room_safely"("p_room_id" "uuid", "p_session_id" "text", "p_display_name" "text", "p_user_id" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."set_session_context"("session_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_session_context"("session_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_session_context"("session_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_existing_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_existing_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_existing_users"() TO "service_role";






























GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_message_usage" TO "anon";
GRANT ALL ON TABLE "public"."daily_message_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_message_usage" TO "service_role";



GRANT ALL ON TABLE "public"."room_chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."room_chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."room_chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."room_messages" TO "anon";
GRANT ALL ON TABLE "public"."room_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."room_messages" TO "service_role";



GRANT ALL ON TABLE "public"."room_participants" TO "anon";
GRANT ALL ON TABLE "public"."room_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."room_participants" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."user_documents" TO "anon";
GRANT ALL ON TABLE "public"."user_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."user_documents" TO "service_role";



GRANT ALL ON TABLE "public"."user_documents_vec" TO "anon";
GRANT ALL ON TABLE "public"."user_documents_vec" TO "authenticated";
GRANT ALL ON TABLE "public"."user_documents_vec" TO "service_role";



GRANT ALL ON TABLE "public"."user_tiers" TO "anon";
GRANT ALL ON TABLE "public"."user_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
