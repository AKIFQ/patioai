# PatioAI Tier System & Rate Limiting Explained

## 🎯 Overview

PatioAI implements a sophisticated 4-tier subscription system designed to provide value at every level while protecting system resources and encouraging upgrades. The system combines AI model access, usage limits, and premium features in a carefully balanced approach.

## 🏗️ Tier Structure

### 1. **Anonymous Tier** (No Account Required)
**Target**: First-time visitors, trial users
**Cost**: FREE
**Philosophy**: Minimal access to encourage registration

#### Model Access
- ✅ **Gemini 2.0 Flash**: Basic chat functionality
- ❌ **DeepSeek R1**: No reasoning access
- ❌ **Premium Models**: No access

#### Rate Limits
```
AI Requests:     5/hour,  15/day
Reasoning:       0/hour,  0/day (disabled)
Room Creation:   Disabled (registration prompt)
File Uploads:    1/hour,  2/day (2MB max)
Context Window:  32K tokens (~8-12 messages)
Concurrent Rooms: 0
Storage:         None (temporary only)
```

#### Key Restrictions
- No account persistence
- No conversation history
- Limited context memory
- IP-based tracking for abuse prevention

---

### 2. **Free Tier** (Registered Users)
**Target**: Regular users, students, casual users
**Cost**: FREE
**Philosophy**: Generous limits to build engagement

#### Model Access
- ✅ **Gemini 2.0 Flash**: Primary chat model (229 tokens/sec)
- ✅ **DeepSeek R1 (Free)**: Reasoning through reasoning button
- ❌ **Premium Models**: Upgrade prompts shown

#### Rate Limits
```
AI Requests:     8/hour,   25/day,   400/month
Reasoning:       3/hour,   10/day,   50/month
Room Creation:   2/hour,   5/day,    50/month
File Uploads:    3/hour,   8/day,    100/month (5MB max)
Context Window:  128K tokens (~25-40 messages)
Concurrent Rooms: 3
Storage:         50MB total
```

#### Features
- ✅ Conversation history
- ✅ Document uploads (basic)
- ✅ Room collaboration
- ✅ Basic reasoning access
- ❌ Model selection
- ❌ Priority support

---

### 3. **Basic Tier** ($10/month)
**Target**: Power users, small teams, professionals
**Cost**: $10/month
**Philosophy**: Substantial limits for regular professional use

#### Model Access
- ✅ **Gemini 2.0 Flash**: Primary model
- ✅ **DeepSeek R1 (Free)**: Enhanced reasoning access
- ❌ **Premium Models**: Upgrade prompts for advanced models

#### Rate Limits
```
AI Requests:     25/hour,  80/day,   1,500/month
Reasoning:       8/hour,   25/day,   200/month
Room Creation:   5/hour,   15/day,   200/month
File Uploads:    8/hour,   25/day,   400/month (15MB max)
Context Window:  512K tokens (~100-150 messages)
Concurrent Rooms: 5
Storage:         500MB total
```

#### Features
- ✅ All Free features
- ✅ Higher usage limits
- ✅ Larger file uploads
- ✅ Extended context memory
- ✅ Priority queue processing
- ❌ Premium model access
- ❌ Advanced analytics

---

### 4. **Premium Tier** ($50/month)
**Target**: Teams, enterprises, power users
**Cost**: $50/month
**Philosophy**: Unlimited-feeling experience with premium models

#### Model Access
- ✅ **Gemini 2.0 Flash**: Fast baseline model
- ✅ **GPT-4o Mini**: Balanced performance ($0.75/1M tokens avg)
- ✅ **Claude 3.5 Sonnet**: Advanced reasoning ($18/1M tokens avg)
- ✅ **GPT-4o**: Multimodal capabilities ($12.50/1M tokens avg)
- ✅ **O1-Preview**: Premium reasoning ($75/1M tokens avg)
- ✅ **DeepSeek R1 (Free)**: Unlimited reasoning access
- ✅ **Model Selection**: Choose preferred model per conversation

#### Rate Limits
```
AI Requests:     60/hour,  200/day,  4,000/month
Reasoning:       20/hour,  60/day,   800/month
Room Creation:   15/hour,  50/day,   1,000/month
File Uploads:    20/hour,  80/day,   1,500/month (50MB max)
Context Window:  2M tokens (~400-600 messages)
Concurrent Rooms: 15
Storage:         5GB total
```

#### Features
- ✅ All Basic features
- ✅ Premium model access
- ✅ Model selection per conversation
- ✅ Massive context windows
- ✅ Priority support
- ✅ Advanced analytics
- ✅ Team collaboration features
- ✅ API access (future)

---

## 🛡️ Multi-Layer Protection System

### Layer 1: User Authentication Tracking
- **Purpose**: Prevent cross-room abuse via User ID tracking
- **Implementation**: Database-backed usage counters
- **Scope**: All authenticated users

### Layer 2: IP-Based Protection (Anonymous Users)
- **Purpose**: Prevent anonymous abuse and bot attacks
- **Implementation**: Redis-based with browser fingerprinting
- **Features**: 
  - IP address tracking
  - Browser fingerprint analysis
  - Temporary IP blocks for violations

### Layer 3: Room-Level Limits
- **Purpose**: Prevent room-specific abuse patterns
- **Implementation**: Per-room usage tracking
- **Features**:
  - Concurrent room limits
  - Room creation rate limits
  - Context window management per room

