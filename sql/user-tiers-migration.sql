-- Add subscription tier and usage tracking to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'basic', 'premium')),
ADD COLUMN IF NOT EXISTS monthly_usage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_cost DECIMAL(10,6) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS usage_reset_date TIMESTAMP DEFAULT (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');

-- Create index for efficient tier queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_usage_reset ON users(usage_reset_date);

-- Create usage tracking table for detailed analytics
CREATE TABLE IF NOT EXISTS user_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  tokens_used INTEGER NOT NULL,
  cost DECIMAL(10,6) NOT NULL,
  request_type TEXT DEFAULT 'chat', -- 'chat', 'room', 'api'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for usage logs
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON user_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON user_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON user_usage_logs(model_used);

-- Function to reset monthly usage (run monthly via cron)
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE users 
  SET 
    monthly_usage = 0,
    monthly_cost = 0.0,
    usage_reset_date = date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
  WHERE usage_reset_date <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Create subscription plans table for reference
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_limit INTEGER NOT NULL,
  cost_limit DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default plans
INSERT INTO subscription_plans (id, name, description, monthly_limit, cost_limit, price, features) 
VALUES 
  ('free', 'Free', 'Smart auto-routing to best free models', 50, 0.00, 0.00, '["Auto model selection", "50 requests/month", "Community support"]'::jsonb),
  ('basic', 'Pro Basic', 'Choose from fast, efficient models', 200, 15.00, 20.00, '["Model selection", "200 requests/month", "Email support", "DeepSeek Reasoning"]'::jsonb),
  ('premium', 'Pro Premium', 'Access to flagship models', 500, 40.00, 50.00, '["All models", "500 requests/month", "Priority support", "GPT-4o", "Claude Sonnet", "Advanced reasoning"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_limit = EXCLUDED.monthly_limit,
  cost_limit = EXCLUDED.cost_limit,
  price = EXCLUDED.price,
  features = EXCLUDED.features;

-- Create function to check user limits
CREATE OR REPLACE FUNCTION check_user_limits(user_id_param UUID)
RETURNS TABLE(
  can_make_request BOOLEAN,
  reason TEXT,
  usage_count INTEGER,
  usage_limit INTEGER,
  cost_spent DECIMAL,
  cost_limit DECIMAL
) AS $$
DECLARE
  user_record RECORD;
  plan_record RECORD;
BEGIN
  -- Get user data
  SELECT u.subscription_tier, u.monthly_usage, u.monthly_cost
  INTO user_record
  FROM users u
  WHERE u.id = user_id_param;
  
  -- Get plan limits
  SELECT sp.monthly_limit, sp.cost_limit
  INTO plan_record
  FROM subscription_plans sp
  WHERE sp.id = user_record.subscription_tier;
  
  -- Check limits
  IF user_record.monthly_usage >= plan_record.monthly_limit THEN
    RETURN QUERY SELECT 
      FALSE,
      'Monthly request limit reached. Upgrade to continue.',
      user_record.monthly_usage,
      plan_record.monthly_limit,
      user_record.monthly_cost,
      plan_record.cost_limit;
  ELSIF user_record.subscription_tier != 'free' AND user_record.monthly_cost >= plan_record.cost_limit THEN
    RETURN QUERY SELECT 
      FALSE,
      'Monthly cost limit reached. Usage will reset next month.',
      user_record.monthly_usage,
      plan_record.monthly_limit,
      user_record.monthly_cost,
      plan_record.cost_limit;
  ELSE
    RETURN QUERY SELECT 
      TRUE,
      NULL::TEXT,
      user_record.monthly_usage,
      plan_record.monthly_limit,
      user_record.monthly_cost,
      plan_record.cost_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;