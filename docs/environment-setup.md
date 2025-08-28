# 🏗️ Professional Environment Setup Guide

## Overview

This guide shows you how to properly separate development and production environments for PatioAI, ensuring localhost development doesn't interfere with production users.

## 📁 File Structure

```
.env.local          # Development (localhost) - NOT committed
.env.production     # Production template - NOT committed
package.json        # Scripts for different environments
```

## 🔧 Environment Configuration

### 1. Development Environment (.env.local)

Create `.env.local` in your project root for development:

```bash
# Local Development Environment
NODE_ENV=development

# Supabase Configuration (can be same instance)
NEXT_PUBLIC_SUPABASE_URL=https://wgpfyizeiqmtfnrjskzf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Development URLs (localhost)
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
NEXT_PUBLIC_CLIENT_URL=http://localhost:3000

# Development Google OAuth (separate OAuth app for localhost)
GOOGLE_CLIENT_ID=your_dev_google_client_id
GOOGLE_SECRET_ID=your_dev_google_secret

# Stripe Test Keys
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 2. Production Environment (Railway Variables)

Set these in Railway dashboard:

```bash
NODE_ENV=production

# Production URLs
APP_URL=https://www.patioai.chat
NEXT_PUBLIC_APP_URL=https://www.patioai.chat
NEXT_PUBLIC_SOCKET_URL=https://www.patioai.chat
NEXT_PUBLIC_CLIENT_URL=https://www.patioai.chat

# Production Google OAuth (separate OAuth app for production domain)
GOOGLE_CLIENT_ID=your_prod_google_client_id
GOOGLE_SECRET_ID=your_prod_google_secret

# Stripe Live Keys
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

## 🔐 Google OAuth Setup

### Development OAuth App

1. **Go to Google Cloud Console**
2. **Create NEW OAuth App** called "PatioAI Development"
3. **Authorized origins:**
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
4. **Authorized redirect URIs:**
   - `http://localhost:3000/api/auth/callback`
   - `http://localhost:3000/api/auth/confirm`

### Production OAuth App

1. **Create SEPARATE OAuth App** called "PatioAI Production"
2. **Authorized origins:**
   - `https://www.patioai.chat`
3. **Authorized redirect URIs:**
   - `https://www.patioai.chat/api/auth/callback`
   - `https://www.patioai.chat/api/auth/confirm`

## 🗄️ Supabase Configuration

### Option 1: Single Supabase Project (Recommended)

Use the same Supabase project for both environments:

- **Site URL in Supabase:** `https://www.patioai.chat` (production)
- **Additional redirect URLs:** Add `http://localhost:3000/api/auth/confirm`

### Option 2: Separate Supabase Projects

Create separate projects:

- **Development:** `patioai-dev`
- **Production:** `patioai-prod`

## 🚀 Deployment Strategy

### Development

```bash
# Always uses .env.local
npm run dev
```

### Production (Railway)

Environment variables are set in Railway dashboard, not in files.

## 🔒 Security Best Practices

### 1. Environment File Security

```bash
# .gitignore (already configured)
*.env
*.env.*
.env.local
.env.production
```

### 2. Separate API Keys

- **Development:** Use test/sandbox keys
- **Production:** Use live/production keys

### 3. Domain Validation

Add environment checks in your auth configuration:

```typescript
// lib/config/auth.ts
const isDevelopment = process.env.NODE_ENV === 'development';
const baseUrl = isDevelopment 
  ? 'http://localhost:3000'
  : 'https://www.patioai.chat';
```

## 🧪 Testing

### Local Development Test

1. Set up `.env.local` with localhost URLs
2. Configure dev Google OAuth
3. Test auth flow on `http://localhost:3000`

### Production Test

1. Deploy to Railway with production environment variables
2. Test auth flow on `https://www.patioai.chat`
3. Verify no localhost redirects occur

## 📋 Checklist

- [ ] Create separate Google OAuth apps for dev/prod
- [ ] Set up `.env.local` for development
- [ ] Configure Railway environment variables for production
- [ ] Test both environments separately
- [ ] Verify no cross-environment redirects
- [ ] Test email flows in both environments

## 🚨 Common Issues

### Issue: Production users redirected to localhost

**Solution:** Check Railway environment variables are set correctly.

### Issue: Development auth not working

**Solution:** Verify `.env.local` has localhost URLs and correct Google OAuth credentials.

### Issue: CORS errors

**Solution:** Ensure Google OAuth origins match your environment URLs exactly.

## 📞 Support

If you encounter issues:

1. Check Railway deployment logs
2. Verify environment variables in Railway dashboard
3. Test Google OAuth configuration in Google Cloud Console
4. Confirm Supabase auth settings
