/**
 * Landing Zone Calculator
 *
 * GPS-based spatial calculations for determining optimal landing zones.
 * Handles hazard avoidance, safe zone calculation, and point projection.
 */

import { calculateDistance, calculateBearing, isPointInPolygon } from '../utils/geoUtils';
import { HAZARD_SEVERITY } from './scoringConfig';

// ============================================================================
// POINT PROJECTION
// ============================================================================

/**
 * Project a point from origin at given distance and bearing
 * Uses spherical Earth model for GPS coordinate calculation
 *
 * @param {Object} origin - Starting position { latitude, longitude }
 * @param {number} distanceYards - Distance in yards
 * @param {number} bearingDegrees - Bearing in degrees (0 = North, 90 = East)
 * @returns {Object} New position { latitude, longitude }
 */
export function projectPoint(origin, distanceYards, bearingDegrees) {
  const R = 6371e3; // Earth radius in meters
  const d = distanceYards * 0.9144; // Convert yards to meters
  const brng = bearingDegrees * Math.PI / 180;

  const lat1 = origin.latitude * Math.PI / 180;
  const lon1 = origin.longitude * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) +
    Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    latitude: lat2 * 180 / Math.PI,
    longitude: lon2 * 180 / Math.PI,
  };
}

/**
 * Offset a position laterally (perpendicular to a bearing)
 *
 * @param {Object} position - Position to offset { latitude, longitude }
 * @param {number} offsetYards - Distance to offset in yards (positive = right, negative = left)
 * @param {number} shotBearing - The bearing of the shot (to determine perpendicular)
 * @returns {Object} Offset position { latitude, longitude }
 */
export function offsetPositionLaterally(position, offsetYards, shotBearing) {
  // Perpendicular bearing: +90 for right, -90 for left
  const perpendicularBearing = offsetYards >= 0
    ? (shotBearing + 90) % 360
    : (shotBearing - 90 + 360) % 360;

  return projectPoint(position, Math.abs(offsetYards), perpendicularBearing);
}

// ============================================================================
// HAZARD CONFLICT DETECTION
// ============================================================================

/**
 * Check if a position conflicts with any hazards
 *
 * @param {Object} position - Position to check { latitude, longitude }
 * @param {Array} polygons - Array of course polygons with type and coordinates
 * @param {number} dispersionRadius - Player's dispersion radius in yards (default 15)
 * @returns {Object} { conflicts: Array, safe: boolean }
 */
export function checkHazardConflicts(position, polygons, dispersionRadius = 15) {
  if (!polygons || polygons.length === 0) {
    return { conflicts: [], safe: true };
  }

  const hazardTypes = ['bunker', 'water', 'ob', 'penalty', 'waste_area'];
  const hazards = polygons.filter(p => hazardTypes.includes(p.type));

  const conflicts = [];

  for (const hazard of hazards) {
    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      continue;
    }

    // Check if position is inside hazard
    if (isPointInPolygon(position, hazard)) {
      conflicts.push({
        hazard,
        type: 'inside',
        severity: hazard.type === 'water' ? 'critical' : 'high',
        distanceToEdge: 0,
      });
      continue;
    }

    // Check if dispersion radius overlaps hazard
    const distToHazard = findMinDistanceToPolygon(position, hazard);
    if (distToHazard < dispersionRadius) {
      conflicts.push({
        hazard,
        type: 'dispersion_overlap',
        severity: distToHazard < dispersionRadius / 2 ? 'high' : 'medium',
        distanceToEdge: distToHazard,
      });
    }
  }

  return { conflicts, safe: conflicts.length === 0 };
}

/**
 * Find minimum distance from a point to any vertex of a polygon
 * (Simplified - for full accuracy would need edge distance calculation)
 *
 * @param {Object} point - Point to measure from { latitude, longitude }
 * @param {Object} polygon - Polygon with coordinates array
 * @returns {number} Minimum distance in yards
 */
