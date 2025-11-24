# Voice Room Deployment Guide

## ✅ Files Prepared for Deployment

Your app is now ready to deploy! Here's what I've set up:

### Created Files:
- ✅ `.gitignore` - Excludes node_modules and other unnecessary files
- ✅ Updated `package.json` - Added Node.js version requirement

---

## 🚀 Next Steps: Deploy to Render

### Step 1: Create GitHub Repository

1. **Go to GitHub**: [https://github.com/new](https://github.com/new)
2. **Create repository**:
   - Name: `voice-room`
   - Description: "Real-time voice chat rooms with WebRTC"
   - Public or Private: Your choice
   - **Don't** initialize with README
3. **Click "Create repository"**

### Step 2: Push Your Code to GitHub

Run these commands in your terminal (in the voice room folder):

```bash
git init
git add .
git commit -m "Initial commit - Voice Room App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/voice-room.git
git push -u origin main
```

**Replace `YOUR_USERNAME` with your actual GitHub username!**

### Step 3: Deploy to Render

1. **Go to Render**: [https://render.com/](https://render.com/)
2. **Sign up** (use your GitHub account - it's easier!)
3. **Click "New +" → "Web Service"**
4. **Connect your repository**:
   - Click "Connect account" if needed
   - Select `voice-room` repository
5. **Configure the service**:
   - **Name**: `voice-room` (or any name you like)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
6. **Click "Create Web Service"**

### Step 4: Wait for Deployment

- Takes 2-5 minutes
- Watch the logs to see progress
- When done, you'll get a URL like: `https://voice-room-xyz.onrender.com`

---

## 🎉 After Deployment

### Your Public URL
Share this with anyone: `https://voice-room-xyz.onrender.com`

### Features:
✅ Works from anywhere in the world
✅ HTTPS enabled (microphone works on mobile)
✅ Auto-restarts if it crashes
✅ Free SSL certificate

### Free Tier Limitations:
⚠️ Sleeps after 15 minutes of inactivity
⚠️ Takes ~30 seconds to wake up
⚠️ 750 hours/month free

---

## 🆘 Need Help?

If you get stuck at any step, let me know which step and what error you're seeing!
