/**
 * YOUR GOLF COURSES
 *
 * Add your own course GPS coordinates here.
 * Follow the instructions below to get coordinates from Google Maps.
 *
 * HOW TO GET COORDINATES:
 * 1. Go to https://www.google.com/maps
 * 2. Click "Satellite" view (bottom left)
 * 3. Find your golf course
 * 4. Right-click on the tee box → "What's here?"
 * 5. Bottom panel shows coordinates like: 36.5674, -121.9500
 * 6. Copy latitude (first number) and longitude (second number)
 * 7. Repeat for green center
 * 8. Add below!
 */

export const MY_COURSES = {
  // Example: Replace with your actual course
  'my-local-course': {
    id: 'my-local-course',
    name: 'My Local Golf Course',
    location: 'My City, State',

    holes: {
      // HOLE 1 - Fill in your coordinates
      1: {
        par: 4,
        yardage: 380,
        teeBox: {
          latitude: 0.0,      // REPLACE: Right-click tee box on Google Maps
          longitude: 0.0,     // REPLACE: Copy coordinates here
        },
        green: {
          latitude: 0.0,      // REPLACE: Right-click green center
          longitude: 0.0,     // REPLACE: Copy coordinates here
        },
      },

      // HOLE 2
      2: {
        par: 5,
        yardage: 520,
        teeBox: {
          latitude: 0.0,      // REPLACE
          longitude: 0.0,     // REPLACE
        },
        green: {
          latitude: 0.0,      // REPLACE
          longitude: 0.0,     // REPLACE
        },
      },

      // HOLE 3
      3: {
        par: 3,
        yardage: 165,
        teeBox: {
          latitude: 0.0,
          longitude: 0.0,
        },
        green: {
          latitude: 0.0,
          longitude: 0.0,
        },
      },

      // Add holes 4-18 using same format...
      // Just copy-paste hole 1 and change the number!

    },
  },

  // EXAMPLE: Real coordinates from famous Pebble Beach Hole 7
  // Use this as a reference or to test
  'pebble-beach': {
    id: 'pebble-beach',
    name: 'Pebble Beach Golf Links',
    location: 'Pebble Beach, CA',

    holes: {
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
    },
  },
};

/**
 * QUICK COPY-PASTE TEMPLATE:
 *
 * Copy this for each new hole:
 *
  X: {
    par: 4,           // Change to 3, 4, or 5
    yardage: 380,     // Change to actual yardage
    teeBox: {
      latitude: 0.0,  // Get from Google Maps
      longitude: 0.0, // Get from Google Maps
    },
    green: {
      latitude: 0.0,  // Get from Google Maps
      longitude: 0.0, // Get from Google Maps
    },
  },
 */

// Helper function to get hole data
export const getHoleGPS = (courseId, holeNumber) => {
  const course = MY_COURSES[courseId];
  if (!course) return null;
  return course.holes[holeNumber] || null;
};

// Example usage:
// const hole7GPS = getHoleGPS('pebble-beach', 7);
// console.log(hole7GPS.teeBox); // { latitude: 36.5736, longitude: -121.9531 }
