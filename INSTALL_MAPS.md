# Install Satellite Maps - Step by Step

## Step 1: Install react-native-maps

Open terminal in your project folder and run:

```bash
npx expo install react-native-maps
```

## Step 2: Get Google Maps API Key (Android only - iOS is FREE!)

### A. Go to Google Cloud Console
1. Open browser: https://console.cloud.google.com/
2. Sign in with Google account
3. Click "Select a project" → "New Project"
4. Name: "Pure"
5. Click "Create"

### B. Enable Maps SDK
1. In left menu, click "APIs & Services" → "Library"
2. Search for "Maps SDK for Android"
3. Click it, then click "ENABLE"
4. Wait for it to enable

### C. Create API Key
1. In left menu, click "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy the key (looks like: `AIzaSyD4f7g8h9j0k1l2m3n4o5p6q7r8s9t0u1v`)
4. Save it somewhere safe

### D. Restrict the Key (Important!)
1. Click the pencil icon next to your new API key
2. Under "API restrictions":
   - Select "Restrict key"
   - Check: "Maps SDK for Android"
3. Click "Save"

## Step 3: Add API Key to app.json

Open `app.json` and add your API key:

```json
{
  "expo": {
    "name": "pure-ai-caddie",
    "slug": "pure-ai-caddie",
    "version": "1.0.0",
    "android": {
      "package": "com.puregolf.app",
      "config": {
        "googleMaps": {
          "apiKey": "PASTE_YOUR_API_KEY_HERE"
        }
      }
    },
    "ios": {
      "bundleIdentifier": "com.puregolf.app"
    }
  }
}
```

Replace `PASTE_YOUR_API_KEY_HERE` with the key you copied.

**Note:** iOS doesn't need an API key! Apple Maps is completely free.

## Step 4: Build the App (Maps won't work in Expo Go)

```bash
# For Android
npx expo run:android

# For iOS
npx expo run:ios
```

**Important:** Maps require a development build. They will NOT work in Expo Go app.

## Step 5: Test It

Run the app and navigate to a hole. You should see a real satellite map!

## Troubleshooting

### Problem: Blank map on Android
**Solution:** Check your API key in app.json is correct

### Problem: "This page can't load Google Maps correctly"
**Solution:** Make sure "Maps SDK for Android" is enabled in Google Cloud

### Problem: Map shows but says "For development purposes only"
**Solution:** This is normal for free tier. Goes away in production.

## You're Done!

Maps are now working. Next step: Add your course coordinates.
