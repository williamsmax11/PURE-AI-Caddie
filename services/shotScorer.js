/**
 * Shot Scorer Service
 *
 * Calculates scores for individual shot options based on penalties and bonuses.
 * This is the heart of the forward planning decision engine.
 *
 * Each shot receives a score where:
 * - Higher scores = better shot options
 * - Penalties reduce the score (negative values)
 * - Bonuses increase the score (positive values)
 */

import {
  DEFAULT_SCORING_CONFIG,
  AREA_TO_CLUBS,
  HAZARD_SEVERITY,
  getStrongClubs,
  getWeakClubs,
} from './scoringConfig';
import { isPointInPolygon } from '../utils/geoUtils';

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Score a single shot option
 *
 * @param {Object} shotOption - The shot option to score
 *   @param {number} shotOption.shotNumber - 1, 2, or 3
 *   @param {string} shotOption.club - Club identifier
 *   @param {number} shotOption.clubDistance - Player's distance with this club
 *   @param {number} shotOption.effectiveDistance - "Plays like" distance after adjustments
 *   @param {number} shotOption.distanceRemaining - Distance to green after this shot
 *   @param {Object} shotOption.landingZone - { latitude, longitude }
 *   @param {number} shotOption.dispersionRadius - Player's dispersion for this club
 *   @param {Array} shotOption.hazardConflicts - Overlapping hazards
 *   @param {boolean} shotOption.isApproach - True if this is an approach to green
 *
 * @param {Object} playerContext - Player information
 *   @param {string} playerContext.bestArea - Player's strength area
 *   @param {string} playerContext.worstArea - Player's weakness area
 *   @param {Object} playerContext.clubDistances - All club distances
 *
 * @param {Object} holeData - Hole information
 *   @param {Array} holeData.polygons - Course polygons
 *   @param {number} holeData.greenDepth - Depth of green in yards
 *
 * @param {Object} config - Scoring configuration (optional)
 *
 * @returns {Object} { score, breakdown: { penalties: [], bonuses: [] } }
 */
