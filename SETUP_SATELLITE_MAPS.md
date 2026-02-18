# Quick Setup: Enable Satellite Maps

## Step 1: Install react-native-maps

```bash
# For Expo (recommended for your app)
npx expo install react-native-maps

# Or with npm
npm install react-native-maps
```

## Step 2: Get Google Maps API Key (Android only)

### 2a. Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Name it "Pure" or similar

### 2b. Enable APIs
1. In Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for and enable:
   - **Maps SDK for Android**
   - **Maps SDK for iOS** (optional, Apple Maps is free)
   - **Places API** (if you want course search)

### 2c. Create API Key
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy your API key (looks like: `AIzaSyD...`)

### 2d. Restrict API Key (Important for security)
1. Click on your API key to edit
2. Under "Application restrictions":
   - Choose "Android apps"
   - Add your package name: `com.puregolf.app`
3. Under "API restrictions":
   - Choose "Restrict key"
   - Select: Maps SDK for Android
4. Save

## Step 3: Configure app.json

Add your API key to `app.json`:

```json
{
  "expo": {
    "name": "Pure",
    "slug": "pure-ai-caddie",
    "android": {
      "package": "com.puregolf.app",
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_ANDROID_API_KEY_HERE"
        }
      }
    },
    "ios": {
      "bundleIdentifier": "com.puregolf.app"
    }
  }
}
```

**Note:** iOS doesn't need an API key - it uses Apple Maps for free!

## Step 4: Update HoleViewScreen

Replace the current `HoleViewScreen` with `HoleViewSatellite`:

```javascript
// In App.js, change the import:
import HoleViewScreen from './screens/HoleViewSatellite';
```

## Step 5: Uncomment Map Code

In `screens/HoleViewSatellite.js`:

1. Uncomment the import at the top:
```javascript
import MapView, { Marker, Polyline, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
```

2. Uncomment the `<MapView>` component (currently commented out)

3. Remove or hide the placeholder view

## Step 6: Add Course GPS Data

Create a file for your course coordinates:

```javascript
// data/courses/pebble-beach.js
export const PEBBLE_BEACH_GPS = {
  1: {
    teeBox: { latitude: 36.5674, longitude: -121.9500 },
    green: { latitude: 36.5680, longitude: -121.9495 },
  },
  // ... holes 2-18
};
```

See `data/courses/example-course-gps.js` for complete example.

## Step 7: Test on Device

```bash
# Build and run on Android
npx expo run:android

# Build and run on iOS
npx expo run:ios
```

**Note:** Maps don't work in Expo Go. You must use a development build or production build.

## Cost Breakdown

### Free Tier
- **Apple Maps (iOS)**: Free unlimited
- **Google Maps (Android)**: $200 free credit/month
  - Static maps: ~100,000 loads free
  - Dynamic maps: ~28,000 loads free

### When You'll Need to Pay
Assuming 1,000 users, 4 rounds/month, 18 holes = 72,000 loads/month:
- **iOS**: $0 (Apple Maps is free)
- **Android**: ~$144/month for Google Maps
- **Total**: ~$144/month (or less if mostly iOS users)

### To Reduce Costs
1. Cache satellite images locally
2. Use static maps for initial view, interactive only on tap
3. Consider Mapbox ($0.50 per 1000 vs Google's $2)
4. Limit zoom levels to reduce API calls

## Alternative: Static Satellite Images (No SDK Needed)

If you want to avoid the complexity of react-native-maps:

```javascript
// Simply use Google Maps Static API
const getSatelliteUrl = (lat, lng) => {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=400x400&maptype=satellite&key=YOUR_API_KEY`;
};

// In your component:
<Image
  source={{ uri: getSatelliteUrl(36.5674, -121.9500) }}
  style={{ width: '100%', height: 300 }}
/>
```

**Pros:**
- Much simpler (no native SDK)
- Works in Expo Go
- Faster implementation

**Cons:**
- Static image only (no zoom/pan)
- Can't add interactive overlays
- Still costs money ($2 per 1000 loads)

## Troubleshooting

### "Blank map on Android"
- Check API key is correct in app.json
- Verify Maps SDK for Android is enabled in Google Cloud
- Make sure you're testing on a real device or emulator (not Expo Go)

### "Map shows but my location is wrong"
- Check GPS coordinates are correct (lat/lng not swapped)
- Verify you're using decimal degrees, not DMS format

### "Maps work on iOS but not Android"
- iOS uses Apple Maps (free), Android needs Google API key
- Double-check app.json configuration

## Next Steps

1. **Get API keys** ✅
2. **Install react-native-maps** ✅
3. **Configure app.json** ✅
4. **Add one course GPS data** (start with 3-4 holes)
5. **Test on device** (build required)
6. **Add more courses over time**

## Resources

- react-native-maps docs: https://github.com/react-native-maps/react-native-maps
- Google Maps pricing: https://mapsplatform.google.com/pricing/
- Mapbox pricing: https://www.mapbox.com/pricing
- Get GPS coordinates: https://www.google.com/maps (right-click → "What's here?")

## Example Course Data Sources

**Free:**
- Manual mapping using Google Maps
- User-generated (crowdsource)

**Paid APIs:**
- GolfNow API: ~$500/month
- Golf Genius: ~$1000/month
- CourseVision: Custom pricing

Start with manual mapping for 1-2 courses to test, then scale up!
