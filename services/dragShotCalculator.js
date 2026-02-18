/**
 * Drag Shot Calculator
 *
 * Calculation service for the draggable shot target feature.
 * Provides three tiers of computation:
 *   Tier 1 (every frame): Distance + binary-search club lookup (<2ms)
 *   Tier 2 (throttled 100ms): Lightweight color assessment (<10ms)
 *   Tier 3 (on release): Full scoring + chain recalculation (30-80ms)
 */

import { calculateDistance, calculateBearing, isPointInPolygon } from '../utils/geoUtils';
import { calculateClubEffectiveReach } from './shotCalculations';
import { computePlayingLikeDistance } from './forwardSequenceGenerator';
import { scoreShot, isInFairway } from './shotScorer';
import { checkHazardConflicts } from './landingZoneCalculator';
import { calculateDispersion } from './dispersionCalculator';
import { DEFAULT_SCORING_CONFIG } from './scoringConfig';
import { formatClubName } from './holePlanEngine';

// ============================================================================
// PRE-COMPUTATION (runs once when plan loads or weather changes)
// ============================================================================

/**
 * Pre-compute sorted club effective reaches for fast binary-search during drag.
 *
 * @param {Object} clubDistances - { clubId: distance, ... }
 * @param {Object} weather - { windSpeed, windDirection, temperature }
 * @param {number} holeBearing - Bearing from tee to green in degrees
 * @returns {Array} Sorted array of { club, clubDistance, effectiveReach, adjustments, displayName }
 */
export function preComputeClubReaches(clubDistances, weather, holeBearing) {
  if (!clubDistances) return [];

  const reaches = Object.entries(clubDistances)
    .filter(([, distance]) => distance > 0)
    .map(([club, distance]) => {
      const reach = calculateClubEffectiveReach(
        distance,
        weather,
        holeBearing,
        null,
        null
      );
      return {
        club,
        clubDistance: distance,
        effectiveReach: reach.effectiveReach,
        adjustments: reach.adjustments,
        displayName: formatClubName(club),
      };
    })
    .sort((a, b) => a.effectiveReach - b.effectiveReach);

  return reaches;
}

/**
 * Pre-compute hazard polygon centroids for fast proximity checks during drag.
 *
 * @param {Array} polygons - Course polygons
 * @returns {Array} Array of { type, centroid, isPenalty }
 */
export function preComputeHazardCentroids(polygons) {
  if (!polygons || polygons.length === 0) return [];

  const hazardTypes = ['water', 'ob', 'bunker', 'penalty', 'waste_area', 'trees'];
  const penaltyTypes = ['water', 'ob', 'penalty'];

  return polygons
    .filter(p => hazardTypes.includes(p.type) && p.coordinates && p.coordinates.length >= 3)
    .map(polygon => {
      let sumLat = 0;
      let sumLon = 0;
      for (const coord of polygon.coordinates) {
        sumLat += coord.latitude;
        sumLon += coord.longitude;
      }
      const count = polygon.coordinates.length;
      return {
        type: polygon.type,
        centroid: {
          latitude: sumLat / count,
          longitude: sumLon / count,
        },
        isPenalty: penaltyTypes.includes(polygon.type),
      };
    });
}

// ============================================================================
// TIER 1: EVERY-FRAME CALCULATIONS (<2ms)
// ============================================================================

/**
 * Binary search to find the best club for a given distance.
 *
 * @param {number} distance - Target distance in yards
 * @param {Array} sortedClubReaches - Pre-sorted array from preComputeClubReaches
 * @returns {Object|null} { club, clubDistance, effectiveReach, gap, displayName } or null
 */