export function scoreShot(shotOption, playerContext, holeData, config = DEFAULT_SCORING_CONFIG) {
  let score = 0;
  const breakdown = { penalties: [], bonuses: [] };

  const {
    club,
    clubDistance,
    effectiveDistance,
    distanceRemaining,
    landingZone,
    dispersionRadius,
    hazardConflicts = [],
    isApproach = false,
  } = shotOption;

  const { polygons = [] } = holeData;

  // Calculate club utilization
  const clubUtilization = effectiveDistance / clubDistance;

  // ============================================
  // PENALTIES
  // ============================================

  // 1. Half-swing penalty (30-60 yards remaining)
  const halfSwingPenalty = calculateHalfSwingPenalty(distanceRemaining, config);
  if (halfSwingPenalty.value !== 0) {
    score += halfSwingPenalty.value;
    breakdown.penalties.push(halfSwingPenalty);
  }

  // 2. Partial swing penalty (based on club utilization)
  const partialPenalty = calculatePartialSwingPenalty(clubUtilization, config);
  if (partialPenalty.value !== 0) {
    score += partialPenalty.value;
    breakdown.penalties.push(partialPenalty);
  }

  // 3. Hazard proximity penalty
  const hazardPenalty = calculateHazardProximityPenalty(hazardConflicts, dispersionRadius, config);
  if (hazardPenalty.value !== 0) {
    score += hazardPenalty.value;
    breakdown.penalties.push(hazardPenalty);
  }

  // 4. Fairway miss penalty (only for non-approach shots)
  if (!isApproach && landingZone) {
    const fairwayPenalty = calculateFairwayMissPenalty(landingZone, polygons, config);
    if (fairwayPenalty.value !== 0) {
      score += fairwayPenalty.value;
      breakdown.penalties.push(fairwayPenalty);
    }
  }

  // 5. Over-the-green penalty (approach shots only)
  if (isApproach) {
    const overGreenPenalty = calculateOverGreenPenalty(clubDistance, effectiveDistance, config);
    if (overGreenPenalty.value !== 0) {
      score += overGreenPenalty.value;
      breakdown.penalties.push(overGreenPenalty);
    }
  }

  // 6. Player weakness penalty
  const weaknessPenalty = calculatePlayerWeaknessPenalty(club, playerContext, config);
  if (weaknessPenalty.value !== 0) {
    score += weaknessPenalty.value;
    breakdown.penalties.push(weaknessPenalty);
  }

  // 7. Distance-based hazard avoidance penalty (non-approach only)
  if (!isApproach) {
    const distHazardPenalty = calculateDistanceHazardAvoidancePenalty(shotOption, holeData, config);
    if (distHazardPenalty.value !== 0) {
      score += distHazardPenalty.value;
      breakdown.penalties.push(distHazardPenalty);
    }
  }

  // 8. Flight path penalty (carrying over hazards - trees block, water is scary)
  const flightPathPenalty = calculateFlightPathPenalty(shotOption, config);
  if (flightPathPenalty.value !== 0) {
    score += flightPathPenalty.value;
    breakdown.penalties.push(flightPathPenalty);
  }

  // 9. Next shot over hazard penalty (don't leave yourself a shot over water/trees)
  if (!isApproach) {
    const nextShotPenalty = calculateNextShotOverHazardPenalty(shotOption, config);
    if (nextShotPenalty.value !== 0) {
      score += nextShotPenalty.value;
      breakdown.penalties.push(nextShotPenalty);
    }
  }

  // ============================================
  // BONUSES
  // ============================================

  // 1. Full swing bonus (90-100% club utilization)
  const fullSwingBonus = calculateFullSwingBonus(clubUtilization, config);
  if (fullSwingBonus.value !== 0) {
    score += fullSwingBonus.value;
    breakdown.bonuses.push(fullSwingBonus);
  }

  // 2. Full wedge approach bonus (leaves 75-130 yards)
  if (!isApproach) {
    const wedgeBonus = calculateFullWedgeApproachBonus(distanceRemaining, playerContext, config);
    if (wedgeBonus.value !== 0) {
      score += wedgeBonus.value;
      breakdown.bonuses.push(wedgeBonus);
    }
  }

  // 3. Fairway landing bonus (only for non-approach shots)
  if (!isApproach && landingZone) {
    const fairwayBonus = calculateFairwayLandingBonus(landingZone, polygons, config);
    if (fairwayBonus.value !== 0) {
      score += fairwayBonus.value;
      breakdown.bonuses.push(fairwayBonus);
    }
  }

  // 4. Safe miss zone bonus
  const safeMissBonus = calculateSafeMissBonus(shotOption, holeData, config);
  if (safeMissBonus.value !== 0) {
    score += safeMissBonus.value;
    breakdown.bonuses.push(safeMissBonus);
  }

  // 5. Player strength bonus
  const strengthBonus = calculatePlayerStrengthBonus(club, playerContext, config);
  if (strengthBonus.value !== 0) {
    score += strengthBonus.value;
    breakdown.bonuses.push(strengthBonus);
  }

  // 6. Fairway width bonus/penalty (non-approach only)
  if (!isApproach) {
    const widthResult = calculateFairwayWidthBonus(shotOption, config);
    if (widthResult.value !== 0) {
      score += widthResult.value;
      if (widthResult.value > 0) {
        breakdown.bonuses.push(widthResult);
      } else {
        breakdown.penalties.push(widthResult);
      }
    }
  }

  return { score, breakdown };
}

// ============================================================================
// PENALTY CALCULATORS
// ============================================================================

