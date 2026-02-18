/**
 * Scoring Configuration for Forward Planning Decision Engine
 *
 * This file contains all configurable weights for shot scoring.
 * Penalties are negative values (bad outcomes).
 * Bonuses are positive values (good outcomes).
 *
 * These weights can be tuned based on player feedback and real-world results.
 */

// ============================================================================
// DEFAULT SCORING CONFIGURATION
// ============================================================================

export const DEFAULT_SCORING_CONFIG = {
  // ---- PENALTIES (negative = bad) ----
  penalties: {
    // Half-swing penalty: 30-60 yards is the "no man's land"
    // Too far to chip, too short for full swing
    halfSwing30_60: -30,

    // Awkward distance: 61-74 yards
    // Still uncomfortable but more manageable than 30-60
    awkward61_74: -10,

    // Partial swing penalties (based on club utilization)
    // If using less than 75% of club distance, player must manufacture a shot
    partialSwingUnder75: -25,
    // If using less than 85%, slightly uncomfortable
    partialSwingUnder85: -10,

    // Fairway miss penalty
    // Landing in rough vs fairway matters for next shot
    fairwayMiss: -15,

    // Over-the-green penalty (approach shots only)
    // Going long is usually worse than being short
    overTheGreen: -20,

    // Player weakness penalty
    // If club is in player's self-identified weak area
    playerWeakness: -15,

    // Hazard proximity penalties (based on dispersion overlap)
    // These are applied when dispersion circle overlaps hazard
    waterHazard: -40,     // Water = penalty stroke + re-hit
    obHazard: -50,        // OB = stroke and distance (worst)
    bunkerHazard: -15,    // Bunker = tough but recoverable
    deepBunker: -20,      // Deep bunker = harder to get out
    wasteBunker: -8,      // Waste area = less penalty

    // Fairway width penalty
    // Landing on a narrow fairway relative to dispersion radius
    narrowFairway: -15,

    // Flight path penalties (carrying over hazards)
    // Trees are impenetrable - can't fly through them
    treesInFlightPath: -100,
    // Flying over water is risky and mentally intimidating
    carryOverWater: -25,
    // Flying over other hazards (bunkers) is minor
    carryOverHazard: -5,

    // Next shot exposure penalties
    // Current landing zone forces NEXT shot to carry over hazard
    nextShotOverWater: -30,
    nextShotOverTrees: -50,
    nextShotOverBunker: -10,
  },

  // ---- BONUSES (positive = good) ----
  bonuses: {
    // Full swing bonus: 90-100% club utilization
    // This is the sweet spot - comfortable, committed swing
    fullSwing: 10,

    // Full wedge approach bonus: leaves 75-130 yards
    // Ideal distance for amateur approach shots
    fullWedgeApproach: 20,

    // Fairway landing bonus
    // Clean lie for next shot
    fairwayLanding: 15,

    // Safe miss zone bonus
    // If there's room to miss without disaster
    safeMissZone: 10,

    // Player strength bonus
    // If club is in player's self-identified strong area
    playerStrength: 10,

    // Fairway width bonus
    // Landing on a wide fairway relative to dispersion radius
    wideFairway: 12,
  },

  // ---- DISTANCE THRESHOLDS ----
  thresholds: {
    // Awkward distance range (no man's land)
    awkwardMin: 30,
    awkwardMax: 60,

    // Secondary awkward range
    secondaryAwkwardMin: 61,
    secondaryAwkwardMax: 74,

    // Full wedge approach range (ideal)
    fullWedgeMin: 75,
    fullWedgeMax: 130,

    // Club utilization thresholds
    utilizationSweetSpotMin: 0.90,
    utilizationSweetSpotMax: 1.00,
    utilizationPartialThreshold: 0.85,
    utilizationSeverePartialThreshold: 0.75,

    // Over-the-green threshold (% over target)
    overGreenThreshold: 1.10, // 10% over
  },

  // ---- PLAYER PROFILE (future extensibility) ----
  // These hooks are not wired into scoring yet but provide structure
  // for future features like aggression settings and shot history.
  playerProfile: {
    aggressionLevel: 0.5,    // 0.0 = ultra conservative, 1.0 = ultra aggressive
    shotHistory: null,        // Future: { clubId: { missDirection, missPercent } }
    roundHistory: null,       // Future: { averageScore, recentTrend }
  },
};

// ============================================================================
// PLAYER AREA TO CLUB MAPPING
// ============================================================================

/**
 * Maps player's "best area" and "worst area" preferences to specific clubs.
 * Used by shotScorer.js to apply strength/weakness bonuses/penalties.
 */
export const AREA_TO_CLUBS = {
  driver: ['driver'],

  long_irons: [
    '3_iron', '4_iron', '5_iron',
    '3_wood', '5_wood', '7_wood',
    '3_hybrid', '4_hybrid', '5_hybrid',
  ],

  short_irons: [
    '6_iron', '7_iron', '8_iron', '9_iron',
  ],

  wedges: [
    'pw', 'gw', 'sw', 'lw',
    'w_46', 'w_48', 'w_50', 'w_52', 'w_54', 'w_56', 'w_58', 'w_60',
  ],

  chipping: [
    'sw', 'lw',
    'w_54', 'w_56', 'w_58', 'w_60',
  ],

  putting: [], // Not applicable for shot planning
};

// ============================================================================
// HAZARD SEVERITY MAPPING
// ============================================================================

/**
 * Maps hazard types to their severity scores.
 * Used when calculating hazard proximity penalties.
 */
export const HAZARD_SEVERITY = {
  water: 40,
  ob: 50,
  penalty: 40,      // Generic penalty area
  bunker: 15,
  deep_bunker: 20,
  fairway_bunker: 12,
  greenside_bunker: 15,
  waste_area: 8,
  trees: 15,
  heavy_rough: 10,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Merge custom config with defaults
 *
 * @param {Object} customConfig - Custom scoring overrides
 * @returns {Object} Merged configuration
 */
export function mergeConfig(customConfig = {}) {
  return {
    penalties: {
      ...DEFAULT_SCORING_CONFIG.penalties,
      ...(customConfig.penalties || {}),
    },
    bonuses: {
      ...DEFAULT_SCORING_CONFIG.bonuses,
      ...(customConfig.bonuses || {}),
    },
    thresholds: {
      ...DEFAULT_SCORING_CONFIG.thresholds,
      ...(customConfig.thresholds || {}),
    },
    playerProfile: {
      ...DEFAULT_SCORING_CONFIG.playerProfile,
      ...(customConfig.playerProfile || {}),
    },
  };
}

/**
 * Get clubs in a player's strong area
 *
 * @param {string} bestArea - Player's best area (e.g., 'driver', 'wedges')
 * @returns {Array<string>} Array of club identifiers
 */
export function getStrongClubs(bestArea) {
  return AREA_TO_CLUBS[bestArea] || [];
}

/**
 * Get clubs in a player's weak area
 *
 * @param {string} worstArea - Player's worst area
 * @returns {Array<string>} Array of club identifiers
 */
export function getWeakClubs(worstArea) {
  return AREA_TO_CLUBS[worstArea] || [];
}

/**
 * Get hazard penalty based on type
 *
 * @param {string} hazardType - Type of hazard
 * @returns {number} Penalty value (negative)
 */
export function getHazardPenalty(hazardType) {
  const severity = HAZARD_SEVERITY[hazardType] || 10;
  return -severity;
}
