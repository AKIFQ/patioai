# 🔐 Google OAuth Setup Guide

## Overview

This guide shows you how to set up separate Google OAuth applications for development and production environments.

## 🏗️ Why Separate OAuth Apps?

- **Security**: Prevents production users from being redirected to localhost
- **Development**: Allows localhost development without affecting production
- **Environment Isolation**: Clean separation between dev and prod

## 📱 Step 1: Development OAuth App

### Create Development App

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Select your project** (or create new one)
3. **Navigate to:** APIs & Services → Credentials
4. **Click:** + CREATE CREDENTIALS → OAuth 2.0 Client IDs
5. **Application type:** Web application
6. **Name:** `PatioAI Development`

### Configure Development App

**Authorized JavaScript origins:**
```
http://localhost:3000
http://127.0.0.1:3000
```

**Authorized redirect URIs:**
```
http://localhost:3000/api/auth/callback
http://localhost:3000/api/auth/confirm
```

### Save Development Credentials

Copy the credentials to your `.env.local`:

```bash
# Development Google OAuth
GOOGLE_CLIENT_ID=your_dev_client_id_here
GOOGLE_SECRET_ID=your_dev_secret_here
```

## 🌐 Step 2: Production OAuth App

### Create Production App

1. **In the same Google Cloud Console project**
2. **Click:** + CREATE CREDENTIALS → OAuth 2.0 Client IDs
3. **Application type:** Web application  
4. **Name:** `PatioAI Production`

### Configure Production App

**Authorized JavaScript origins:**
```
https://www.patioai.chat
```

**Authorized redirect URIs:**
```
https://www.patioai.chat/api/auth/callback
https://www.patioai.chat/api/auth/confirm
```

### Save Production Credentials

Add these to Railway environment variables:

```bash
# Production Google OAuth
GOOGLE_CLIENT_ID=your_prod_client_id_here
GOOGLE_SECRET_ID=your_prod_secret_here
```

## ⚙️ Step 3: Environment Configuration

### Update Railway Environment Variables

In Railway dashboard, set:

```bash
NODE_ENV=production
APP_URL=https://www.patioai.chat
NEXT_PUBLIC_APP_URL=https://www.patioai.chat
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_SECRET_ID=your_production_secret
```

### Create .env.local for Development

Create `.env.local` in your project root:

```bash
NODE_ENV=development
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_development_client_id
GOOGLE_SECRET_ID=your_development_secret
```

## 🧪 Step 4: Testing

### Test Development

1. **Start development server:**
   ```bash
   npm run dev
   ```

2. **Visit:** `http://localhost:3000/signin`

3. **Click Google Sign In** - Should redirect to Google with localhost return URL

4. **After auth** - Should return to `http://localhost:3000`

### Test Production

1. **Deploy to Railway** with production environment variables

2. **Visit:** `https://www.patioai.chat/signin`

3. **Click Google Sign In** - Should redirect to Google with production return URL

4. **After auth** - Should return to `https://www.patioai.chat`

## 🔒 Security Checklist

- [ ] Development OAuth app only allows localhost origins
- [ ] Production OAuth app only allows production domain
- [ ] No cross-environment credentials
- [ ] `.env.local` is in `.gitignore`
- [ ] Production credentials are only in Railway dashboard

## 🚨 Troubleshooting

### Error: redirect_uri_mismatch

**Solution:** Check that your OAuth app's authorized redirect URIs exactly match the URLs being used.

### Development redirects to production

**Solution:** Verify `.env.local` has correct development credentials and localhost URLs.

### Production redirects to localhost

**Solution:** Check Railway environment variables have production credentials and production URLs.

## 📞 Advanced Configuration

### Custom Domains

If using a custom domain, update production OAuth app:

```
https://your-custom-domain.com
https://your-custom-domain.com/api/auth/callback
https://your-custom-domain.com/api/auth/confirm
```

### Multiple Environments

For staging environments, create additional OAuth apps:

- `PatioAI Development` (localhost)
- `PatioAI Staging` (staging.patioai.chat)
- `PatioAI Production` (www.patioai.chat)

## 🎯 Quick Setup Commands

Copy your current .env to .env.local for development:

```bash
# Create development environment file
cp .env .env.local

# Edit .env.local to have localhost URLs
# Then update Railway with production URLs
```

This setup ensures your development work never interferes with production users! 🚀