export function findBestClubForDistance(distance, sortedClubReaches) {
  if (!sortedClubReaches || sortedClubReaches.length === 0 || distance <= 0) {
    return null;
  }

  // Binary search for closest effective reach
  let low = 0;
  let high = sortedClubReaches.length - 1;
  let bestIdx = 0;
  let bestGap = Infinity;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const gap = Math.abs(sortedClubReaches[mid].effectiveReach - distance);

    if (gap < bestGap) {
      bestGap = gap;
      bestIdx = mid;
    }

    if (sortedClubReaches[mid].effectiveReach < distance) {
      low = mid + 1;
    } else if (sortedClubReaches[mid].effectiveReach > distance) {
      high = mid - 1;
    } else {
      break; // Exact match
    }
  }

  // Also check neighbors for closest match
  for (const offset of [-1, 1]) {
    const idx = bestIdx + offset;
    if (idx >= 0 && idx < sortedClubReaches.length) {
      const gap = Math.abs(sortedClubReaches[idx].effectiveReach - distance);
      if (gap < bestGap) {
        bestGap = gap;
        bestIdx = idx;
      }
    }
  }

  const best = sortedClubReaches[bestIdx];
  return {
    club: best.club,
    clubDistance: best.clubDistance,
    effectiveReach: best.effectiveReach,
    adjustments: best.adjustments,
    displayName: best.displayName,
    gap: Math.round(bestGap),
  };
}

/**
 * Compute frame-level update for a dragged shot position.
 * Called on every native drag event.
 *
 * @param {Object} newPosition - New GPS position { latitude, longitude }
 * @param {Object} prevPosition - Previous shot or tee position { latitude, longitude }
 * @param {Object} greenPosition - Green center { latitude, longitude }
 * @param {Array} sortedClubReaches - Pre-sorted club array
 * @param {Object} weather - { windSpeed, windDirection, temperature }
 * @returns {Object} { distance, effectiveDistance, distanceToGreen, club, ... }
 */
export function computeDragFrameUpdate(newPosition, prevPosition, greenPosition, sortedClubReaches, weather) {
  const distance = Math.round(calculateDistance(prevPosition, newPosition));
  const distanceToGreen = Math.round(calculateDistance(newPosition, greenPosition));

  const bestClub = findBestClubForDistance(distance, sortedClubReaches);

  // Compute "plays like" using same method as tap marker and decision engine
  const shotBearing = calculateBearing(prevPosition, newPosition);
  const playsLike = computePlayingLikeDistance(distance, weather, shotBearing);

  return {
    distance,
    effectiveDistance: Math.round(playsLike.effectiveDistance),
    distanceToGreen,
    club: bestClub?.club || null,
    clubDistance: bestClub?.clubDistance || 0,
    effectiveReach: bestClub?.effectiveReach || 0,
    displayName: bestClub?.displayName || 'No club',
    gap: bestClub?.gap || 0,
  };
}

// ============================================================================
// TIER 2: THROTTLED COLOR ASSESSMENT (<10ms)
// ============================================================================

/**
 * Lightweight color assessment for real-time drag feedback.
 * Runs on a 100ms throttle during drag.
 *
 * @param {Object} position - Current marker GPS position
 * @param {Object} prevPosition - Previous shot or tee position
 * @param {Object} greenPosition - Green center GPS
 * @param {Array} polygons - Course polygons
 * @param {Array} hazardCentroids - Pre-computed hazard centroids
 * @param {Array} sortedClubReaches - Pre-sorted club array
 * @param {boolean} isApproach - Whether this is the approach shot (last shot)
 * @returns {'green'|'yellow'|'red'} Color assessment
 */
