# Pure

An AI-powered golf app that provides intelligent recommendations to golfers mid-round using language models, GPS tracking, and historic performance data.

Built with Expo and React Native for cross-platform mobile development.

## Features (Coming Soon)

- AI-powered club and shot recommendations
- Real-time GPS distance tracking
- Course mapping and hazard awareness
- Performance analytics and historic data tracking
- Mid-round strategy suggestions

## Prerequisites

Before running this app, make sure you have the following installed:

- Node.js (18 or higher)
- npm or yarn

**For iPhone Testing (Windows):**
- Install **Expo Go** app on your iPhone from the App Store

**For Android Testing:**
- Android Studio (for emulator) OR
- Install **Expo Go** app on your Android device from Google Play

## Setup Instructions

### 1. Install Dependencies

Dependencies are already installed. If you need to reinstall:

```bash
npm install
```

### 2. Start the Expo Development Server

```bash
npm start
```

This will open the Expo Developer Tools in your terminal. You'll see a QR code.

### 3. Running on Your iPhone (Windows)

1. Make sure your iPhone and Windows computer are on the **same WiFi network**
2. Open the **Expo Go** app on your iPhone
3. Scan the QR code shown in your terminal
4. The app will load on your iPhone

That's it! You can now develop on Windows and test on your iPhone in real-time.

### 4. Running on Android

#### Option A: Physical Android Device
1. Install **Expo Go** from Google Play Store
2. Scan the QR code with the Expo Go app

#### Option B: Android Emulator
1. Open Android Studio and start an emulator
2. Press `a` in the terminal where Expo is running

### 5. Running on Web (Optional)

```bash
npm run web
```

## Project Structure

```
Pure/
├── App.js              # Main application component
├── app.json            # Expo configuration
├── package.json        # Dependencies and scripts
├── babel.config.js     # Babel configuration
├── assets/             # App icons and splash screens
└── README.md           # This file
```

## Development

Currently, the app displays a home page with planned features. Future development will include:

1. Integration with AI language models for shot recommendations
2. GPS and location services integration (expo-location)
3. Course database and mapping
4. User profile and performance tracking
5. Real-time round tracking and suggestions

### Live Reloading

Expo provides live reloading by default. When you save changes to your code, the app will automatically refresh on your device.

## Building for Production

When you're ready to build a standalone app:

### iOS Build (requires Apple Developer account - $99/year)

```bash
npx eas build --platform ios
```

### Android Build (free)

```bash
npx eas build --platform android
```

Note: You'll need to sign up for an Expo account and set up EAS (Expo Application Services) for production builds.

## Troubleshooting

### App won't load on iPhone

1. Make sure your iPhone and computer are on the same WiFi network
2. Check that your firewall isn't blocking connections
3. Try restarting the Expo dev server: Press Ctrl+C, then run `npm start` again

### QR Code won't scan

1. Make sure you're using the **Expo Go** app (not the camera app)
2. Try pressing `s` in the terminal to switch to LAN connection
3. Manually enter the connection URL shown in the terminal into Expo Go

### Clear cache and restart

```bash
npx expo start -c
```

### Reinstall dependencies

```bash
rm -rf node_modules
npm install
```

## License

Private project
