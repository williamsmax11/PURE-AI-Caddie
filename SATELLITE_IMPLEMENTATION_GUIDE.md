# Satellite View Implementation Guide

## Overview
This guide shows how to implement satellite hole views like 18 Birdies using react-native-maps.

## Installation

```bash
# Install react-native-maps
npm install react-native-maps

# For Expo projects (recommended for your app)
npx expo install react-native-maps
```

## Setup

### 1. Get API Keys

#### Google Maps API (Android)
1. Go to https://console.cloud.google.com/
2. Create a project
3. Enable "Maps SDK for Android"
4. Create API key
5. Add to `app.json`:

```json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_ANDROID_API_KEY"
        }
      }
    }
  }
}
```

#### Apple Maps (iOS)
No API key needed! Apple Maps is free for iOS apps.

### 2. Course Data Structure

You need GPS coordinates for each hole. Here's the data model:

```javascript
// data/courses/pebble-beach.js
export const PEBBLE_BEACH_HOLES = [
  {
    number: 1,
    par: 4,
    yardage: 389,
    teeBox: {
      latitude: 36.5674,
      longitude: -121.9500,
    },
    green: {
      latitude: 36.5680,
      longitude: -121.9495,
    },
    hazards: [
      {
        type: 'bunker',
        coordinates: [
          { latitude: 36.5677, longitude: -121.9497 },
          // ... polygon points
        ],
      },
      {
        type: 'water',
        coordinates: [
          { latitude: 36.5679, longitude: -121.9492 },
          // ... polygon points
        ],
      },
    ],
  },
  // ... holes 2-18
];
```

## How to Get Hole Coordinates

### Method 1: Manual Mapping (Free)
1. Go to Google Maps (https://maps.google.com)
2. Search for the course
3. Switch to Satellite view
4. Right-click on tee box → "What's here?"
5. Copy latitude, longitude
6. Repeat for green center, hazards

### Method 2: Golf Course Data APIs (Paid)
- **GolfNow API** - Course data + GPS
- **Golf Genius** - Comprehensive course data
- **CourseVision** - Aerial imagery + GPS
- Cost: $500-2000/month for full access

### Method 3: User-Generated (Community)
- Let users map holes
- Crowdsource coordinates
- Build database over time

## Component Implementation

See `screens/HoleViewSatellite.js` for complete implementation.

## Features to Add

### Basic (MVP)
- [x] Satellite view of hole
- [x] Tee marker
- [x] Green marker
- [ ] Distance line

### Advanced
- [ ] Hazard polygons
- [ ] Yardage markers (100, 150, 200)
- [ ] Shot tracker (where user hit from)
- [ ] Wind direction arrow
- [ ] Elevation changes
- [ ] Custom pin drop for shot location

### Premium
- [ ] 3D terrain view
- [ ] Flyover animation
- [ ] Historical shot heatmap
- [ ] Club recommendations by zone

## Cost Estimates

### Free Tier
- **Apple Maps (iOS)**: Unlimited, free
- **Google Maps (Android)**:
  - Static: 28,000 loads/month free
  - Dynamic: $200 credit = ~40,000 loads
- **Mapbox**: 50,000 requests/month free

### Paid Usage
Assuming 10,000 active users, 2 rounds/month, 18 holes = 360,000 map loads/month:

- **Google Maps**: ~$720/month
- **Mapbox**: ~$160/month
- **Apple Maps (iOS only)**: $0

## Optimization Tips

### 1. Cache Satellite Images
```javascript
// Cache the static satellite image for each hole
const cacheKey = `hole_${courseId}_${holeNumber}`;
await AsyncStorage.setItem(cacheKey, satelliteImageUrl);
```

### 2. Use Static Images Initially
Load static satellite images first (faster), then upgrade to interactive map if user taps.

### 3. Lazy Load
Only load satellite view when user scrolls to hole, not all 18 upfront.

### 4. Limit Zoom
Restrict zoom levels to prevent excessive API calls:
```javascript
maxZoomLevel={18}
minZoomLevel={15}
```

## Alternative: Free Option Using OpenStreetMap

If you want completely free satellite imagery:

```bash
npm install react-native-map-clustering
```

Use Mapbox with OpenStreetMap satellite tiles (limited quality but free):

```javascript
<Mapbox.MapView
  styleURL="https://api.mapbox.com/styles/v1/mapbox/satellite-v9"
  // Rest of implementation
/>
```

**Quality:** Lower than Google/Apple, but free unlimited.

## Recommended Approach for Your App

### Phase 1 (MVP): Static Satellite Images
- Use Google Maps Static API
- Pre-cache images for popular courses
- Cost: ~$50-100/month
- Implementation: 1-2 hours

### Phase 2: Interactive Maps
- Migrate to react-native-maps
- Add tee/green markers
- Add distance calculations
- Cost: ~$200-500/month at scale
- Implementation: 1-2 days

### Phase 3: Advanced Features
- Shot tracking
- Hazard overlays
- Wind arrows
- Custom course mapping tool
- Implementation: 1-2 weeks

## Next Steps

1. **Get API keys** (Google & Mapbox)
2. **Test with one course** (Pebble Beach hole 7 is famous)
3. **Create hole coordinates database**
4. **Implement satellite view component**
5. **Add interactive features**
6. **Optimize for cost**

## Example Apps for Reference

Study these apps' hole views:
- **18 Birdies** - Gold standard
- **The Grint** - Simple, clean
- **GolfNow** - Basic but functional
- **Hole19** - Advanced 3D views
- **SwingU** - Good hazard overlays

All use similar Google Maps satellite + custom overlays approach.
