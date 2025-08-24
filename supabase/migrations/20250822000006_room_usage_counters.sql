-- Room Usage Counters Migration
-- Enables room-level usage tracking for messages, AI responses, and threads
-- This is the critical foundation for room-centric rate limiting

-- Create room usage counters table
CREATE TABLE IF NOT EXISTS public.room_usage_counters (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN ('messages', 'ai_responses', 'threads', 'reasoning_messages')),
  period text NOT NULL CHECK (period IN ('hour','day','month')),
  period_start timestamptz NOT NULL,
  count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, resource, period, period_start)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_room_usage_counters_room_id ON public.room_usage_counters(room_id);
CREATE INDEX IF NOT EXISTS idx_room_usage_counters_resource ON public.room_usage_counters(resource);
CREATE INDEX IF NOT EXISTS idx_room_usage_counters_period ON public.room_usage_counters(period);
CREATE INDEX IF NOT EXISTS idx_room_usage_counters_period_start ON public.room_usage_counters(period_start);

-- Enable RLS
ALTER TABLE public.room_usage_counters ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see counters for rooms they have access to
CREATE POLICY "Users can view room usage counters for their rooms" ON public.room_usage_counters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_participants rp 
      WHERE rp.room_id = room_usage_counters.room_id 
      AND rp.user_id = auth.uid()
    )
  );

-- RLS Policy: System can insert/update all counters (for server-side operations)
CREATE POLICY "Service role can manage all room usage counters" ON public.room_usage_counters
  FOR ALL USING (
    auth.role() = 'service_role'
  );

-- Function to increment room usage counter
CREATE OR REPLACE FUNCTION public.increment_room_usage_counter(
  p_room_id uuid,
  p_resource text,
  p_period text,
  p_increment integer DEFAULT 1
) RETURNS void AS $$
DECLARE
  current_period_start timestamptz;
BEGIN
  -- Calculate period start based on period type
  CASE p_period
    WHEN 'hour' THEN
      current_period_start := date_trunc('hour', now());
    WHEN 'day' THEN
      current_period_start := date_trunc('day', now());
    WHEN 'month' THEN
      current_period_start := date_trunc('month', now());
    ELSE
      RAISE EXCEPTION 'Invalid period: %', p_period;
  END CASE;

  -- Insert or update counter
  INSERT INTO public.room_usage_counters (room_id, resource, period, period_start, count, updated_at)
  VALUES (p_room_id, p_resource, p_period, current_period_start, p_increment, now())
  ON CONFLICT (room_id, resource, period, period_start)
  DO UPDATE SET 
    count = room_usage_counters.count + p_increment,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get room usage counter
CREATE OR REPLACE FUNCTION public.get_room_usage_counter(
  p_room_id uuid,
  p_resource text,
  p_period text
) RETURNS integer AS $$
DECLARE
  current_period_start timestamptz;
  counter_value integer := 0;
BEGIN
  -- Calculate period start based on period type
  CASE p_period
    WHEN 'hour' THEN
      current_period_start := date_trunc('hour', now());
    WHEN 'day' THEN
      current_period_start := date_trunc('day', now());
    WHEN 'month' THEN
      current_period_start := date_trunc('month', now());
    ELSE
      RAISE EXCEPTION 'Invalid period: %', p_period;
  END CASE;

  -- Get current counter value
  SELECT COALESCE(count, 0) INTO counter_value
  FROM public.room_usage_counters
  WHERE room_id = p_room_id
    AND resource = p_resource
    AND period = p_period
    AND period_start = current_period_start;

  RETURN counter_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check room usage limit
CREATE OR REPLACE FUNCTION public.check_room_usage_limit(
  p_room_id uuid,
  p_resource text,
  p_period text,
  p_limit integer
) RETURNS boolean AS $$
DECLARE
  current_usage integer;
BEGIN
  -- Get current usage
  current_usage := public.get_room_usage_counter(p_room_id, p_resource, p_period);
  
  -- Return true if usage is below limit
  RETURN current_usage < p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old usage counters (older than 3 months)
CREATE OR REPLACE FUNCTION public.cleanup_old_room_usage_counters() RETURNS void AS $$
BEGIN
  DELETE FROM public.room_usage_counters
  WHERE period_start < (now() - interval '3 months');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to authenticated users and service role
GRANT SELECT ON public.room_usage_counters TO authenticated;
GRANT ALL ON public.room_usage_counters TO service_role;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.increment_room_usage_counter TO service_role;
GRANT EXECUTE ON FUNCTION public.get_room_usage_counter TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_room_usage_limit TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_room_usage_counters TO service_role;

-- Comments for documentation
COMMENT ON TABLE public.room_usage_counters IS 'Tracks usage counters for rooms by resource type and time period';
COMMENT ON FUNCTION public.increment_room_usage_counter IS 'Increments a room usage counter for a specific resource and period';
COMMENT ON FUNCTION public.get_room_usage_counter IS 'Gets the current usage count for a room resource in a specific period';
COMMENT ON FUNCTION public.check_room_usage_limit IS 'Checks if room usage is below the specified limit';
COMMENT ON FUNCTION public.cleanup_old_room_usage_counters IS 'Removes usage counters older than 3 months';