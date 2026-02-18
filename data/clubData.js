/**
 * Club Data — Single source of truth for all club definitions.
 *
 * Used by OnboardingScreen (bag setup) and MyBagScreen (bag management).
 */

export const MAX_CLUBS = 14;
export const STORAGE_KEY = '@myGolfBag';

// Distance percentages relative to driver (for auto-calculation in onboarding)
export const CLUB_DISTANCE_PERCENTAGES = {
  driver:     1.00,
  '3_wood':   0.89,
  '5_wood':   0.85,
  '7_wood':   0.82,
  '3_hybrid': 0.82,
  '4_hybrid': 0.78,
  '5_hybrid': 0.74,
  '6_hybrid': 0.71,
  '2_iron':   0.80,
  '3_iron':   0.78,
  '4_iron':   0.76,
  '5_iron':   0.72,
  '6_iron':   0.68,
  '7_iron':   0.64,
  '8_iron':   0.59,
  '9_iron':   0.54,
  pw:         0.49,
  gw:         0.44,
  sw:         0.38,
  lw:         0.33,
  '60_wedge': 0.30,
  putter:     null,
};

// Default driver distance when user selects "Don't know"
export const DEFAULT_DRIVER_DISTANCE = 220;

// Club data organized by category
export const CLUB_DATA = {
  Woods: [
    { id: 'driver',  name: 'Driver',  shortName: 'DR', category: 'woods',   defaultDistance: 230 },
    { id: '3_wood',  name: '3 Wood',  shortName: '3W', category: 'woods',   defaultDistance: 210 },
    { id: '5_wood',  name: '5 Wood',  shortName: '5W', category: 'woods',   defaultDistance: 195 },
    { id: '7_wood',  name: '7 Wood',  shortName: '7W', category: 'woods',   defaultDistance: 185 },
  ],
  Hybrids: [
    { id: '3_hybrid', name: '3 Hybrid', shortName: '3H', category: 'hybrids', defaultDistance: 190 },
    { id: '4_hybrid', name: '4 Hybrid', shortName: '4H', category: 'hybrids', defaultDistance: 180 },
    { id: '5_hybrid', name: '5 Hybrid', shortName: '5H', category: 'hybrids', defaultDistance: 170 },
    { id: '6_hybrid', name: '6 Hybrid', shortName: '6H', category: 'hybrids', defaultDistance: 162 },
  ],
  Irons: [
    { id: '2_iron', name: '2 Iron', shortName: '2i', category: 'irons', defaultDistance: 185 },
    { id: '3_iron', name: '3 Iron', shortName: '3i', category: 'irons', defaultDistance: 180 },
    { id: '4_iron', name: '4 Iron', shortName: '4i', category: 'irons', defaultDistance: 170 },
    { id: '5_iron', name: '5 Iron', shortName: '5i', category: 'irons', defaultDistance: 160 },
    { id: '6_iron', name: '6 Iron', shortName: '6i', category: 'irons', defaultDistance: 150 },
    { id: '7_iron', name: '7 Iron', shortName: '7i', category: 'irons', defaultDistance: 140 },
    { id: '8_iron', name: '8 Iron', shortName: '8i', category: 'irons', defaultDistance: 130 },
    { id: '9_iron', name: '9 Iron', shortName: '9i', category: 'irons', defaultDistance: 120 },
  ],
  Wedges: [
    { id: 'pw',        name: 'PW',        shortName: 'PW', category: 'wedges', defaultDistance: 110 },
    { id: 'gw',        name: 'GW (50\u00b0)', shortName: 'GW', category: 'wedges', defaultDistance: 100 },
    { id: 'sw',        name: 'SW (54\u00b0)', shortName: 'SW', category: 'wedges', defaultDistance: 85 },
    { id: 'lw',        name: 'LW (58\u00b0)', shortName: 'LW', category: 'wedges', defaultDistance: 70 },
    { id: '60_wedge',  name: '60\u00b0',      shortName: '60', category: 'wedges', defaultDistance: 65 },
  ],
  Putter: [
    { id: 'putter', name: 'Putter', shortName: 'PT', category: 'putter', defaultDistance: null },
  ],
};

// Flat array of all standard clubs
export const ALL_CLUBS_FLAT = Object.values(CLUB_DATA).flat();

// Map for O(1) lookup by club ID
export const ALL_CLUBS_MAP = {};
for (const club of ALL_CLUBS_FLAT) {
  ALL_CLUBS_MAP[club.id] = club;
}

// Default bag selections for onboarding
export const DEFAULT_ONBOARDING_BAG = [
  'driver', '3_wood', '5_iron', '6_iron', '7_iron',
  '8_iron', '9_iron', 'pw', 'sw', 'putter',
];

/**
 * Calculate estimated club distances from a driver distance.
 * @param {number} driverDistance - Driver distance in yards
 * @param {string[]} selectedClubIds - Club IDs to calculate for
 * @returns {Object} { clubId: estimatedDistance }
 */
export function calculateDistancesFromDriver(driverDistance, selectedClubIds) {
  const distances = {};
  for (const clubId of selectedClubIds) {
    const pct = CLUB_DISTANCE_PERCENTAGES[clubId];
    if (pct === null || pct === undefined) {
      distances[clubId] = null; // putter or custom wedge
    } else {
      distances[clubId] = Math.round(driverDistance * pct);
    }
  }
  return distances;
}

/**
 * Create a custom wedge entry.
 * @param {number} loft - Loft in degrees (40-70)
 * @returns {Object} Club definition object
 */
export function createCustomWedge(loft) {
  return {
    id: `w_${loft}`,
    name: `${loft}\u00b0`,
    shortName: `${loft}`,
    category: 'wedges',
    defaultDistance: null,
    isCustom: true,
  };
}