/**
 * Calculate half-swing penalty for awkward distances
 *
 * @param {number} distanceRemaining - Distance to green after shot
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateHalfSwingPenalty(distanceRemaining, config = DEFAULT_SCORING_CONFIG) {
  const { thresholds, penalties } = config;

  // Worst case: 30-60 yards
  if (distanceRemaining >= thresholds.awkwardMin && distanceRemaining <= thresholds.awkwardMax) {
    return {
      type: 'halfSwing',
      value: penalties.halfSwing30_60,
      reason: `${Math.round(distanceRemaining)} yards is worst distance - too far for chip, too short for full swing`,
    };
  }

  // Uncomfortable: 61-74 yards
  if (distanceRemaining >= thresholds.secondaryAwkwardMin && distanceRemaining <= thresholds.secondaryAwkwardMax) {
    return {
      type: 'awkwardDistance',
      value: penalties.awkward61_74,
      reason: `${Math.round(distanceRemaining)} yards is awkward - partial wedge required`,
    };
  }

  return { type: 'halfSwing', value: 0, reason: null };
}

/**
 * Calculate partial swing penalty based on club utilization
 *
 * @param {number} clubUtilization - effectiveDistance / clubDistance (0-1+)
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculatePartialSwingPenalty(clubUtilization, config = DEFAULT_SCORING_CONFIG) {
  const { thresholds, penalties } = config;

  // Severe: less than 75% utilization
  if (clubUtilization < thresholds.utilizationSeverePartialThreshold) {
    return {
      type: 'partialSwing',
      value: penalties.partialSwingUnder75,
      reason: `Only ${Math.round(clubUtilization * 100)}% of club - requires significant decel`,
    };
  }

  // Mild: less than 85% utilization
  if (clubUtilization < thresholds.utilizationPartialThreshold) {
    return {
      type: 'partialSwing',
      value: penalties.partialSwingUnder85,
      reason: `Only ${Math.round(clubUtilization * 100)}% of club - partial swing needed`,
    };
  }

  return { type: 'partialSwing', value: 0, reason: null };
}

/**
 * Calculate hazard proximity penalty
 *
 * @param {Array} hazardConflicts - Array of hazard conflicts with overlap info
 * @param {number} dispersionRadius - Player's dispersion radius
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateHazardProximityPenalty(hazardConflicts, dispersionRadius, config = DEFAULT_SCORING_CONFIG) {
  if (!hazardConflicts || hazardConflicts.length === 0) {
    return { type: 'hazard', value: 0, reason: null };
  }

  let totalPenalty = 0;
  const hazardNames = [];

  for (const conflict of hazardConflicts) {
    const { type, overlapPercentage = 50, name } = conflict;

    // Get base penalty for hazard type
    const basePenalty = HAZARD_SEVERITY[type] || 10;

    // Scale penalty by overlap percentage (0-100%)
    // More overlap = higher penalty
    const proximityFactor = overlapPercentage / 100;
    const penalty = Math.round(basePenalty * proximityFactor);

    totalPenalty -= penalty;
    hazardNames.push(name || type);
  }

  if (totalPenalty === 0) {
    return { type: 'hazard', value: 0, reason: null };
  }

  return {
    type: 'hazard',
    value: totalPenalty,
    reason: `Dispersion overlaps ${hazardNames.join(', ')}`,
  };
}

/**
 * Calculate fairway miss penalty
 *
 * @param {Object} landingZone - { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateFairwayMissPenalty(landingZone, polygons, config = DEFAULT_SCORING_CONFIG) {
  if (!landingZone || !polygons) {
    return { type: 'fairwayMiss', value: 0, reason: null };
  }

  // Check if landing zone is in fairway
  const inFairway = isInFairway(landingZone, polygons);

  if (!inFairway) {
    return {
      type: 'fairwayMiss',
      value: config.penalties.fairwayMiss,
      reason: 'Landing zone is in rough',
    };
  }

  return { type: 'fairwayMiss', value: 0, reason: null };
}

/**
 * Calculate over-the-green penalty for approach shots
 *
 * @param {number} clubDistance - Player's distance with club
 * @param {number} effectiveDistance - Target distance
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateOverGreenPenalty(clubDistance, effectiveDistance, config = DEFAULT_SCORING_CONFIG) {
  const overRatio = clubDistance / effectiveDistance;

  // If club flies more than 10% past target, risk of going over
  if (overRatio > config.thresholds.overGreenThreshold) {
    return {
      type: 'overGreen',
      value: config.penalties.overTheGreen,
      reason: `Club flies ${Math.round((overRatio - 1) * 100)}% past target - risk of going over green`,
    };
  }

  return { type: 'overGreen', value: 0, reason: null };
}

/**
 * Calculate player weakness penalty
 *
 * @param {string} club - Club identifier
 * @param {Object} playerContext - Player context with worstArea
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculatePlayerWeaknessPenalty(club, playerContext, config = DEFAULT_SCORING_CONFIG) {
  const { worstArea } = playerContext || {};

  if (!worstArea || !club) {
    return { type: 'weakness', value: 0, reason: null };
  }

  const weakClubs = getWeakClubs(worstArea);
  const normalizedClub = club.toLowerCase().replace(/\s+/g, '_');

  if (weakClubs.includes(normalizedClub)) {
    return {
      type: 'weakness',
      value: config.penalties.playerWeakness,
      reason: `${club} is in your weak area (${worstArea})`,
    };
  }

  return { type: 'weakness', value: 0, reason: null };
}

// ============================================================================
// BONUS CALCULATORS
// ============================================================================

/**
 * Calculate full swing bonus
 *
 * @param {number} clubUtilization - effectiveDistance / clubDistance (0-1+)
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateFullSwingBonus(clubUtilization, config = DEFAULT_SCORING_CONFIG) {
  const { thresholds, bonuses } = config;

  // Sweet spot: 90-100% utilization
  if (clubUtilization >= thresholds.utilizationSweetSpotMin &&
      clubUtilization <= thresholds.utilizationSweetSpotMax) {
    return {
      type: 'fullSwing',
      value: bonuses.fullSwing,
      reason: 'Full comfortable swing',
    };
  }

  return { type: 'fullSwing', value: 0, reason: null };
}

/**
 * Calculate full wedge approach bonus
 *
 * @param {number} distanceRemaining - Distance to green after shot
 * @param {Object} playerContext - Player context with clubDistances
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateFullWedgeApproachBonus(distanceRemaining, playerContext, config = DEFAULT_SCORING_CONFIG) {
  const { thresholds, bonuses } = config;

  // Check if distance is in the ideal full wedge range
  if (distanceRemaining >= thresholds.fullWedgeMin && distanceRemaining <= thresholds.fullWedgeMax) {
    return {
      type: 'wedgeApproach',
      value: bonuses.fullWedgeApproach,
      reason: `Leaves ${Math.round(distanceRemaining)} yards - ideal full wedge distance`,
    };
  }

  return { type: 'wedgeApproach', value: 0, reason: null };
}

/**
 * Calculate fairway landing bonus
 *
 * @param {Object} landingZone - { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateFairwayLandingBonus(landingZone, polygons, config = DEFAULT_SCORING_CONFIG) {
  if (!landingZone || !polygons) {
    return { type: 'fairwayLanding', value: 0, reason: null };
  }

  // Check if landing zone is in fairway
  const inFairway = isInFairway(landingZone, polygons);

  if (inFairway) {
    return {
      type: 'fairwayLanding',
      value: config.bonuses.fairwayLanding,
      reason: 'Landing zone is in fairway',
    };
  }

  return { type: 'fairwayLanding', value: 0, reason: null };
}

/**
 * Calculate safe miss zone bonus
 *
 * @param {Object} shotOption - Shot option with landing zone and dispersion
 * @param {Object} holeData - Hole data with polygons
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateSafeMissBonus(shotOption, holeData, config = DEFAULT_SCORING_CONFIG) {
  const { hazardConflicts = [], safeZone } = shotOption;
  const { polygons = [] } = holeData;

  // If there are no significant hazard conflicts and there's an identified safe zone
  if (hazardConflicts.length === 0 && safeZone) {
    return {
      type: 'safeMiss',
      value: config.bonuses.safeMissZone,
      reason: 'Safe miss zone available',
    };
  }

  // Check if landing zone is far from hazards
  const hazardPolygons = polygons.filter(p =>
    ['water', 'ob', 'bunker', 'penalty'].includes(p.type)
  );

  if (hazardPolygons.length === 0) {
    return {
      type: 'safeMiss',
      value: config.bonuses.safeMissZone,
      reason: 'No hazards in play',
    };
  }

  return { type: 'safeMiss', value: 0, reason: null };
}

/**
 * Calculate player strength bonus
 *
 * @param {string} club - Club identifier
 * @param {Object} playerContext - Player context with bestArea
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculatePlayerStrengthBonus(club, playerContext, config = DEFAULT_SCORING_CONFIG) {
  const { bestArea } = playerContext || {};

  if (!bestArea || !club) {
    return { type: 'strength', value: 0, reason: null };
  }

  const strongClubs = getStrongClubs(bestArea);
  const normalizedClub = club.toLowerCase().replace(/\s+/g, '_');

  if (strongClubs.includes(normalizedClub)) {
    return {
      type: 'strength',
      value: config.bonuses.playerStrength,
      reason: `${club} is your strength (${bestArea})`,
    };
  }

  return { type: 'strength', value: 0, reason: null };
}

// ============================================================================
// DISTANCE-BASED HAZARD AVOIDANCE
// ============================================================================

/**
 * Calculate penalty for shots whose landing distance overlaps hazard distance ranges.
 * Prefers clubs that land completely short of or past hazards rather than in them.
 * Penalty hazards (water/OB) are penalized 2x more heavily.
 *
 * @param {Object} shotOption - Shot option with rawDistance, dispersionRadius, hazardRanges
 * @param {Object} holeData - Hole data
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateDistanceHazardAvoidancePenalty(shotOption, holeData, config = DEFAULT_SCORING_CONFIG) {
  const { hazardRanges, rawDistance, dispersionRadius } = shotOption;

  if (!hazardRanges || hazardRanges.length === 0 || !rawDistance) {
    return { type: 'distanceHazard', value: 0, reason: null };
  }

  // Distance dispersion: how far short/long a shot might go
  const distanceDispersion = (dispersionRadius || 15) * 0.8;
  const landingMin = rawDistance - distanceDispersion;
  const landingMax = rawDistance + distanceDispersion;

  let totalPenalty = 0;
  const reasons = [];

  for (const hazardRange of hazardRanges) {
    const { frontDistance, backDistance, isPenalty, severity, name } = hazardRange;

    // Does the landing window overlap this hazard's distance range?
    const overlaps = landingMax >= frontDistance && landingMin <= backDistance;

    if (overlaps) {
      // Calculate overlap percentage
      const overlapStart = Math.max(landingMin, frontDistance);
      const overlapEnd = Math.min(landingMax, backDistance);
      const landingWindow = landingMax - landingMin;
      const overlapPercent = landingWindow > 0 ? ((overlapEnd - overlapStart) / landingWindow) * 100 : 100;

      // Base penalty from severity, scaled by overlap
      let penalty = severity * (overlapPercent / 100);

      // Double penalty for penalty hazards (water/OB)
      if (isPenalty) {
        penalty *= 2.0;
      }

      totalPenalty -= Math.round(penalty);
      reasons.push(`Landing distance overlaps ${name} (${frontDistance}-${backDistance} yds)`);
    } else {
      // Check if just barely clearing the hazard (tight margin)
      const bufferShort = frontDistance - landingMax;
      const bufferLong = landingMin - backDistance;
      const buffer = Math.max(bufferShort, bufferLong);

      if (buffer > 0 && buffer < 15) {
        const smallPenalty = isPenalty ? -8 : -3;
        totalPenalty += smallPenalty;
        reasons.push(`Lands ${Math.round(buffer)} yds from ${name} - tight margin`);
      }
    }
  }

  if (totalPenalty === 0) {
    return { type: 'distanceHazard', value: 0, reason: null };
  }

  return {
    type: 'distanceHazard',
    value: totalPenalty,
    reason: reasons.join('; '),
  };
}

// ============================================================================
// FAIRWAY WIDTH SCORING
// ============================================================================

/**
 * Calculate bonus/penalty based on fairway width at the landing distance.
 * Rewards landing at wider sections and penalizes narrow sections
 * relative to the player's dispersion.
 *
 * @param {Object} shotOption - Shot option with fairwayWidth and dispersionRadius
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateFairwayWidthBonus(shotOption, config = DEFAULT_SCORING_CONFIG) {
  const { fairwayWidth, dispersionRadius, isApproach } = shotOption;

  if (isApproach || !fairwayWidth || fairwayWidth === 0) {
    return { type: 'fairwayWidth', value: 0, reason: null };
  }

  const dispersionDiameter = (dispersionRadius || 15) * 2;

  // Width-to-dispersion ratio
  const ratio = fairwayWidth / dispersionDiameter;

  if (ratio >= 2.0) {
    // Very wide fairway at landing zone
    return {
      type: 'fairwayWidth',
      value: config.bonuses.wideFairway || 12,
      reason: `Wide fairway (${Math.round(fairwayWidth)} yds) at landing zone`,
    };
  }

  if (ratio < 1.0) {
    // Narrow fairway at landing zone
    return {
      type: 'fairwayWidth',
      value: config.penalties.narrowFairway || -15,
      reason: `Narrow fairway (${Math.round(fairwayWidth)} yds) at landing zone - consider different club`,
    };
  }

  return { type: 'fairwayWidth', value: 0, reason: null };
}

// ============================================================================
// FLIGHT PATH HAZARD PENALTIES
// ============================================================================

/**
 * Calculate penalty for shots that must carry over hazards to reach the landing zone.
 * Trees are impenetrable (massive penalty). Water carry-over is risky and
 * mentally intimidating. Bunker carry-over is minor.
 *
 * @param {Object} shotOption - Shot option with rawDistance and hazardRanges
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateFlightPathPenalty(shotOption, config = DEFAULT_SCORING_CONFIG) {
  const { hazardRanges, rawDistance } = shotOption;

  if (!hazardRanges || hazardRanges.length === 0 || !rawDistance) {
    return { type: 'flightPath', value: 0, reason: null };
  }

  let totalPenalty = 0;
  const reasons = [];

  for (const hazardRange of hazardRanges) {
    const { frontDistance, backDistance, type, name } = hazardRange;

    // Hazard is in the flight path if it sits between the start and landing distance
    // (the ball must fly over it to reach the landing zone)
    // Buffer of 10 yards so we don't penalize hazards right at the landing spot
    // (those are handled by distance overlap penalties)
    if (backDistance < rawDistance - 10 && frontDistance > 0) {
      if (type === 'trees' || type === 'woods') {
        // Trees are impenetrable - can't fly through them
        totalPenalty += config.penalties.treesInFlightPath || -100;
        reasons.push(`Trees block flight path (${frontDistance}-${backDistance} yds)`);
      } else if (type === 'water' || type === 'ob' || type === 'penalty') {
        // Water carry is risky and mentally intimidating
        totalPenalty += config.penalties.carryOverWater || -25;
        reasons.push(`Must carry over ${name} (${frontDistance}-${backDistance} yds)`);
      } else if (type === 'bunker') {
        // Carrying bunkers is minor but still uncomfortable
        totalPenalty += config.penalties.carryOverHazard || -5;
        reasons.push(`Carries over ${name}`);
      }
    }
  }

  if (totalPenalty === 0) {
    return { type: 'flightPath', value: 0, reason: null };
  }

  return {
    type: 'flightPath',
    value: totalPenalty,
    reason: reasons.join('; '),
  };
}

/**
 * Calculate penalty when a landing zone forces the NEXT shot to carry over hazards.
 * For tee shots and layups, check what hazards sit between the landing zone and the green.
 * A landing zone that forces the approach to carry water is a bad plan.
 *
 * @param {Object} shotOption - Shot option with nextShotHazardRanges
 * @param {Object} config - Scoring configuration
 * @returns {Object} { type, value, reason }
 */
