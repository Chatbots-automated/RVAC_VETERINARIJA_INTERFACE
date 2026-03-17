# Netlify Deployment Guide

This guide will help you deploy the RVAC Veterinarija application to Netlify.

## Prerequisites

- A Netlify account (sign up at https://netlify.com)
- Git repository with your code pushed to GitHub, GitLab, or Bitbucket

## Deployment Steps

### 1. Connect Your Repository

1. Log in to your Netlify account
2. Click "Add new site" → "Import an existing project"
3. Choose your Git provider (GitHub, GitLab, or Bitbucket)
4. Select your repository

### 2. Configure Build Settings

Netlify will automatically detect the settings from `netlify.toml`, but verify:

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: 18

### 3. Set Environment Variables

**IMPORTANT**: Never commit sensitive keys to your repository!

In the Netlify dashboard, go to:
**Site settings** → **Environment variables** → **Add a variable**

Add the following environment variables:

```
VITE_SUPABASE_URL=https://oxzfztimfabzzqjmsihl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94emZ6dGltZmFienpxam1zaWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzc0MTIsImV4cCI6MjA4ODgxMzQxMn0._fJnKP48APEekQ80E_QcUhYapZM9C3vsEaoqVax9OC8
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94emZ6dGltZmFienpxam1zaWhsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzNzQxMiwiZXhwIjoyMDg4ODEzNDEyfQ.DCTDHl-aPpEajGndU69nvp-ZHeYv5sIVR1gU_XW_Edk
```

### 4. Deploy

1. Click "Deploy site"
2. Netlify will build and deploy your application
3. Once complete, you'll receive a URL like `https://your-site-name.netlify.app`

## Configuration Files Created

### `netlify.toml`
Main configuration file that defines:
- Build command and publish directory
- Node version
- Redirect rules for SPA routing
- Security headers
- Cache headers for static assets

### `.nvmrc`
Specifies Node.js version (18) for consistent builds

### `_redirects`
Fallback file for SPA routing (backup to netlify.toml redirects)

## Features Configured

✅ **SPA Routing**: All routes redirect to index.html for client-side routing
✅ **Security Headers**: XSS protection, frame options, content type sniffing prevention
✅ **Caching**: Optimized cache headers for static assets (1 year) and no-cache for HTML
✅ **Build Optimization**: Uses Node 18 and npm 9

## Custom Domain (Optional)

To use a custom domain:

1. Go to **Site settings** → **Domain management**
2. Click "Add custom domain"
3. Follow the instructions to configure DNS

## Continuous Deployment

Netlify automatically deploys when you push to your main branch. To configure:

1. Go to **Site settings** → **Build & deploy** → **Continuous deployment**
2. Configure branch deploys, deploy contexts, and build hooks as needed

## Troubleshooting

### Build Fails
- Check build logs in Netlify dashboard
- Verify all environment variables are set correctly
- Ensure Node version matches (18)

### 404 on Refresh
- Verify `netlify.toml` redirects are configured
- Check that publish directory is set to `dist`

### Environment Variables Not Working
- Ensure variables start with `VITE_` prefix
- Redeploy after adding/changing environment variables
- Clear cache and retry deploy

## Production Checklist

Before going live:

- [ ] All environment variables are set in Netlify (not in code)
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate is active (automatic with Netlify)
- [ ] Test all routes and functionality
- [ ] Monitor build logs for warnings
- [ ] Set up deploy notifications (optional)

## Support

For issues with:
- **Netlify deployment**: https://docs.netlify.com
- **Supabase configuration**: https://supabase.com/docs
- **Application bugs**: Contact your development team

---

**Note**: The `.env.local` file should remain in your local development environment only and should NOT be committed to version control. The `.gitignore` file should include `.env.local` to prevent accidental commits.