export function findMinDistanceToPolygon(point, polygon) {
  if (!polygon.coordinates || polygon.coordinates.length === 0) {
    return Infinity;
  }

  let minDist = Infinity;

  for (const vertex of polygon.coordinates) {
    const dist = calculateDistance(point, vertex);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  // Also check distance to edges (line segments between vertices)
  for (let i = 0; i < polygon.coordinates.length; i++) {
    const p1 = polygon.coordinates[i];
    const p2 = polygon.coordinates[(i + 1) % polygon.coordinates.length];
    const edgeDist = distanceToLineSegment(point, p1, p2);
    if (edgeDist < minDist) {
      minDist = edgeDist;
    }
  }

  return minDist;
}

/**
 * Calculate distance from point to line segment
 *
 * @param {Object} point - Point { latitude, longitude }
 * @param {Object} lineStart - Line segment start { latitude, longitude }
 * @param {Object} lineEnd - Line segment end { latitude, longitude }
 * @returns {number} Distance in yards
 */
function distanceToLineSegment(point, lineStart, lineEnd) {
  const A = point.latitude - lineStart.latitude;
  const B = point.longitude - lineStart.longitude;
  const C = lineEnd.latitude - lineStart.latitude;
  const D = lineEnd.longitude - lineStart.longitude;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.latitude;
    yy = lineStart.longitude;
  } else if (param > 1) {
    xx = lineEnd.latitude;
    yy = lineEnd.longitude;
  } else {
    xx = lineStart.latitude + param * C;
    yy = lineStart.longitude + param * D;
  }

  return calculateDistance(point, { latitude: xx, longitude: yy });
}

// ============================================================================
// LANDING ZONE CALCULATION
// ============================================================================

/**
 * Calculate optimal landing zone at a given distance from target
 * Automatically adjusts to avoid hazards
 *
 * @param {Object} target - Target position (e.g., green center) { latitude, longitude }
 * @param {number} distance - Desired distance from target in yards
 * @param {number} bearing - Bearing from target to landing zone (typically toward tee)
 * @param {Array} polygons - Course polygons for hazard detection
 * @param {number} dispersionRadius - Player's dispersion radius
 * @returns {Object} Landing zone { position, description, isOptimal, adjustment }
 */
export function calculateLandingZone(target, distance, bearing, polygons, dispersionRadius = 15) {
  // Defensive check for missing target
  if (!target || !target.latitude || !target.longitude) {
    return {
      position: { latitude: 0, longitude: 0 },
      description: 'Landing zone',
      isOptimal: false,
      adjustment: null,
    };
  }

  // Calculate initial position at specified distance from target
  const initialPosition = projectPoint(target, distance || 0, bearing || 0);

  // Check for hazard conflicts
  const hazardCheck = checkHazardConflicts(initialPosition, polygons, dispersionRadius);

  if (hazardCheck.safe) {
    return {
      position: initialPosition,
      description: generateZoneDescription(initialPosition, target, distance, polygons),
      isOptimal: true,
      adjustment: null,
    };
  }

  // Try to find safe alternative
  return findSafeAlternative(initialPosition, target, bearing, hazardCheck, polygons, dispersionRadius);
}

/**
 * Find a safe alternative landing zone by adjusting laterally or distance
 *
 * @param {Object} position - Original position that has conflicts
 * @param {Object} target - Target position
 * @param {number} bearing - Original bearing
 * @param {Object} hazardCheck - Result from checkHazardConflicts
 * @param {Array} polygons - Course polygons
 * @param {number} dispersionRadius - Player's dispersion radius
 * @returns {Object} Safe landing zone or best available option
 */
