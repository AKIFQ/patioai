-- Tier-based limits and usage logs

-- Counters for tier-based limits
CREATE TABLE IF NOT EXISTS public.user_usage_counters (
  user_id uuid NOT NULL,
  resource text NOT NULL,
  period text NOT NULL CHECK (period IN ('hour','day','month')),
  period_start timestamptz NOT NULL,
  count integer DEFAULT 0,
  PRIMARY KEY (user_id, resource, period, period_start)
);

CREATE OR REPLACE FUNCTION public.upsert_usage_counter(
  p_user_id uuid,
  p_resource text,
  p_period text,
  p_period_start timestamptz,
  p_amount integer
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_usage_counters(user_id, resource, period, period_start, count)
  VALUES (p_user_id, p_resource, p_period, p_period_start, p_amount)
  ON CONFLICT (user_id, resource, period, period_start)
  DO UPDATE SET count = public.user_usage_counters.count + p_amount;
END;
$$;

-- Usage logs for analytics
CREATE TABLE IF NOT EXISTS public.user_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  tokens_used INTEGER NOT NULL,
  cost DECIMAL(10,6) NOT NULL,
  request_type TEXT DEFAULT 'chat', -- 'chat', 'room', 'api'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for logs
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.user_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.user_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON public.user_usage_logs(model_used);

-- Enable RLS (service role bypasses)
ALTER TABLE public.user_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage_logs ENABLE ROW LEVEL SECURITY;

-- Subscription plans catalog (idempotent upsert)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_limit INTEGER NOT NULL,
  cost_limit DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO public.subscription_plans (id, name, description, monthly_limit, cost_limit, price, features) 
VALUES 
  ('free', 'Free', 'Gemini Flash + DeepSeek R1 (explicit reasoning) with generous limits', 400, 0.00, 0.00, '["Auto model selection", "Gemini 2.0 Flash", "DeepSeek R1 (opt-in reasoning)", "2,000 reasoning msgs/mo"]'::jsonb),
  ('basic', 'Basic', 'Same models as free with higher limits and features', 1500, 15.00, 10.00, '["Model selection", "Higher limits", "Priority support"]'::jsonb),
  ('premium', 'Premium', 'Claude/GPT-4o/O1 + enterprise features', 4000, 40.00, 50.00, '["Top-tier models", "Enterprise collaboration", "Advanced reasoning"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_limit = EXCLUDED.monthly_limit,
  cost_limit = EXCLUDED.cost_limit,
  price = EXCLUDED.price,
  features = EXCLUDED.features;

