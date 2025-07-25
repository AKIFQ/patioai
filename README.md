## 📜 License

🔖 Licensed under the MIT License. See LICENSE.md for details.

## 🔧 Environment Setup

Create a `.env.local` file in your project root with the following variables:

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

**Important:** Never commit your `.env.local` file to version control. It contains sensitive API keys and credentials. 