export function calculateNextShotOverHazardPenalty(shotOption, config = DEFAULT_SCORING_CONFIG) {
  const { nextShotHazardRanges, distanceRemaining, isApproach } = shotOption;

  // Only applies to non-approach shots (the next shot is what we're evaluating)
  if (isApproach || !nextShotHazardRanges || nextShotHazardRanges.length === 0 || !distanceRemaining) {
    return { type: 'nextShotHazard', value: 0, reason: null };
  }

  let totalPenalty = 0;
  const reasons = [];

  for (const hazardRange of nextShotHazardRanges) {
    const { frontDistance, backDistance, type, name } = hazardRange;

    // Hazard is between landing zone and green if:
    // frontDistance > 0 (it's ahead of the landing zone)
    // backDistance < distanceRemaining (it's before the green)
    // This means the next shot must carry over it
    if (frontDistance > 0 && backDistance < distanceRemaining - 10) {
      if (type === 'trees' || type === 'woods') {
        totalPenalty += config.penalties.nextShotOverTrees || -50;
        reasons.push(`Next shot must clear trees (${name})`);
      } else if (type === 'water' || type === 'ob' || type === 'penalty') {
        totalPenalty += config.penalties.nextShotOverWater || -30;
        reasons.push(`Next shot must carry ${name}`);
      } else if (type === 'bunker') {
        totalPenalty += config.penalties.nextShotOverBunker || -10;
        reasons.push(`Next shot carries over ${name}`);
      }
    }
  }

  if (totalPenalty === 0) {
    return { type: 'nextShotHazard', value: 0, reason: null };
  }

  return {
    type: 'nextShotHazard',
    value: totalPenalty,
    reason: reasons.join('; '),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a position is within a fairway polygon
 *
 * @param {Object} position - { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @returns {boolean} True if position is in fairway
 */
export function isInFairway(position, polygons) {
  if (!position || !polygons) return false;

  const fairwayPolygons = polygons.filter(p => p.type === 'fairway');

  for (const fairway of fairwayPolygons) {
    if (fairway.coordinates && isPointInPolygon(position, fairway)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a club is in the player's strong area
 *
 * @param {string} club - Club identifier
 * @param {string} bestArea - Player's best area
 * @returns {boolean} True if club is in strong area
 */
export function isClubInStrongArea(club, bestArea) {
  if (!bestArea || !club) return false;

  const strongClubs = getStrongClubs(bestArea);
  const normalizedClub = club.toLowerCase().replace(/\s+/g, '_');

  return strongClubs.includes(normalizedClub);
}

/**
 * Check if a club is in the player's weak area
 *
 * @param {string} club - Club identifier
 * @param {string} worstArea - Player's worst area
 * @returns {boolean} True if club is in weak area
 */
export function isClubInWeakArea(club, worstArea) {
  if (!worstArea || !club) return false;

  const weakClubs = getWeakClubs(worstArea);
  const normalizedClub = club.toLowerCase().replace(/\s+/g, '_');

  return weakClubs.includes(normalizedClub);
}

/**
 * Score a complete shot sequence (sum of all shot scores)
 *
 * @param {Array<Object>} shots - Array of shot options
 * @param {Object} playerContext - Player context
 * @param {Object} holeData - Hole data
 * @param {Object} config - Scoring configuration
 * @returns {Object} { totalScore, shotScores }
 */
export function scoreSequence(shots, playerContext, holeData, config = DEFAULT_SCORING_CONFIG) {
  let totalScore = 0;
  const shotScores = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const isApproach = i === shots.length - 1; // Last shot is approach
    const shotWithApproach = { ...shot, isApproach };

    const result = scoreShot(shotWithApproach, playerContext, holeData, config);
    totalScore += result.score;
    shotScores.push({
      shotNumber: shot.shotNumber,
      score: result.score,
      breakdown: result.breakdown,
    });
  }

  return { totalScore, shotScores };
}