export function findSafeAlternative(position, target, bearing, hazardCheck, polygons, dispersionRadius) {
  const distance = calculateDistance(target, position);

  // Try lateral adjustments first (prefer staying same distance)
  const lateralOffsets = [15, 25, 35, -15, -25, -35]; // yards left/right

  for (const offset of lateralOffsets) {
    const adjustedPosition = offsetPositionLaterally(position, offset, bearing);
    const check = checkHazardConflicts(adjustedPosition, polygons, dispersionRadius);

    if (check.safe) {
      return {
        position: adjustedPosition,
        description: generateZoneDescription(adjustedPosition, target, distance, polygons),
        isOptimal: false,
        adjustment: {
          type: 'lateral',
          direction: offset > 0 ? 'right' : 'left',
          amount: Math.abs(offset),
        },
      };
    }
  }

  // Try distance adjustments (shorter is safer for layups)
  const distanceOffsets = [-10, -20, 10, 20]; // yards shorter/longer

  for (const offset of distanceOffsets) {
    const adjustedPosition = projectPoint(target, distance + offset, bearing);
    const check = checkHazardConflicts(adjustedPosition, polygons, dispersionRadius);

    if (check.safe) {
      return {
        position: adjustedPosition,
        description: generateZoneDescription(adjustedPosition, target, distance + offset, polygons),
        isOptimal: false,
        adjustment: {
          type: 'distance',
          direction: offset > 0 ? 'longer' : 'shorter',
          amount: Math.abs(offset),
        },
      };
    }
  }

  // If no safe option found, return original with warning
  return {
    position,
    description: generateZoneDescription(position, target, distance, polygons),
    isOptimal: false,
    hasRisk: true,
    mainThreat: hazardCheck.conflicts[0]?.hazard?.type || 'hazard',
    adjustment: null,
  };
}

/**
 * Generate human-readable description of a landing zone
 *
 * @param {Object} position - Landing zone position
 * @param {Object} target - Target (typically green)
 * @param {number} distanceFromTarget - Distance from target in yards
 * @param {Array} polygons - Course polygons
 * @returns {string} Description
 */
function generateZoneDescription(position, target, distanceFromTarget, polygons) {
  // Check what type of ground the position is on
  const fairwayPolygon = polygons?.find(p => p.type === 'fairway');
  const inFairway = fairwayPolygon ? isPointInPolygon(position, fairwayPolygon) : true;

  // Determine position relative to hole center line
  const bearing = calculateBearing(target, position);
  const holeBearing = calculateBearing(target, { latitude: target.latitude + 0.01, longitude: target.longitude }); // Approximate
  const relativeBearing = (bearing - holeBearing + 360) % 360;

  let sideDescription = 'center';
  if (relativeBearing > 30 && relativeBearing < 150) {
    sideDescription = 'right side';
  } else if (relativeBearing > 210 && relativeBearing < 330) {
    sideDescription = 'left side';
  }

  const surface = inFairway ? 'fairway' : 'rough';

  return `${sideDescription} of ${surface}, ${Math.round(distanceFromTarget)} yards out`;
}

// ============================================================================
// SAFE ZONE CALCULATION
// ============================================================================

/**
 * Calculate the safe miss zone for an approach shot
 * Determines which side of the target is safer for missing
 *
 * @param {Object} target - Target position (green center)
 * @param {number} dispersion - Player's dispersion radius
 * @param {Array} polygons - Course polygons
 * @param {Object} pinPosition - Optional pin position for short-siding analysis
 * @returns {Object} Safe zone { position, direction, description }
 */
