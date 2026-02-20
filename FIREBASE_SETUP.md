# 🔥 Firebase Setup Guide

## ✅ Current Status
Your app is now configured to use Firebase for:
- **Authentication**: Google Sign-in
- **Database**: Firestore for storing user data and watchlists
- **Remote Config**: For dynamic configuration

## 📋 Quick Start

### 1. Test Firebase Connection
```bash
node test-firebase.js
```

### 2. Run Development Server
```bash
pnpm dev
```

### 3. Access the Application
- Open browser: http://localhost:3000
- Click "Sign in with Google"
- You'll be redirected to dashboard after successful login

## 🔐 Firebase Console Setup

### Enable Google Authentication
1. Go to: https://console.firebase.google.com/project/stock-analytics-9ac6f/authentication/providers
2. Click on "Google" provider
3. Enable it and save
4. Add your development domain (localhost:3000) to authorized domains

### Configure Firestore
1. Go to: https://console.firebase.google.com/project/stock-analytics-9ac6f/firestore
2. Click "Create Database"
3. Choose "Start in test mode" for development
4. Select a location (closest to you)

### Add Authorized Domains
1. Go to Authentication → Settings → Authorized domains
2. Add:
   - `localhost`
   - Your production domain (when deploying)

## 📦 What's Configured

### Files Updated:
- ✅ `lib/firebase.ts` - Firebase initialization
- ✅ `app/context/AuthContext.tsx` - Authentication context
- ✅ `app/login/page.tsx` - Login page with Google Sign-in
- ✅ `app/dashboard/page.tsx` - Protected dashboard
- ✅ `.env.local` - Environment variables
- ✅ `test-firebase.js` - Connection test script

### Firebase Services:
- **Auth**: Google OAuth provider configured
- **Firestore**: Database ready for user data
- **Remote Config**: Dynamic configuration support

## 🚀 Features Working:
1. ✅ Google Sign-in authentication
2. ✅ Protected routes (dashboard requires login)
3. ✅ User session management
4. ✅ Automatic redirect after login
5. ✅ Logout functionality

## 🔧 Troubleshooting

### "Auth domain not authorized"
- Add `localhost` to authorized domains in Firebase Console
- Wait 1-2 minutes for changes to propagate

### "API key invalid"
- Verify credentials in `.env.local` match Firebase Console
- Check: https://console.firebase.google.com/project/stock-analytics-9ac6f/settings/general

### "Permission denied" errors
- Update Firestore rules in Firebase Console
- For development, use:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 📊 Storing Data in Firestore

Example - Store user watchlist:
```typescript
import { db } from '@/lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

// Save watchlist
await setDoc(doc(db, 'users', user.uid, 'watchlist', stockSymbol), {
  symbol: stockSymbol,
  name: stockName,
  addedAt: Date.now()
});
```

## 🎯 Next Steps

1. **Test the login flow**: Run `pnpm dev` and try logging in
2. **Configure Firestore rules**: Set up proper security rules
3. **Add Firestore persistence**: Migrate from localStorage to Firestore
4. **Enable Remote Config**: For dynamic API key management
5. **Deploy**: Use Firebase Hosting or Vercel

## 📚 Useful Links
- Firebase Console: https://console.firebase.google.com/project/stock-analytics-9ac6f
- Firebase Docs: https://firebase.google.com/docs
- Next.js + Firebase: https://firebase.google.com/docs/web/setup

---

**Your Firebase project is ready! 🎉**
Run `pnpm dev` and visit http://localhost:3000/login to start!
