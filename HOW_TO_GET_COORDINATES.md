# How to Get GPS Coordinates from Google Maps

## Video Tutorial
The easiest way is to watch this: https://www.youtube.com/watch?v=Ar4sVyuJN7g

## Step-by-Step Instructions

### Step 1: Open Google Maps
1. Go to https://www.google.com/maps
2. Click **"Satellite"** button (bottom left corner)

### Step 2: Find Your Golf Course
1. Search for your course name (e.g., "Pebble Beach Golf Links")
2. Zoom in until you can clearly see individual holes
3. Use scroll wheel or pinch to zoom

### Step 3: Find Hole 1
1. Locate the first tee box
2. Zoom in close so you can see the tee markers
3. The tee box is usually a small rectangular area

### Step 4: Get Tee Box Coordinates
1. **Right-click** directly on the tee box
2. Select **"What's here?"** from menu
3. A small panel appears at bottom with coordinates
4. Coordinates look like: `36.5674, -121.9500`
   - First number = **Latitude** (36.5674)
   - Second number = **Longitude** (-121.9500)
5. **Click the coordinates** to copy them
6. Paste into your `my-courses.js` file

### Step 5: Get Green Coordinates
1. Find the center of the green for Hole 1
2. **Right-click** on the center of green
3. Select **"What's here?"**
4. Copy coordinates
5. Paste into your file

### Step 6: Repeat for All 18 Holes
Do the same for holes 2-18!

## Example: Filling in Hole 1

You found these coordinates:
- Tee box: `40.7589, -73.9851`
- Green: `40.7595, -73.9845`

Enter them like this:

```javascript
1: {
  par: 4,
  yardage: 380,
  teeBox: {
    latitude: 40.7589,    // First number from "40.7589, -73.9851"
    longitude: -73.9851,  // Second number
  },
  green: {
    latitude: 40.7595,    // First number from "40.7595, -73.9845"
    longitude: -73.9845,  // Second number
  },
},
```

## Pro Tips

### Tip 1: Start with 3 Holes
Don't do all 18 at once! Start with holes 1, 2, 3 to test.

### Tip 2: Use Street View
If you can't tell where the tee box is:
1. Drag the yellow person icon onto the course
2. This opens Street View
3. Look around to confirm you have the right spot

### Tip 3: Check Your Work
After entering coordinates:
1. The map will show markers at those spots
2. Make sure the tee marker is on the tee box!
3. Make sure the green marker is on the green!

### Tip 4: Negative Numbers are OK
- USA East Coast: Longitude is negative (-73.9851)
- USA West Coast: Longitude is negative (-121.9500)
- Europe/Asia: Longitude can be positive

## Common Mistakes

❌ **Swapping lat/lng**
```javascript
// WRONG - longitude first
latitude: -121.9500,
longitude: 36.5674,
```

✅ **Correct order**
```javascript
// CORRECT - latitude first
latitude: 36.5674,
longitude: -121.9500,
```

❌ **Forgetting negative sign**
```javascript
longitude: 121.9500,  // WRONG - should be negative for USA
```

✅ **With negative**
```javascript
longitude: -121.9500,  // CORRECT
```

## Quick Test: Pebble Beach Hole 7

Want to test before mapping your own course? Use these famous coordinates:

```javascript
7: {
  par: 3,
  yardage: 106,
  teeBox: {
    latitude: 36.5736,
    longitude: -121.9531,
  },
  green: {
    latitude: 36.5738,
    longitude: -121.9527,
  },
},
```

This is the famous tiny green perched above the ocean at Pebble Beach!

## Time Estimate

- First hole: 5 minutes (learning)
- Each additional hole: 1-2 minutes
- Total for 18 holes: ~30-40 minutes

## Questions?

If the map shows your markers in the ocean or wrong country:
1. Check latitude/longitude aren't swapped
2. Check negative signs are correct
3. Make sure you copied full decimal (36.5674, not just 36)

Now go map your course! 🏌️