export function calculateSafeZone(target, dispersion, polygons, pinPosition = null) {
  // Defensive check for missing target
  if (!target || !target.latitude || !target.longitude) {
    return {
      position: { latitude: 0, longitude: 0 },
      direction: 'center',
      lateralSpace: 50,
      shortSpace: 50,
      longSpace: 50,
      description: 'Safe zone',
      shortSideWarning: null,
    };
  }

  const hazardTypes = ['bunker', 'water', 'ob', 'penalty'];
  const hazards = polygons?.filter(p => hazardTypes.includes(p.type)) || [];

  // Check space on each side
  const leftSpace = calculateSpaceToHazard(target, 'left', hazards);
  const rightSpace = calculateSpaceToHazard(target, 'right', hazards);
  const shortSpace = calculateSpaceToHazard(target, 'short', hazards);
  const longSpace = calculateSpaceToHazard(target, 'long', hazards);

  // Determine safest direction for lateral miss
  let safeSide = leftSpace > rightSpace ? 'left' : 'right';
  let safeOffset = Math.min(dispersion || 15, Math.max(leftSpace, rightSpace));

  // Check for short-siding risk
  let shortSideWarning = null;
  if (pinPosition && pinPosition.latitude && pinPosition.longitude) {
    // If pin is on one side, prefer missing on the other
    const pinBearing = calculateBearing(target, pinPosition);
    if (pinBearing > 0 && pinBearing < 180) {
      shortSideWarning = 'Avoid missing right - that short-sides you';
      safeSide = 'left';
    } else {
      shortSideWarning = 'Avoid missing left - that short-sides you';
      safeSide = 'right';
    }
  }

  // Calculate safe zone position
  const safePosition = offsetPositionLaterally(
    target,
    safeSide === 'left' ? -safeOffset / 2 : safeOffset / 2,
    0 // Bearing from approach direction
  );

  return {
    position: safePosition || target, // Fallback to target if offset fails
    direction: safeSide,
    lateralSpace: Math.max(leftSpace, rightSpace),
    shortSpace,
    longSpace,
    description: `Favor ${safeSide} side, avoid short-siding`,
    shortSideWarning,
  };
}

/**
 * Calculate space from target to nearest hazard in a direction
 *
 * @param {Object} target - Target position
 * @param {string} direction - 'left', 'right', 'short', or 'long'
 * @param {Array} hazards - Array of hazard polygons
 * @returns {number} Distance in yards to nearest hazard in that direction
 */
function calculateSpaceToHazard(target, direction, hazards) {
  if (!hazards || hazards.length === 0) {
    return 50; // Default safe space if no hazards
  }

  let minDistance = 100; // Max check distance

  // Determine bearing range for direction
  let bearingMin, bearingMax;
  switch (direction) {
    case 'left':
      bearingMin = 225;
      bearingMax = 315;
      break;
    case 'right':
      bearingMin = 45;
      bearingMax = 135;
      break;
    case 'short':
      bearingMin = 135;
      bearingMax = 225;
      break;
    case 'long':
      bearingMin = 315;
      bearingMax = 45;
      break;
    default:
      return 50;
  }

  for (const hazard of hazards) {
    if (!hazard.coordinates) continue;

    for (const vertex of hazard.coordinates) {
      const dist = calculateDistance(target, vertex);
      const bearing = calculateBearing(target, vertex);

      // Check if this vertex is in the specified direction
      let inDirection = false;
      if (direction === 'long') {
        inDirection = bearing > bearingMin || bearing < bearingMax;
      } else {
        inDirection = bearing >= bearingMin && bearing <= bearingMax;
      }

      if (inDirection && dist < minDistance) {
        minDistance = dist;
      }
    }
  }

  return minDistance;
}

// ============================================================================
// AVOID ZONE EXTRACTION
// ============================================================================

/**
 * Get avoid zones (hazards) relevant to a shot
 *
 * @param {Object} fromPosition - Starting position for shot
 * @param {Object} toPosition - Target position for shot
 * @param {Array} polygons - Course polygons
 * @param {number} corridorWidth - Width of shot corridor in yards (default 40)
 * @returns {Array} Relevant hazards with direction and distance info
 */
