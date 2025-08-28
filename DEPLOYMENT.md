# Vercel Deployment Guide

## 🚨 CRITICAL FIRST STEP - SECURITY

**Your API keys were exposed publicly. You MUST rotate ALL keys immediately:**

1. **Supabase**: Dashboard → Settings → API → Regenerate keys
2. **OpenRouter**: Account → API Keys → Create new key
3. **OpenAI**: Platform → API Keys → Create new key  
4. **Anthropic**: Console → API Keys → Create new key
5. **Google**: Cloud Console → Credentials → Create new key
6. **Stripe**: Dashboard → Developers → API Keys → Create new keys
7. **All other services**: Regenerate keys immediately

## 📋 Pre-Deployment Checklist

- [ ] All API keys rotated and secured
- [ ] `.env.production.example` reviewed
- [ ] Vercel project connected to GitHub
- [ ] Environment variables configured in Vercel dashboard

## 🚀 Vercel Setup

### 1. Environment Variables

In your Vercel dashboard, add these environment variables:

**App URLs** (Replace `your-app-name` with your actual Vercel app name):
```
NEXT_PUBLIC_APP_URL=https://your-app-name.vercel.app
APP_URL=https://your-app-name.vercel.app
NEXT_PUBLIC_SOCKET_URL=https://your-app-name.vercel.app
NEXT_PUBLIC_CLIENT_URL=https://your-app-name.vercel.app
```

**All other variables** from `.env.production.example` with your NEW rotated keys.

### 2. Build Configuration

The following files have been updated for Vercel:

- ✅ `vercel.json` - Vercel configuration
- ✅ `package.json` - Added `vercel-build` script
- ✅ `lib/config/endpoints.ts` - Already supports production URLs

### 3. Deploy

1. **Connect Repository**: Link your GitHub repo in Vercel dashboard
2. **Set Environment Variables**: Copy from `.env.production.example` 
3. **Deploy**: Push to main branch or click deploy in Vercel

## ⚠️ Known Limitations

### Socket.IO on Vercel

Socket.IO has limitations on Vercel's serverless functions:
- WebSocket connections may not persist
- Real-time features might be degraded
- Consider alternatives:
  - Deploy Socket.IO server separately (Railway, Render)
  - Use Server-Sent Events for real-time updates
  - Use Vercel's WebSocket support (beta)

### Memory Management

Vercel functions have memory limits:
- Default: 1024MB
- Max: 3008MB (Pro plan)
- Your memory protection system should work within these limits

## 🔧 Post-Deployment

1. **Test Core Features**:
   - User authentication
   - AI chat functionality
   - Stripe payments
   - File uploads

2. **Monitor Performance**:
   - Check Vercel function logs
   - Monitor API response times
   - Watch for memory usage warnings

3. **Update OAuth Redirects**:
   - Google: Add your Vercel domain to authorized origins
   - GitHub: Update OAuth app callback URLs
   - Stripe: Update webhook endpoints

## 🚨 Security Checklist

- [ ] All API keys rotated
- [ ] Environment variables secured in Vercel dashboard
- [ ] OAuth redirect URLs updated
- [ ] Stripe webhook endpoints updated
- [ ] Database access limited to your domain
- [ ] CORS configured for production domain

## 🐛 Common Issues

**Build Failures**: 
- Check TypeScript compilation
- Verify all dependencies are in `package.json`

**Runtime Errors**:
- Check environment variables are set
- Monitor Vercel function logs

**Database Connection Issues**:
- Verify Supabase keys are correct
- Check RLS policies allow your domain

**Socket.IO Not Working**:
- This is expected - see Socket.IO limitations above
- Test without real-time features first

## 📚 Resources

- [Vercel Deployment Docs](https://vercel.com/docs)
- [Next.js on Vercel](https://vercel.com/docs/concepts/next.js)
- [Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)