export function assessShotColorLightweight(
  position,
  prevPosition,
  greenPosition,
  polygons,
  hazardCentroids,
  sortedClubReaches,
  isApproach
) {
  if (!position || !prevPosition || !polygons) return 'green';

  const penaltyTypes = ['water', 'ob', 'penalty'];

  // RULE 1: Inside a penalty hazard = RED
  for (const polygon of polygons) {
    if (penaltyTypes.includes(polygon.type) && polygon.coordinates?.length >= 3) {
      if (isPointInPolygon(position, polygon)) return 'red';
    }
  }

  // RULE 2: Inside a bunker = YELLOW
  for (const polygon of polygons) {
    if (polygon.type === 'bunker' && polygon.coordinates?.length >= 3) {
      if (isPointInPolygon(position, polygon)) return 'yellow';
    }
  }

  // RULE 3: No club can reach = RED
  const distance = calculateDistance(prevPosition, position);
  const bestClub = findBestClubForDistance(distance, sortedClubReaches);
  if (!bestClub || bestClub.gap > 20) return 'red';

  // RULE 4: Awkward zone (30-60 yards to green, non-approach) = YELLOW
  if (!isApproach && greenPosition) {
    const distToGreen = calculateDistance(position, greenPosition);
    if (distToGreen >= 30 && distToGreen <= 60) return 'yellow';
  }

  // RULE 5: Near a hazard centroid = YELLOW
  if (hazardCentroids) {
    for (const h of hazardCentroids) {
      const dist = calculateDistance(position, h.centroid);
      if (h.isPenalty && dist < 15) return 'yellow';
      if (h.type === 'bunker' && dist < 8) return 'yellow';
    }
  }

  // RULE 6: Not in fairway (non-approach) = YELLOW
  if (!isApproach) {
    if (!isInFairway(position, polygons)) return 'yellow';
  }

  return 'green';
}

// ============================================================================
// TIER 3: FULL CALCULATIONS ON RELEASE (30-80ms)
// ============================================================================

/**
 * Full color assessment using the scoring system.
 * Runs once when the user releases a dragged target.
 *
 * @param {Object} shotOption - Full shot option object for scoreShot()
 * @param {Object} playerContext - Player context
 * @param {Object} holeData - { polygons, greenDepth }
 * @param {Object} config - Scoring configuration
 * @returns {'green'|'yellow'|'red'} Color assessment
 */
export function assessShotColorFull(shotOption, playerContext, holeData, config = DEFAULT_SCORING_CONFIG) {
  try {
    const { score, breakdown } = scoreShot(shotOption, playerContext, holeData, config);

    // Check for critical penalties (immediate red)
    const hasCriticalPenalty = breakdown.penalties.some(p =>
      (p.type === 'hazard' && p.value <= -30) ||
      (p.type === 'flightPath' && p.value <= -50)
    );

    if (hasCriticalPenalty) return 'red';
    if (score < -20) return 'red';
    if (score < 0) return 'yellow';
    return 'green';
  } catch (e) {
    // If scoring fails, fall back to lightweight assessment
    console.warn('[DragCalc] Full color assessment failed:', e.message);
    return 'yellow';
  }
}

/**
 * Recalculate downstream shots after a drag. Downstream positions stay fixed,
 * only distances and clubs update.
 *
 * @param {Array} shots - The full editedShots array
 * @param {number} fromIndex - Index of the shot that was dragged
 * @param {Object} teeBox - Tee box GPS position
 * @param {Object} green - Green center GPS position
 * @param {Array} sortedClubReaches - Pre-sorted club array
 * @returns {Array} Updated shots array (mutates and returns same reference for efficiency)
 */