export function getAvoidZones(fromPosition, toPosition, polygons, corridorWidth = 40) {
  if (!polygons || polygons.length === 0) {
    return [];
  }

  const hazardTypes = ['bunker', 'water', 'ob', 'penalty', 'waste_area'];
  const hazards = polygons.filter(p => hazardTypes.includes(p.type));
  const shotBearing = calculateBearing(fromPosition, toPosition);
  const shotDistance = calculateDistance(fromPosition, toPosition);

  const avoidZones = [];

  for (const hazard of hazards) {
    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      continue;
    }

    // Calculate centroid of hazard
    const centroid = calculateCentroid(hazard.coordinates);
    const hazardDistance = calculateDistance(fromPosition, centroid);
    const hazardBearing = calculateBearing(fromPosition, centroid);

    // Skip hazards beyond the shot distance (with buffer)
    if (hazardDistance > shotDistance + 30) {
      continue;
    }

    // Calculate lateral offset from shot line
    const bearingDiff = hazardBearing - shotBearing;
    const normalizedDiff = ((bearingDiff + 180) % 360) - 180;
    const lateralOffset = hazardDistance * Math.sin(normalizedDiff * Math.PI / 180);

    // Skip hazards outside corridor
    if (Math.abs(lateralOffset) > corridorWidth) {
      continue;
    }

    // Determine direction
    let direction;
    if (hazardDistance < shotDistance * 0.3) {
      direction = 'short';
    } else if (hazardDistance > shotDistance * 0.9) {
      direction = 'long';
    } else {
      direction = lateralOffset > 0 ? 'right' : 'left';
    }

    avoidZones.push({
      type: hazard.type,
      name: hazard.label || hazard.name || `${hazard.type}`,
      direction,
      distanceToEdge: Math.round(findMinDistanceToPolygon(fromPosition, hazard)),
      distanceFromPlayer: Math.round(hazardDistance),
      lateralOffset: Math.round(Math.abs(lateralOffset)),
    });
  }

  // Sort by threat level (closer = more threatening)
  return avoidZones.sort((a, b) => a.distanceFromPlayer - b.distanceFromPlayer);
}

// ============================================================================
// HAZARD-BIASED TARGETING
// ============================================================================

/**
 * Shift a target position laterally away from nearby hazards.
 * Penalty hazards (water/OB) push the target away 2.5x more aggressively
 * than non-penalty hazards (bunkers/woods).
 *
 * @param {Object} targetPosition - Initial target { latitude, longitude }
 * @param {Object} startPosition - Shot origin { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @param {number} dispersionRadius - Player's dispersion radius in yards
 * @returns {Object} Biased target position { latitude, longitude }
 */
export function applyHazardBiasToTarget(targetPosition, startPosition, polygons, dispersionRadius) {
  if (!targetPosition || !startPosition || !polygons || polygons.length === 0) {
    return targetPosition;
  }

  const hazardTypes = ['water', 'ob', 'bunker', 'penalty', 'waste_area', 'trees'];
  const hazards = polygons.filter(p => hazardTypes.includes(p.type));

  if (hazards.length === 0) {
    return targetPosition;
  }

  const shotBearing = calculateBearing(startPosition, targetPosition);
  const influenceRadius = dispersionRadius * 2;

  let totalBiasYards = 0; // positive = push right, negative = push left

  for (const hazard of hazards) {
    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      continue;
    }

    const distToHazard = findMinDistanceToPolygon(targetPosition, hazard);

    // Only consider hazards within influence radius
    if (distToHazard > influenceRadius) {
      continue;
    }

    // Determine which side the hazard is on (left or right of shot line)
    const centroid = calculateCentroid(hazard.coordinates);
    if (!centroid) continue;

    const hazardBearing = calculateBearing(targetPosition, centroid);
    const bearingDiff = ((hazardBearing - shotBearing + 180 + 360) % 360) - 180;
    const isRight = bearingDiff > 0 && bearingDiff < 180;

    // Weight by severity
    const severity = HAZARD_SEVERITY[hazard.type] || 10;
    const isPenalty = ['water', 'ob', 'penalty'].includes(hazard.type);

    // Closer hazards = stronger bias away
    const proximityFactor = 1 - (distToHazard / influenceRadius);
    const biasStrength = severity * proximityFactor * (isPenalty ? 2.5 : 1.0);

    // Push AWAY from hazard
    if (isRight) {
      totalBiasYards -= biasStrength * 0.3; // Push left
    } else {
      totalBiasYards += biasStrength * 0.3; // Push right
    }
  }

  // Cap bias at 20 yards
  totalBiasYards = Math.max(-20, Math.min(20, totalBiasYards));

  if (Math.abs(totalBiasYards) < 3) {
    return targetPosition; // Bias too small to matter
  }

  // Apply lateral offset
  const biasedPosition = offsetPositionLaterally(targetPosition, totalBiasYards, shotBearing);

  // Verify biased position is still in fairway
  if (isInFairwayLocal(biasedPosition, polygons)) {
    return biasedPosition;
  }

  // Try half bias
  const halfBiased = offsetPositionLaterally(targetPosition, totalBiasYards / 2, shotBearing);
  if (isInFairwayLocal(halfBiased, polygons)) {
    return halfBiased;
  }

  return targetPosition; // Fall back to unbiased center
}

