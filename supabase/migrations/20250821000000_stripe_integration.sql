-- Add Stripe integration fields to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'basic', 'premium')),
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'past_due', 'unpaid')),
ADD COLUMN IF NOT EXISTS subscription_period_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON public.users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);

-- Create payment events log table
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('succeeded', 'failed', 'refunded')),
  amount INTEGER NOT NULL, -- Amount in cents
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for payment events
CREATE INDEX IF NOT EXISTS idx_payment_events_user_id ON public.payment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_customer_id ON public.payment_events(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON public.payment_events(created_at);

-- Enable RLS for payment events
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for payment events (users can only see their own)
CREATE POLICY "Users can view own payment events" ON public.payment_events
  FOR SELECT USING (auth.uid() = user_id);

-- Function to update user tier and subscription info
CREATE OR REPLACE FUNCTION public.update_user_subscription(
  p_user_id UUID,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_tier TEXT DEFAULT 'free',
  p_status TEXT DEFAULT 'active',
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users 
  SET 
    stripe_customer_id = p_stripe_customer_id,
    stripe_subscription_id = p_stripe_subscription_id,
    subscription_tier = p_tier,
    subscription_status = p_status,
    subscription_period_start = p_period_start,
    subscription_period_end = p_period_end,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Also update user_tiers table if it exists
  INSERT INTO public.user_tiers (user_id, tier, updated_at)
  VALUES (p_user_id, p_tier, NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    tier = EXCLUDED.tier,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Function to get user subscription details
CREATE OR REPLACE FUNCTION public.get_user_subscription(p_user_id UUID)
RETURNS TABLE(
  user_id UUID,
  subscription_tier TEXT,
  subscription_status TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  days_until_renewal INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.subscription_tier,
    u.subscription_status,
    u.stripe_customer_id,
    u.stripe_subscription_id,
    u.subscription_period_start,
    u.subscription_period_end,
    CASE 
      WHEN u.subscription_period_end IS NOT NULL 
      THEN EXTRACT(DAY FROM (u.subscription_period_end - NOW()))::INTEGER
      ELSE NULL
    END as days_until_renewal
  FROM public.users u
  WHERE u.id = p_user_id;
END;
$$;

-- Function to log payment events
CREATE OR REPLACE FUNCTION public.log_payment_event(
  p_user_id UUID,
  p_customer_id TEXT,
  p_event_type TEXT,
  p_amount INTEGER,
  p_invoice_id TEXT DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO public.payment_events (
    user_id,
    stripe_customer_id,
    event_type,
    amount,
    stripe_invoice_id,
    stripe_payment_intent_id,
    metadata
  ) VALUES (
    p_user_id,
    p_customer_id,
    p_event_type,
    p_amount,
    p_invoice_id,
    p_payment_intent_id,
    p_metadata
  ) RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

-- Update the getUserInfo function to include subscription tier
CREATE OR REPLACE FUNCTION public.get_user_with_subscription(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  email TEXT,
  subscription_tier TEXT,
  subscription_status TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.full_name,
    u.email,
    COALESCE(u.subscription_tier, 'free') as subscription_tier,
    COALESCE(u.subscription_status, 'active') as subscription_status,
    u.stripe_customer_id,
    u.created_at
  FROM public.users u
  WHERE u.id = p_user_id;
END;
$$;