### Layer 4: Emergency Circuit Breakers
- **Purpose**: Protect global system resources
- **Implementation**: Redis-based circuit breaker pattern
- **Triggers**:
  - High error rates from AI providers
  - Database connection issues
  - Memory/CPU threshold breaches
  - Unusual traffic patterns

---

## 🧠 Smart Model Routing Logic

### Free/Basic Tier Routing
```typescript
const FREE_MODEL_ROUTING = {
  general: 'google/gemini-2.0-flash-001',     // Fast, cost-effective
  academic: 'google/gemini-2.0-flash-001',   // Good for explanations  
  coding: 'google/gemini-2.0-flash-001',     // Decent code assistance
  reasoning: 'deepseek/deepseek-r1:free',    // Complex problem-solving
  fallback: 'google/gemini-2.0-flash-001'   // Reliable backup
}
```

### Premium Tier Routing
```typescript
const PREMIUM_MODEL_ROUTING = {
  general: 'google/gemini-2.0-flash-001',    // Fast baseline
  creative: 'anthropic/claude-3.5-sonnet',   // Creative writing
  coding: 'openai/gpt-4o',                   // Advanced coding
  reasoning: 'openai/o1-preview',            // Complex reasoning
  multimodal: 'openai/gpt-4o',              // Image analysis
  balanced: 'openai/gpt-4o-mini',           // Cost-effective quality
  fallback: 'google/gemini-2.0-flash-001'   // Always available
}
```

---

## 📊 Usage Tracking & Analytics

### Tracking Dimensions
- **Time Periods**: Hourly, Daily, Monthly
- **Action Types**: AI requests, reasoning messages, room creation, file uploads
- **Resource Usage**: Storage, context tokens, concurrent connections
- **Quality Metrics**: Response times, error rates, user satisfaction

### Database Schema
```sql
-- Multi-period usage tracking
CREATE TABLE user_usage (
  user_id UUID,
  action_type TEXT,
  period_type TEXT CHECK (period_type IN ('hourly', 'daily', 'monthly')),
  period_start TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  UNIQUE(user_id, action_type, period_type, period_start)
);

-- Tier management
CREATE TABLE user_tiers (
  user_id UUID PRIMARY KEY,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'premium')),
  subscription_status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚨 Abuse Prevention & Penalties

### Progressive Penalty System
1. **First Violation**: Warning with usage stats
2. **Second Violation**: 1-hour cooldown
3. **Third Violation**: 6-hour cooldown  
4. **Repeated Violations**: 24-hour block
5. **Severe Abuse**: Account review/suspension

### Violation Types
- **Rate Limit Abuse**: Excessive API calls
- **Resource Abuse**: Large file spam, context manipulation
- **System Abuse**: Attempting to bypass restrictions
- **Payment Fraud**: Subscription manipulation

### Detection Methods
- **Statistical Analysis**: Usage pattern anomalies
- **Behavioral Analysis**: Rapid tier changes, unusual access patterns
- **Technical Analysis**: IP spoofing, token manipulation attempts
- **Community Reports**: User-reported abuse

---

## 💰 Conversion Strategy

### Upgrade Triggers
1. **Limit Reached**: Show specific benefits of next tier
2. **Model Request**: Highlight premium model capabilities
3. **Feature Access**: Demonstrate advanced features
4. **Usage Patterns**: Proactive suggestions based on behavior

### Upgrade Prompts
```typescript
interface UpgradePrompt {
  title: string
  description: string
  benefits: string[]
  ctaText: string
  ctaUrl: string
  urgency?: 'low' | 'medium' | 'high'
}

// Example: Free to Basic upgrade
{
  title: "Unlock More AI Power",
  description: "You've reached your daily limit. Upgrade to Basic for 3x more requests!",
  benefits: [
    "80 AI requests per day (vs 25)",
    "Extended context memory",
    "Larger file uploads (15MB)",
    "Priority processing"
  ],
  ctaText: "Upgrade to Basic - $10/month",
  ctaUrl: "/upgrade/basic"
}
```

---

## 🔧 Implementation Status

### ✅ Completed
- Model configuration system
- Basic tier structure
- OpenRouter integration
- Smart model routing

### 🚧 In Progress (Planned)
- Database schema implementation
- Rate limiting middleware
- Usage tracking system
- Upgrade prompt system

### 📋 Planned
- Payment integration (Stripe)
- Advanced analytics dashboard
- Team collaboration features
- API access for Premium users

---

## 📈 Expected Outcomes

### User Experience
- **Anonymous**: Quick trial → Registration conversion
- **Free**: Engagement building → Basic upgrade (15-20% conversion)
- **Basic**: Professional usage → Premium upgrade (25-30% conversion)
- **Premium**: High satisfaction → Long-term retention (90%+ retention)

### Business Metrics
- **Revenue**: $10 Basic + $50 Premium tiers
- **Conversion**: 15% Free→Basic, 25% Basic→Premium
- **Retention**: 85% Basic, 90% Premium monthly retention
- **Growth**: Sustainable scaling with cost control

### Technical Benefits
- **Resource Protection**: Multi-layer abuse prevention
- **Cost Control**: Smart model routing and limits
- **Scalability**: Redis + PostgreSQL architecture
- **Reliability**: Circuit breakers and fallback systems

This tier system balances user value, system protection, and business sustainability while providing clear upgrade paths and premium features that justify the pricing structure.