/**
 * Quick fairway check helper (avoids circular export issues with isInFairway)
 */
function isInFairwayLocal(position, polygons) {
  if (!position || !polygons) return false;
  const fairwayPolygons = polygons.filter(p => p.type === 'fairway');
  for (const fairway of fairwayPolygons) {
    if (fairway.coordinates && isPointInPolygon(position, fairway)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// GREEN APPROACH TARGETING
// ============================================================================

/**
 * Calculate a safe target on the green that avoids carrying over hazards.
 *
 * Shifts the green target away from nearby hazards (greenside bunkers, water, etc.)
 * and away from hazards in the flight path. Penalty hazards (water/OB) cause
 * a stronger bias than non-penalty hazards (bunkers).
 *
 * @param {Object} green - Green center { latitude, longitude }
 * @param {Object} startPosition - Where the approach is hit from { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @param {number} dispersionRadius - Player's dispersion radius for the approach club
 * @returns {Object} Biased green target { latitude, longitude, elevation }
 */
export function calculateSafeGreenTarget(green, startPosition, polygons, dispersionRadius) {
  if (!green || !startPosition || !polygons || polygons.length === 0) {
    return green;
  }

  const hazardTypes = ['water', 'ob', 'bunker', 'penalty', 'waste_area', 'trees'];
  const hazards = polygons.filter(p => hazardTypes.includes(p.type));

  if (hazards.length === 0) {
    return green;
  }

  const shotBearing = calculateBearing(startPosition, green);

  // Consider hazards within 30 yards of green center (greenside hazards)
  const greenInfluenceRadius = 30;

  let lateralBiasYards = 0; // positive = push right, negative = push left
  let depthBiasYards = 0;   // positive = push deeper (away from front), negative = push shorter

  for (const hazard of hazards) {
    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      continue;
    }

    const distToHazard = findMinDistanceToPolygon(green, hazard);

    // Only consider hazards close to the green
    if (distToHazard > greenInfluenceRadius) {
      continue;
    }

    const centroid = calculateCentroid(hazard.coordinates);
    if (!centroid) continue;

    const severity = HAZARD_SEVERITY[hazard.type] || 10;
    const isPenalty = ['water', 'ob', 'penalty'].includes(hazard.type);
    const severityMultiplier = isPenalty ? 2.5 : 1.0;

    // Proximity factor: closer hazards push harder
    const proximityFactor = 1 - (distToHazard / greenInfluenceRadius);

    // Determine hazard position relative to green from approach direction
    const hazardBearing = calculateBearing(green, centroid);

    // Lateral component (left/right of shot line)
    const lateralDiff = ((hazardBearing - shotBearing + 180 + 360) % 360) - 180;
    const isRight = lateralDiff > 0 && lateralDiff < 180;
    const lateralStrength = severity * proximityFactor * severityMultiplier * Math.abs(Math.sin(lateralDiff * Math.PI / 180));

    if (isRight) {
      lateralBiasYards -= lateralStrength * 0.2; // Push left
    } else {
      lateralBiasYards += lateralStrength * 0.2; // Push right
    }

    // Depth component (front/back relative to shot direction)
    // If hazard is in front of green (between player and green), aim deeper
    // If hazard is behind green, aim shorter
    const depthComponent = Math.cos(lateralDiff * Math.PI / 180);
    const isFront = depthComponent < 0; // Hazard is on the approach side
    const depthStrength = severity * proximityFactor * severityMultiplier * Math.abs(depthComponent);

    if (isFront) {
      depthBiasYards += depthStrength * 0.15; // Aim deeper (past the hazard)
    } else {
      depthBiasYards -= depthStrength * 0.15; // Aim shorter (away from back hazard)
    }
  }

  // Cap biases for green targeting (greens are small, ~30 yds across)
  lateralBiasYards = Math.max(-10, Math.min(10, lateralBiasYards));
  depthBiasYards = Math.max(-8, Math.min(8, depthBiasYards));

  if (Math.abs(lateralBiasYards) < 2 && Math.abs(depthBiasYards) < 2) {
    return green; // Bias too small to matter
  }

  // Apply lateral offset
  let biasedGreen = green;
  if (Math.abs(lateralBiasYards) >= 2) {
    biasedGreen = offsetPositionLaterally(biasedGreen, lateralBiasYards, shotBearing);
  }

  // Apply depth offset (along shot bearing)
  if (Math.abs(depthBiasYards) >= 2) {
    biasedGreen = projectPoint(biasedGreen, depthBiasYards, shotBearing);
  }

  // Preserve original elevation
  biasedGreen = {
    ...biasedGreen,
    elevation: green.elevation,
  };

  return biasedGreen;
}

// ============================================================================
// DISTANCE-BASED HAZARD ANALYSIS
// ============================================================================

/**
 * Analyze hazards along the shot corridor and return their distance ranges.
 * Used to determine whether a club's landing distance overlaps with a hazard.
 *
 * @param {Object} startPosition - Shot origin { latitude, longitude }
 * @param {Object} green - Green center { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @param {number} corridorWidth - Width of shot corridor in yards (default 40)
 * @returns {Array} Sorted array of hazard distance ranges:
 *   [{ type, name, frontDistance, backDistance, isPenalty, severity }]
 */
export function analyzeHazardsAlongShotLine(startPosition, green, polygons, corridorWidth = 40) {
  if (!startPosition || !green || !polygons || polygons.length === 0) {
    return [];
  }

  const shotBearing = calculateBearing(startPosition, green);
  const hazardTypes = ['bunker', 'water', 'ob', 'penalty', 'waste_area'];
  const hazards = polygons.filter(p => hazardTypes.includes(p.type));

  const hazardRanges = [];

  for (const hazard of hazards) {
    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      continue;
    }

    // Calculate distances and lateral offsets of all hazard vertices from start
    const inCorridor = [];
    for (const vertex of hazard.coordinates) {
      const distance = calculateDistance(startPosition, vertex);
      const bearing = calculateBearing(startPosition, vertex);

      // Calculate lateral offset from shot line
      const bearingDiff = ((bearing - shotBearing + 180 + 360) % 360) - 180;
      const lateralOffset = distance * Math.sin(bearingDiff * Math.PI / 180);

      if (Math.abs(lateralOffset) <= corridorWidth) {
        inCorridor.push(distance);
      }
    }

    if (inCorridor.length === 0) {
      continue;
    }

    const frontDistance = Math.min(...inCorridor);
    const backDistance = Math.max(...inCorridor);
    const isPenalty = ['water', 'ob', 'penalty'].includes(hazard.type);
    const severity = HAZARD_SEVERITY[hazard.type] || 10;

    hazardRanges.push({
      type: hazard.type,
      name: hazard.label || hazard.name || hazard.type,
      frontDistance: Math.round(frontDistance),
      backDistance: Math.round(backDistance),
      isPenalty,
      severity,
    });
  }

  // Sort by front distance (closest first)
  return hazardRanges.sort((a, b) => a.frontDistance - b.frontDistance);
}

/**
 * Calculate centroid of a polygon
 */
function calculateCentroid(coordinates) {
  if (!coordinates || coordinates.length === 0) return null;

  let sumLat = 0;
  let sumLon = 0;

  for (const coord of coordinates) {
    sumLat += coord.latitude;
    sumLon += coord.longitude;
  }

  return {
    latitude: sumLat / coordinates.length,
    longitude: sumLon / coordinates.length,
  };
}

// ============================================================================
// FAIRWAY DETECTION
// ============================================================================

/**
 * Check if a position is within a fairway polygon
 *
 * @param {Object} position - Position to check { latitude, longitude }
 * @param {Array} polygons - Array of course polygons
 * @returns {boolean} True if position is in fairway
 */
export function isInFairway(position, polygons) {
  if (!position || !polygons || polygons.length === 0) {
    return false;
  }

  const fairwayPolygons = polygons.filter(p => p.type === 'fairway');

  for (const fairway of fairwayPolygons) {
    if (fairway.coordinates && isPointInPolygon(position, fairway)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate hazard overlap percentage for a landing zone
 *
 * This estimates what percentage of the player's dispersion circle
 * overlaps with hazards. Used for scoring hazard proximity penalties.
 *
 * @param {Object} landingPosition - Landing zone { latitude, longitude }
 * @param {number} dispersionRadius - Player's dispersion radius in yards
 * @param {Array} hazards - Array of hazard polygons
 * @param {number} shotBearing - Shot bearing (optional, for directional weighting)
 * @returns {Object} { overlapPercentage, conflictingHazards }
 */
export function calculateHazardOverlap(landingPosition, dispersionRadius, hazards, shotBearing = 0) {
  if (!landingPosition || !hazards || hazards.length === 0) {
    return { overlapPercentage: 0, conflictingHazards: [] };
  }

  const hazardTypes = ['bunker', 'water', 'ob', 'penalty', 'waste_area'];
  const relevantHazards = hazards.filter(h => hazardTypes.includes(h.type));

  const conflictingHazards = [];
  let totalOverlap = 0;

  for (const hazard of relevantHazards) {
    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      continue;
    }

    // Check if landing position is inside hazard
    if (isPointInPolygon(landingPosition, hazard)) {
      conflictingHazards.push({
        type: hazard.type,
        name: hazard.label || hazard.name || hazard.type,
        overlapPercentage: 100,
        severity: hazard.type === 'water' || hazard.type === 'ob' ? 'critical' : 'high',
      });
      totalOverlap = Math.max(totalOverlap, 100);
      continue;
    }

    // Check distance to hazard edge
    const distToHazard = findMinDistanceToPolygon(landingPosition, hazard);

    if (distToHazard < dispersionRadius) {
      // Calculate overlap percentage based on how much of dispersion is in hazard
      // Simple approximation: linear scaling based on distance
      const overlapPct = Math.round((1 - distToHazard / dispersionRadius) * 100);

      if (overlapPct > 0) {
        conflictingHazards.push({
          type: hazard.type,
          name: hazard.label || hazard.name || hazard.type,
          overlapPercentage: overlapPct,
          distanceToEdge: Math.round(distToHazard),
          severity: overlapPct > 50 ? 'high' : 'medium',
        });
        totalOverlap = Math.max(totalOverlap, overlapPct);
      }
    }
  }

  return {
    overlapPercentage: totalOverlap,
    conflictingHazards,
  };
}