export function recalculateDownstreamShots(shots, fromIndex, teeBox, green, sortedClubReaches, weather) {
  if (!shots || shots.length === 0) return shots;

  for (let i = fromIndex; i < shots.length; i++) {
    const shot = shots[i];
    if (!shot?.landingZone) continue;

    // Determine previous position
    const prevPosition = i === 0
      ? teeBox
      : shots[i - 1]?.landingZone;

    if (!prevPosition) continue;

    // Recalculate distance from previous position to this shot's (fixed) landing zone
    const newDistance = Math.round(calculateDistance(prevPosition, shot.landingZone));

    // Find best club for new distance
    const bestClub = findBestClubForDistance(newDistance, sortedClubReaches);

    // Calculate distance to green
    const distToGreen = Math.round(calculateDistance(shot.landingZone, green));

    // Compute "plays like" using same method as tap marker and decision engine
    const shotBearing = calculateBearing(prevPosition, shot.landingZone);
    const playsLike = computePlayingLikeDistance(newDistance, weather, shotBearing);

    // Update shot data
    shot.distance = newDistance;
    shot.club = bestClub?.displayName || 'No club';
    shot.clubDistance = bestClub?.clubDistance || 0;
    shot.effectiveDistance = Math.round(playsLike.effectiveDistance);
    shot.adjustments = {
      ...(bestClub?.adjustments || {}),
      windDetail: playsLike.adjustments?.wind || null,
      temperatureDetail: playsLike.adjustments?.temperature || null,
      elevationDetail: playsLike.adjustments?.elevation || null,
    };
    shot.distanceRemaining = distToGreen;
  }

  return shots;
}

/**
 * Full shot update after drag release. Recalculates the dragged shot and all
 * downstream shots, then computes colors for every shot.
 *
 * @param {Array} editedShots - Current edited shots array
 * @param {number} draggedIndex - Index of the shot that was dragged
 * @param {Object} holeData - { par, teeBox, green, polygons }
 * @param {Object} playerContext - { clubDistances, handicap, bestArea, worstArea }
 * @param {Object} weather - Weather data
 * @param {Object} config - Scoring configuration
 * @param {Array} sortedClubReaches - Pre-sorted club array
 * @returns {{ updatedShots: Array, colors: Array<string> }}
 */
export function computeFullShotUpdate(
  editedShots,
  draggedIndex,
  holeData,
  playerContext,
  weather,
  config,
  sortedClubReaches
) {
  if (!editedShots || editedShots.length === 0) {
    return { updatedShots: editedShots, colors: [] };
  }

  const { teeBox, green, polygons } = holeData;

  // Deep copy to avoid mutation issues
  const updatedShots = JSON.parse(JSON.stringify(editedShots));

  // Recalculate distances, clubs, and plays-like from the dragged index onward
  recalculateDownstreamShots(updatedShots, draggedIndex, teeBox, green, sortedClubReaches, weather);

  // Compute colors for all shots
  const colors = updatedShots.map((shot, index) => {
    if (!shot?.landingZone) return 'green';

    const prevPosition = index === 0 ? teeBox : updatedShots[index - 1]?.landingZone;
    if (!prevPosition) return 'green';

    const isApproach = index === updatedShots.length - 1;
    const distance = calculateDistance(prevPosition, shot.landingZone);
    const handicap = playerContext?.handicap || 15;
    const bestClub = findBestClubForDistance(distance, sortedClubReaches);

    // Build a shot option for full scoring
    const dispersion = bestClub?.club
      ? calculateDispersion(bestClub.club, playerContext?.clubDistances || {}, handicap)
      : { radius: 15 };

    const hazardCheck = checkHazardConflicts(shot.landingZone, polygons || [], dispersion.radius);

    const shotOption = {
      shotNumber: shot.shotNumber,
      club: bestClub?.club || 'unknown',
      clubDistance: bestClub?.clubDistance || 0,
      rawDistance: bestClub?.effectiveReach || distance,
      effectiveDistance: bestClub?.clubDistance || 0,
      targetDistance: distance,
      distanceRemaining: calculateDistance(shot.landingZone, green),
      landingZone: shot.landingZone,
      dispersionRadius: dispersion.radius,
      hazardConflicts: hazardCheck.conflicts?.map(c => ({
        type: c.hazard?.type,
        name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
        overlapPercentage: c.type === 'inside' ? 100 : 50,
      })) || [],
      isApproach,
    };

    return assessShotColorFull(
      shotOption,
      playerContext,
      { polygons: polygons || [], greenDepth: 30 },
      config || DEFAULT_SCORING_CONFIG
    );
  });

  return { updatedShots, colors };
}
