-- Migration to implement room user removal tracking system
-- Create removed_participants table to track users removed from rooms

CREATE TABLE IF NOT EXISTS "public"."removed_room_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "room_id" "uuid" NOT NULL,
    "removed_user_id" "uuid",
    "removed_session_id" "text",
    "removed_display_name" "text" NOT NULL,
    "removed_by" "uuid" NOT NULL,
    "removed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reason" "text" DEFAULT 'removed_by_creator'::text,
    CONSTRAINT "removed_room_participants_display_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "removed_display_name")) > 0))
);

-- Add foreign key constraints
ALTER TABLE ONLY "public"."removed_room_participants"
    ADD CONSTRAINT "removed_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."removed_room_participants"
    ADD CONSTRAINT "removed_room_participants_removed_user_id_fkey" FOREIGN KEY ("removed_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."removed_room_participants"
    ADD CONSTRAINT "removed_room_participants_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX "idx_removed_room_participants_room_id" ON "public"."removed_room_participants" USING "btree" ("room_id");
CREATE INDEX "idx_removed_room_participants_user_id" ON "public"."removed_room_participants" USING "btree" ("removed_user_id");
CREATE INDEX "idx_removed_room_participants_session_id" ON "public"."removed_room_participants" USING "btree" ("removed_session_id");

-- Grant permissions
ALTER TABLE "public"."removed_room_participants" OWNER TO "postgres";
GRANT ALL ON TABLE "public"."removed_room_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."removed_room_participants" TO "service_role";

-- Enable RLS
ALTER TABLE "public"."removed_room_participants" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Room creators can view removed participants" ON "public"."removed_room_participants" FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM "public"."rooms" "r"
        WHERE "r"."id" = "removed_room_participants"."room_id" 
        AND "r"."created_by" = "auth"."uid"()
    )
);

CREATE POLICY "Room creators can add removed participants" ON "public"."removed_room_participants" FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM "public"."rooms" "r"
        WHERE "r"."id" = "removed_room_participants"."room_id" 
        AND "r"."created_by" = "auth"."uid"()
    )
    AND "removed_by" = "auth"."uid"()
);

-- Function to check if a user is removed from a room
CREATE OR REPLACE FUNCTION "public"."is_user_removed_from_room"(
    "room_id_param" "uuid",
    "user_id_param" "uuid" DEFAULT NULL,
    "session_id_param" "text" DEFAULT NULL,
    "display_name_param" "text" DEFAULT NULL
) RETURNS boolean
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- Check if user is in removed_room_participants table
    RETURN EXISTS (
        SELECT 1 FROM "public"."removed_room_participants" 
        WHERE "room_id" = room_id_param
        AND (
            (user_id_param IS NOT NULL AND "removed_user_id" = user_id_param) OR
            (session_id_param IS NOT NULL AND "removed_session_id" = session_id_param) OR
            (display_name_param IS NOT NULL AND "removed_display_name" = display_name_param)
        )
    );
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION "public"."is_user_removed_from_room"("uuid", "uuid", "text", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_user_removed_from_room"("uuid", "uuid", "text", "text") TO "service_role";

-- Enhanced join_room_safely function to check for removed users
CREATE OR REPLACE FUNCTION "public"."join_room_safely"(
    "p_room_id" "uuid",
    "p_session_id" "text",
    "p_display_name" "text",
    "p_user_id" "uuid" DEFAULT NULL
) RETURNS "json"
LANGUAGE "plpgsql"
AS $$
DECLARE
  existing_participant boolean;
  current_count integer;
  max_count integer;
  room_expired boolean;
BEGIN
  -- Check if room has expired
  SELECT (expires_at <= NOW()) INTO room_expired 
  FROM rooms WHERE id = p_room_id;
  
  IF room_expired THEN
    RETURN json_build_object('success', false, 'error', 'Room has expired');
  END IF;
  
  -- Check if user was removed from the room
  IF is_user_removed_from_room(p_room_id, p_user_id, p_session_id, p_display_name) THEN
    RETURN json_build_object('success', false, 'error', 'REMOVED_FROM_ROOM');
  END IF;
  
  -- Get room capacity
  SELECT max_participants INTO max_count FROM rooms WHERE id = p_room_id;
  
  IF max_count IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Room not found');
  END IF;
  
  -- Check if participant already exists
  SELECT EXISTS(
    SELECT 1 FROM room_participants 
    WHERE room_id = p_room_id AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id) OR
        session_id = p_session_id
    )
  ) INTO existing_participant;
  
  IF existing_participant THEN
    -- Update existing participant (only if not removed)
    UPDATE room_participants 
    SET display_name = p_display_name,
        session_id = p_session_id,
        joined_at = NOW()
    WHERE room_id = p_room_id AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id) OR
        session_id = p_session_id
    );
    
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

-- Grant execute permission on the enhanced function
GRANT EXECUTE ON FUNCTION "public"."join_room_safely"("uuid", "text", "text", "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."join_room_safely"("uuid", "text", "text", "uuid") TO "service_role";