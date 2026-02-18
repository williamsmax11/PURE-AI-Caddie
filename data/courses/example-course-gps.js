/**
 * Example Course GPS Data Structure
 *
 * This shows how to structure hole GPS coordinates for satellite views
 * Similar to how 18 Birdies, The Grint, and other golf apps store course data
 *
 * HOW TO GET THIS DATA:
 * 1. Manual: Use Google Maps, right-click on tee/green, copy coordinates
 * 2. API: Use golf course data APIs (GolfNow, Golf Genius)
 * 3. User-generated: Let users map holes
 */

// Example: Pebble Beach Golf Links
export const PEBBLE_BEACH = {
  id: 'pebble-beach',
  name: 'Pebble Beach Golf Links',
  location: 'Pebble Beach, CA',

  // Course center (for initial map view)
  center: {
    latitude: 36.5674,
    longitude: -121.9500,
  },

  // Hole data with GPS coordinates
  holes: [
    {
      number: 1,
      par: 4,
      yardage: 389,
      handicap: 9,

      // Tee box location
      teeBox: {
        latitude: 36.5674,
        longitude: -121.9500,
        elevation: 50, // Optional: in feet
      },

      // Green center point
      green: {
        latitude: 36.5680,
        longitude: -121.9495,
        elevation: 45, // Optional
      },

      // Hazards (bunkers, water, etc.)
      hazards: [
        {
          type: 'bunker', // 'bunker', 'water', 'ob', 'tree'
          name: 'Left fairway bunker',
          // Polygon points defining the hazard shape
          coordinates: [
            { latitude: 36.5677, longitude: -121.9498 },
            { latitude: 36.5677, longitude: -121.9497 },
            { latitude: 36.5676, longitude: -121.9497 },
            { latitude: 36.5676, longitude: -121.9498 },
          ],
        },
        {
          type: 'bunker',
          name: 'Right fairway bunker',
          coordinates: [
            { latitude: 36.5678, longitude: -121.9493 },
            { latitude: 36.5678, longitude: -121.9492 },
            { latitude: 36.5677, longitude: -121.9492 },
            { latitude: 36.5677, longitude: -121.9493 },
          ],
        },
      ],

      // Optional: Landing zones / layup areas
      landingZones: [
        {
          name: 'Ideal drive zone',
          coordinates: [
            { latitude: 36.5677, longitude: -121.9496 },
            { latitude: 36.5678, longitude: -121.9496 },
            { latitude: 36.5678, longitude: -121.9495 },
            { latitude: 36.5677, longitude: -121.9495 },
          ],
          yardageFromTee: 250,
        },
      ],

      // Optional: Yardage markers
      yardageMarkers: [
        { yardage: 100, latitude: 36.5678, longitude: -121.9494 },
        { yardage: 150, latitude: 36.5676, longitude: -121.9497 },
        { yardage: 200, latitude: 36.5675, longitude: -121.9499 },
      ],

      // Hole description
      description: 'A slight dogleg right with bunkers guarding the left side of the fairway. Green slopes back to front.',

      // AI strategy tip
      strategy: 'Driver aimed at left bunker will leave you 150-160 yards. Green accepts a high approach shot.',
    },

    // Hole 2
    {
      number: 2,
      par: 5,
      yardage: 502,
      handicap: 15,

      teeBox: {
        latitude: 36.5681,
        longitude: -121.9496,
      },

      green: {
        latitude: 36.5695,
        longitude: -121.9505,
      },

      hazards: [
        {
          type: 'water',
          name: 'Ocean right',
          coordinates: [
            { latitude: 36.5685, longitude: -121.9500 },
            { latitude: 36.5690, longitude: -121.9502 },
            { latitude: 36.5690, longitude: -121.9508 },
            { latitude: 36.5685, longitude: -121.9508 },
          ],
        },
      ],

      description: 'Scenic par 5 along the ocean. Ocean right all the way.',
      strategy: 'Play it safe. 3-wood off tee, lay up to 100 yards, wedge to green.',
    },

    // Hole 7 - Famous hole at Pebble Beach
    {
      number: 7,
      par: 3,
      yardage: 106,
      handicap: 17,

      teeBox: {
        latitude: 36.5736,
        longitude: -121.9531,
      },

      green: {
        latitude: 36.5738,
        longitude: -121.9527,
      },

      hazards: [
        {
          type: 'water',
          name: 'Ocean front and right',
          coordinates: [
            { latitude: 36.5737, longitude: -121.9528 },
            { latitude: 36.5739, longitude: -121.9526 },
            { latitude: 36.5740, longitude: -121.9524 },
            { latitude: 36.5738, longitude: -121.9524 },
          ],
        },
        {
          type: 'bunker',
          name: 'Back left bunker',
          coordinates: [
            { latitude: 36.5739, longitude: -121.9528 },
            { latitude: 36.5739, longitude: -121.9527 },
            { latitude: 36.5738, longitude: -121.9527 },
            { latitude: 36.5738, longitude: -121.9528 },
          ],
        },
      ],

      description: 'Tiny green perched on a rocky outcropping. Ocean front and right, bunker back left.',
      strategy: 'Club up, aim left center. Better to miss long left than short right into ocean.',
    },

    // ... Add holes 3-6, 8-18 following same pattern
  ],
};

// Example: Local municipal course
export const CITY_PARK_GOLF = {
  id: 'city-park-golf',
  name: 'City Park Golf Course',
  location: 'Denver, CO',

  center: {
    latitude: 39.7474,
    longitude: -104.9598,
  },

  holes: [
    {
      number: 1,
      par: 4,
      yardage: 372,
      handicap: 7,

      teeBox: {
        latitude: 39.7474,
        longitude: -104.9598,
      },

      green: {
        latitude: 39.7482,
        longitude: -104.9592,
      },

      hazards: [
        {
          type: 'water',
          name: 'Creek right side',
          coordinates: [
            { latitude: 39.7478, longitude: -104.9594 },
            { latitude: 39.7480, longitude: -104.9593 },
          ],
        },
      ],

      description: 'Gentle dogleg left. Creek runs along right side.',
      strategy: 'Driver down the left side. Avoid creek right.',
    },
    // ... more holes
  ],
};

// Helper function to calculate distance between two GPS points
export const calculateDistance = (coord1, coord2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = coord1.latitude * Math.PI / 180;
  const φ2 = coord2.latitude * Math.PI / 180;
  const Δφ = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const Δλ = (coord2.longitude - coord1.longitude) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const meters = R * c;
  return Math.round(meters * 1.09361); // Convert to yards
};

// Helper function to get hole by number
export const getHoleData = (course, holeNumber) => {
  return course.holes.find(h => h.number === holeNumber);
};

// Example usage:
// const hole7 = getHoleData(PEBBLE_BEACH, 7);
// const distance = calculateDistance(hole7.teeBox, hole7.green);
// console.log(`Hole 7 distance: ${distance} yards`);
