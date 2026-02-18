/**
 * Shot Calculations Service
 *
 * Pre-computes adjustments that should NOT be left to the AI:
 * - Wind adjustments (distance and aim)
 * - Temperature adjustments
 * - Elevation adjustments
 * - Hazard relevance filtering
 * - Awkward distance detection
 * - Club selection matching
 *
 * These calculations are deterministic and should be done in app logic,
 * freeing the AI to focus on strategy rather than math.
 */

import { calculateDistance, calculateBearing, isPointInPolygon } from '../utils/geoUtils';
import { projectPoint } from './landingZoneCalculator';

// ============================================================================
// WIND ADJUSTMENTS
// ============================================================================

/**
 * Convert cardinal wind direction to bearing (degrees)
 * N = 0, E = 90, S = 180, W = 270
 */
const WIND_DIRECTION_TO_BEARING = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/**
 * Calculate wind effect on a shot
 *
 * @param {number} baseDistance - Target distance in yards
 * @param {number} windSpeed - Wind speed in mph
 * @param {string} windDirection - Cardinal direction (N, NE, WSW, etc.)
 * @param {number} shotBearing - Direction of shot in degrees (0-360)
 * @returns {Object} Wind adjustment details
 */
export function calculateWindAdjustment(baseDistance, windSpeed, windDirection, shotBearing) {
  if (!windSpeed || windSpeed === 0) {
    return {
      adjustedDistance: baseDistance,
      distanceEffect: 0,
      windEffect: 'calm',
      clubAdjustment: 0,
      aimOffsetYards: 0,
      aimDirection: null,
      description: 'Calm conditions - no wind adjustment needed',
    };
  }

  // Convert wind direction to bearing (where wind is coming FROM)
  // N = 0, E = 90, S = 180, W = 270
  const windBearing = WIND_DIRECTION_TO_BEARING[windDirection] ?? 0;

  // Calculate angle between shot direction and wind source
  // If shotBearing == windBearing, you're hitting INTO the wind (headwind)
  // If shotBearing == windBearing + 180, you're hitting WITH the wind (tailwind)
  let angleDiff = shotBearing - windBearing;

  // Normalize to -180 to 180
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;

  // Calculate headwind/tailwind component
  // cos(0°) = 1 when hitting toward wind source = headwind (positive)
  // cos(180°) = -1 when hitting away from wind source = tailwind (negative)
  const headwindComponent = windSpeed * Math.cos((angleDiff * Math.PI) / 180);

  // Calculate crosswind component (positive = wind from left, pushing right)
  const crosswindComponent = windSpeed * Math.sin((angleDiff * Math.PI) / 180);

  // Distance adjustment: ~1% per mph of headwind, ~0.5% per mph of tailwind
  // Headwind has more effect because it increases spin and steepens descent
  let distanceEffect = 0;
  if (headwindComponent > 0) {
    // Headwind - add distance (ball doesn't carry as far)
    distanceEffect = baseDistance * (headwindComponent * 0.01);
  } else {
    // Tailwind - subtract distance (ball carries further)
    distanceEffect = baseDistance * (headwindComponent * 0.005);
  }

  const adjustedDistance = Math.round(baseDistance + distanceEffect);

  // Club adjustment (rough estimate: 1 club = 10-12 yards)
  const clubAdjustment = Math.round((distanceEffect / 11) * 10) / 10;

  // Aim adjustment for crosswind
  // Rule of thumb: 1-2 yards per mph for short irons, 2-3 for woods
  const crosswindFactor = baseDistance > 180 ? 2.5 : baseDistance > 140 ? 2 : 1.5;
  const aimOffsetYards = Math.round(Math.abs(crosswindComponent) * crosswindFactor);
  const aimDirection = crosswindComponent > 0 ? 'left' : crosswindComponent < 0 ? 'right' : null;

  // Determine wind effect type
  let windEffect;
  if (Math.abs(headwindComponent) > Math.abs(crosswindComponent) * 2) {
    windEffect = headwindComponent > 0 ? 'into' : 'helping';
  } else if (Math.abs(crosswindComponent) > Math.abs(headwindComponent) * 2) {
    windEffect = crosswindComponent > 0 ? 'crosswind-right' : 'crosswind-left';
  } else {
    windEffect = headwindComponent > 0
      ? (crosswindComponent > 0 ? 'into-right' : 'into-left')
      : (crosswindComponent > 0 ? 'helping-right' : 'helping-left');
  }

  // Build description
  let description = '';
  if (Math.abs(distanceEffect) >= 5) {
    description += `${distanceEffect > 0 ? '+' : ''}${Math.round(distanceEffect)} yards for wind. `;
  }
  if (aimOffsetYards >= 3 && aimDirection) {
    description += `Aim ${aimOffsetYards} yards ${aimDirection} to compensate for crosswind.`;
  }
  if (!description) {
    description = 'Minimal wind effect on this shot.';
  }

  return {
    adjustedDistance,
    distanceEffect: Math.round(distanceEffect),
    windEffect,
    clubAdjustment,
    aimOffsetYards,
    aimDirection,
    description: description.trim(),
  };
}

// ============================================================================
// TEMPERATURE ADJUSTMENTS
// ============================================================================

/**
 * Calculate temperature effect on ball flight
 * Rule: ~2 yards per 10°F change per 100 yards of carry
 *
 * @param {number} baseDistance - Target distance in yards
 * @param {number} temperature - Current temperature in Fahrenheit
 * @param {number} baselineTemp - Standard temperature (default 70°F)
 * @returns {Object} Temperature adjustment details
 */
export function calculateTemperatureAdjustment(baseDistance, temperature, baselineTemp = 70) {
  if (temperature === null || temperature === undefined) {
    return {
      adjustedDistance: baseDistance,
      distanceEffect: 0,
      percentChange: 0,
      description: 'No temperature data available',
    };
  }

  const tempDiff = baselineTemp - temperature;

  // 2 yards per 10°F per 100 yards = 0.002 per degree per yard
  const percentChange = tempDiff * 0.002;
  const distanceEffect = Math.round(baseDistance * percentChange);
  const adjustedDistance = baseDistance + distanceEffect;

  let description = '';
  if (Math.abs(distanceEffect) >= 3) {
    if (distanceEffect > 0) {
      description = `Cold conditions (${temperature}°F) - ball travels ${distanceEffect} yards shorter`;
    } else {
      description = `Warm conditions (${temperature}°F) - ball travels ${Math.abs(distanceEffect)} yards longer`;
    }
  } else {
    description = 'Temperature has minimal effect on distance';
  }

  return {
    adjustedDistance,
    distanceEffect,
    percentChange: Math.round(percentChange * 1000) / 10, // As percentage
    description,
  };
}

// ============================================================================
// ELEVATION ADJUSTMENTS
// ============================================================================

/**
 * Calculate elevation effect on shot distance
 *
 * @param {number} baseDistance - Target distance in yards
 * @param {number} playerElevation - Player's elevation in feet
 * @param {number} targetElevation - Target's elevation in feet
 * @param {number} courseElevation - Course elevation above sea level (for altitude effect)
 * @returns {Object} Elevation adjustment details
 */
export function calculateElevationAdjustment(baseDistance, playerElevation, targetElevation, courseElevation = 0) {
  // If no elevation data, return unchanged
  if (playerElevation === null || playerElevation === undefined ||
      targetElevation === null || targetElevation === undefined) {
    return {
      adjustedDistance: baseDistance,
      elevationDelta: 0,
      slopeEffect: 0,
      altitudeEffect: 0,
      description: 'No elevation data available',
    };
  }

  const elevationDelta = targetElevation - playerElevation;

  // Slope effect: ~1 yard per 3 feet of elevation change
  const slopeEffect = Math.round(elevationDelta / 3);

  // Altitude effect: ~2% per 1000 feet above sea level
  // (thinner air = less drag = ball flies further)
  const altitudeEffect = Math.round(baseDistance * (courseElevation / 1000) * 0.02);

  const adjustedDistance = baseDistance + slopeEffect - altitudeEffect;

  let description = '';
  const parts = [];

  if (Math.abs(slopeEffect) >= 3) {
    if (elevationDelta > 0) {
      parts.push(`uphill ${Math.abs(Math.round(elevationDelta))}ft (+${slopeEffect} yards)`);
    } else {
      parts.push(`downhill ${Math.abs(Math.round(elevationDelta))}ft (${slopeEffect} yards)`);
    }
  }

  if (altitudeEffect >= 3) {
    parts.push(`altitude bonus -${altitudeEffect} yards (${Math.round(courseElevation)}ft elevation)`);
  }

  description = parts.length > 0
    ? `Plays ${adjustedDistance} yards: ${parts.join(', ')}`
    : 'Elevation has minimal effect on this shot';

  return {
    adjustedDistance,
    elevationDelta: Math.round(elevationDelta),
    slopeEffect,
    altitudeEffect,
    description,
  };
}

// ============================================================================
// CLUB EFFECTIVE REACH (CLUB-CENTRIC DISTANCE)
// ============================================================================

/**
 * Calculate where a club's shot will actually land given environmental conditions.
 *
 * This is the INVERSE of "plays like" distance calculations:
 * - "Plays like" answers: "If I need to hit X yards, what club should I use?"
 * - "Effective reach" answers: "If I use my X-yard club, where will the ball land?"
 *
 * The key insight: existing distanceEffect values tell us "how much extra club you need."
 * To find where the ball lands, we SUBTRACT these effects from the club distance.
 *
 * Example with headwind:
 * - Club distance: 275 yards (driver)
 * - Wind distanceEffect: +30 (headwind means you need 30 more yards of club)
 * - Effective reach: 275 - 30 = 245 yards (ball lands at 245)
 *
 * Example with tailwind:
 * - Club distance: 275 yards (driver)
 * - Wind distanceEffect: -15 (tailwind means you need 15 less yards of club)
 * - Effective reach: 275 - (-15) = 290 yards (ball lands at 290)
 *
 * @param {number} clubDistance - How far the player normally hits this club (yards)
 * @param {Object} weather - Weather conditions { windSpeed, windDirection, temperature, courseElevation }
 * @param {number} shotBearing - Direction of shot in degrees (0-360)
 * @param {number} playerElevation - Player's elevation in feet (optional)
 * @param {number} targetElevation - Estimated target elevation in feet (optional)
 * @returns {Object} { effectiveReach, clubDistance, adjustments }
 */
export function calculateClubEffectiveReach(clubDistance, weather, shotBearing, playerElevation = null, targetElevation = null) {
  if (!clubDistance || clubDistance <= 0) {
    return {
      effectiveReach: 0,
      clubDistance: 0,
      adjustments: { wind: 0, temperature: 0, elevation: 0, total: 0 },
      description: 'Invalid club distance',
    };
  }

  // Calculate wind adjustment (distanceEffect = how much MORE club you need)
  const wind = calculateWindAdjustment(
    clubDistance,
    weather?.windSpeed || 0,
    weather?.windDirection || 'N',
    shotBearing
  );

  // Calculate temperature adjustment
  const temp = calculateTemperatureAdjustment(
    clubDistance,
    weather?.temperature
  );

  // Calculate elevation adjustment
  const elev = calculateElevationAdjustment(
    clubDistance,
    playerElevation,
    targetElevation,
    weather?.courseElevation || 0
  );

  // INVERT the adjustments to find where ball actually lands:
  // - Positive distanceEffect means "need more club" = ball lands SHORT
  // - Negative distanceEffect means "need less club" = ball lands LONG
  //
  // For wind/temp: subtract distanceEffect (positive headwind = shorter landing)
  // For elevation:
  //   - slopeEffect is positive for uphill (need more club = lands shorter)
  //   - altitudeEffect is positive for high altitude (ball flies further = lands longer)
  const windEffect = -wind.distanceEffect;
  const tempEffect = -temp.distanceEffect;
  const elevEffect = -elev.slopeEffect + elev.altitudeEffect;

  const totalAdjustment = windEffect + tempEffect + elevEffect;
  const effectiveReach = Math.round(clubDistance + totalAdjustment);

  // Build description
  const parts = [];
  if (Math.abs(windEffect) >= 3) {
    parts.push(`wind ${windEffect > 0 ? '+' : ''}${Math.round(windEffect)}`);
  }
  if (Math.abs(tempEffect) >= 3) {
    parts.push(`temp ${tempEffect > 0 ? '+' : ''}${Math.round(tempEffect)}`);
  }
  if (Math.abs(elevEffect) >= 3) {
    parts.push(`elevation ${elevEffect > 0 ? '+' : ''}${Math.round(elevEffect)}`);
  }

  const description = parts.length > 0
    ? `${clubDistance} yd club reaches ${effectiveReach} yds (${parts.join(', ')})`
    : `${clubDistance} yd club reaches ${effectiveReach} yds (no significant adjustments)`;

  return {
    effectiveReach,
    clubDistance,
    adjustments: {
      wind: Math.round(windEffect),
      temperature: Math.round(tempEffect),
      elevation: Math.round(elevEffect),
      total: Math.round(totalAdjustment),
      windDetail: wind,
      temperatureDetail: temp,
      elevationDetail: elev,
    },
    description,
  };
}

// ============================================================================
// HAZARD RELEVANCE FILTERING
// ============================================================================

/**
 * Filter hazards to only those relevant to the current shot
 *
 * @param {Object} playerPosition - Player's current position { latitude, longitude }
 * @param {Object} targetPosition - Target position { latitude, longitude }
 * @param {Array} hazards - Array of hazard polygons
 * @param {number} maxShotDistance - Player's longest club distance
 * @param {number} corridorWidth - Width of shot corridor in yards (default 50)
 * @returns {Object} Filtered hazards with relevance info
 */
export function filterRelevantHazards(playerPosition, targetPosition, hazards, maxShotDistance, corridorWidth = 50) {
  if (!hazards || hazards.length === 0) {
    return { relevantHazards: [], filteredOut: [], summary: 'No hazards on this hole' };
  }

  if (!playerPosition || !targetPosition) {
    return { relevantHazards: [], filteredOut: [], summary: 'Missing position data' };
  }

  const shotBearing = calculateBearing(playerPosition, targetPosition);
  const shotDistance = calculateDistance(playerPosition, targetPosition);

  const relevantHazards = [];
  const filteredOut = [];

  for (const hazard of hazards) {
    // Skip non-hazard polygon types
    const hazardTypes = ['bunker', 'water', 'ob', 'penalty', 'waste_area'];
    if (!hazardTypes.includes(hazard.type)) {
      continue;
    }

    if (!hazard.coordinates || hazard.coordinates.length < 3) {
      filteredOut.push({ hazard, reason: 'invalid polygon' });
      continue;
    }

    const centroid = calculateCentroid(hazard.coordinates);
    if (!centroid) {
      filteredOut.push({ hazard, reason: 'could not calculate centroid' });
      continue;
    }

    const hazardDistance = calculateDistance(playerPosition, centroid);
    const hazardBearing = calculateBearing(playerPosition, centroid);

    // Is hazard within range of the shot (plus buffer for dispersion)?
    if (hazardDistance > maxShotDistance + 50) {
      filteredOut.push({ hazard, reason: 'too far' });
      continue;
    }

    // Is hazard in the shot corridor?
    const bearingDiff = hazardBearing - shotBearing;
    const normalizedDiff = ((bearingDiff + 180) % 360) - 180;
    const lateralOffset = hazardDistance * Math.sin(normalizedDiff * Math.PI / 180);

    if (Math.abs(lateralOffset) > corridorWidth) {
      filteredOut.push({ hazard, reason: 'outside corridor' });
      continue;
    }

    // Determine threat level based on proximity and type
    let threatLevel = 'low';
    if (hazard.type === 'water' || hazard.type === 'ob') {
      threatLevel = hazardDistance < shotDistance * 0.8 ? 'high' : 'medium';
    } else {
      threatLevel = hazardDistance < shotDistance * 0.6 ? 'medium' : 'low';
    }

    // Hazard is relevant
    relevantHazards.push({
      ...hazard,
      name: hazard.label || hazard.name || `${hazard.type}`,
      distance: Math.round(hazardDistance),
      bearing: Math.round(hazardBearing),
      direction: lateralOffset > 5 ? 'right' : lateralOffset < -5 ? 'left' : 'center',
      lateralOffset: Math.round(Math.abs(lateralOffset)),
      threatLevel,
    });
  }

  // Sort by threat level and distance
  relevantHazards.sort((a, b) => {
    const threatOrder = { high: 0, medium: 1, low: 2 };
    if (threatOrder[a.threatLevel] !== threatOrder[b.threatLevel]) {
      return threatOrder[a.threatLevel] - threatOrder[b.threatLevel];
    }
    return a.distance - b.distance;
  });

  const summary = relevantHazards.length > 0
    ? `${relevantHazards.length} hazard(s) in play: ${relevantHazards.map(h => `${h.name} (${h.direction})`).join(', ')}`
    : 'No hazards in your target corridor';

  return { relevantHazards, filteredOut, summary };
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
// AWKWARD DISTANCE DETECTION
// ============================================================================

/**
 * Detect if a proposed layup distance leaves an awkward yardage
 *
 * Awkward distances (30-50 yards) are too long for most chips but
 * require a partial wedge swing that amateurs struggle with.
 *
 * @param {number} distanceAfterShot - Distance to green after proposed shot
 * @param {Object} clubDistances - Player's club distances { clubId: distance }
 * @returns {Object} Awkward distance analysis
 */
export function detectAwkwardDistance(distanceAfterShot, clubDistances) {
  const AWKWARD_MIN = 30;
  const AWKWARD_MAX = 50;

  const isAwkward = distanceAfterShot >= AWKWARD_MIN && distanceAfterShot <= AWKWARD_MAX;

  if (!isAwkward) {
    return {
      isAwkward: false,
      distanceAfterShot,
      description: distanceAfterShot < AWKWARD_MIN
        ? 'Good distance - chip or pitch range'
        : 'Good distance - full swing territory',
    };
  }

  // Find the shortest wedge distance for a full swing
  const wedgeClubs = Object.entries(clubDistances)
    .filter(([club]) => club.includes('w_') || club === 'pw' || club.includes('wedge'))
    .map(([club, distance]) => ({ club, distance }))
    .sort((a, b) => a.distance - b.distance);

  const shortestWedge = wedgeClubs[0];
  const idealDistance = shortestWedge ? shortestWedge.distance + 10 : 80; // Add buffer

  // Find club that would leave ideal distance
  const currentDistance = distanceAfterShot; // This is distance TO green after shot
  // We need to figure out what the player should hit instead

  return {
    isAwkward: true,
    distanceAfterShot,
    problem: `${distanceAfterShot} yards is awkward - too long for chip, too short for full swing`,
    idealDistance,
    recommendation: `Lay up to ${idealDistance} yards instead for a full ${shortestWedge?.club || 'wedge'}`,
    description: `Consider a different club to leave ${idealDistance} yards instead of ${distanceAfterShot}`,
  };
}

// ============================================================================
// CLUB SELECTION
// ============================================================================

/**
 * Select best club(s) for a given target distance
 *
 * @param {number} targetDistance - Adjusted target distance
 * @param {Object} clubDistances - Player's club distances { clubId: distance }
 * @param {string} lieType - Current lie type (fairway, rough, bunker, etc.)
 * @returns {Object} Club recommendation
 */
export function selectClubsForDistance(targetDistance, clubDistances, lieType = 'fairway') {
  if (!clubDistances || Object.keys(clubDistances).length === 0) {
    return {
      primary: null,
      alternate: null,
      description: 'No club data available',
    };
  }

  // Apply lie penalty
  const liePenalties = {
    fairway: 1.0,
    rough: 0.9,
    heavy_rough: 0.8,
    bunker: 0.95,
    divot: 0.9,
    hardpan: 0.9,
  };
  const liePenalty = liePenalties[lieType] || 1.0;

  // Sort clubs by distance descending
  const clubs = Object.entries(clubDistances)
    .map(([club, distance]) => ({
      club,
      baseDistance: distance,
      effectiveDistance: Math.round(distance * liePenalty),
    }))
    .sort((a, b) => b.effectiveDistance - a.effectiveDistance);

  // Find best matching club
  let primary = null;
  let alternate = null;

  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    const gap = club.effectiveDistance - targetDistance;

    if (gap >= -5 && gap <= 10) {
      // Good match (slightly long is preferred for amateurs)
      primary = {
        club: club.club,
        distance: club.effectiveDistance,
        gap,
        confidence: Math.abs(gap) <= 3 ? 'high' : 'medium',
      };

      // Find alternate (next club down)
      if (i + 1 < clubs.length) {
        const nextClub = clubs[i + 1];
        alternate = {
          club: nextClub.club,
          distance: nextClub.effectiveDistance,
          gap: nextClub.effectiveDistance - targetDistance,
          note: 'If you want to flight it down',
        };
      }
      break;
    }

    // If we passed the target distance, take this club (better long than short)
    if (gap < -5 && i > 0) {
      const prevClub = clubs[i - 1];
      primary = {
        club: prevClub.club,
        distance: prevClub.effectiveDistance,
        gap: prevClub.effectiveDistance - targetDistance,
        confidence: 'medium',
        note: 'Between clubs - taking the longer one',
      };
      alternate = {
        club: club.club,
        distance: club.effectiveDistance,
        gap,
        note: 'Shorter option if conditions favor it',
      };
      break;
    }
  }

  // If no match found, use longest or shortest club
  if (!primary && clubs.length > 0) {
    if (targetDistance > clubs[0].effectiveDistance) {
      primary = {
        club: clubs[0].club,
        distance: clubs[0].effectiveDistance,
        gap: clubs[0].effectiveDistance - targetDistance,
        confidence: 'low',
        note: 'Target is beyond your longest club',
      };
    } else {
      const shortest = clubs[clubs.length - 1];
      primary = {
        club: shortest.club,
        distance: shortest.effectiveDistance,
        gap: shortest.effectiveDistance - targetDistance,
        confidence: 'low',
        note: 'Consider a partial swing or bump-and-run',
      };
    }
  }

  const description = primary
    ? `${formatClubName(primary.club)} (${primary.distance} yards) for ${targetDistance} yard shot`
    : 'Unable to recommend club';

  return {
    primary,
    alternate,
    description,
    lieAdjustment: liePenalty < 1 ? `${Math.round((1 - liePenalty) * 100)}% reduction for ${lieType}` : null,
  };
}

/**
 * Format club name for display (snake_case to Title Case)
 */
function formatClubName(clubId) {
  if (!clubId) return '';

  // Handle wedge notation (w_48 -> 48° Wedge)
  if (clubId.startsWith('w_')) {
    return `${clubId.slice(2)}° Wedge`;
  }

  // Handle standard clubs
  return clubId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// FAIRWAY TARGET CALCULATION
// ============================================================================

/**
 * Calculate fairway landing zone targets with distances
 * This pre-computes what the edge function was calculating redundantly
 *
 * @param {Object} teeBox - Tee box position { latitude, longitude }
 * @param {Object} green - Green position { latitude, longitude }
 * @param {Array} polygons - All course polygons
 * @returns {Array} Sorted fairway targets with distances
 */
export function calculateFairwayTargets(teeBox, green, polygons) {
  if (!teeBox || !green || !polygons) {
    return [];
  }

  const fairwayPolygons = polygons.filter(p => p.type === 'fairway');
  if (fairwayPolygons.length === 0) {
    return [];
  }

  const targets = [];
  const holeBearing = calculateBearing(teeBox, green);
  const holeDistance = calculateDistance(teeBox, green);

  for (const fairway of fairwayPolygons) {
    if (!fairway.coordinates || fairway.coordinates.length < 3) {
      continue;
    }

    // Calculate centroid of fairway polygon
    const centroid = calculateCentroid(fairway.coordinates);
    if (!centroid) continue;

    const distanceFromTee = calculateDistance(teeBox, centroid);
    const distanceToGreen = calculateDistance(centroid, green);

    // Only include fairway targets between 150-350 yards from tee (typical landing zone)
    if (distanceFromTee < 150 || distanceFromTee > 350) {
      continue;
    }

    // Calculate width of fairway at this point (approximate)
    const fairwayWidth = estimateFairwayWidth(fairway.coordinates, centroid, holeBearing);

    targets.push({
      position: centroid,
      distanceFromTee: Math.round(distanceFromTee),
      distanceToGreen: Math.round(distanceToGreen),
      fairwayWidth: Math.round(fairwayWidth),
      description: `${Math.round(distanceFromTee)} yards out, ${Math.round(distanceToGreen)} to green`,
    });
  }

  // Sort by distance from tee (closest first)
  return targets.sort((a, b) => a.distanceFromTee - b.distanceFromTee);
}

/**
 * Estimate fairway width at a given point
 */
export function estimateFairwayWidth(coordinates, centerPoint, holeBearing) {
  // Find points perpendicular to hole bearing
  const perpendicularBearing = (holeBearing + 90) % 360;

  let minLeft = Infinity;
  let minRight = Infinity;

  for (const coord of coordinates) {
    const dist = calculateDistance(centerPoint, coord);
    const bearing = calculateBearing(centerPoint, coord);
    const relativeBearing = ((bearing - perpendicularBearing + 180) % 360) - 180;

    if (relativeBearing > -45 && relativeBearing < 45) {
      // Right side
      if (dist < minRight) minRight = dist;
    } else if (relativeBearing > 135 || relativeBearing < -135) {
      // Left side
      if (dist < minLeft) minLeft = dist;
    }
  }

  const leftWidth = minLeft === Infinity ? 20 : minLeft;
  const rightWidth = minRight === Infinity ? 20 : minRight;

  return leftWidth + rightWidth;
}

// ============================================================================
// FAIRWAY CENTERLINE TARGETING (Dogleg-aware)
// ============================================================================

/**
 * Calculate the fairway center point at a given landing distance from the start.
 * Instead of projecting along a straight line to the green (which fails on doglegs),
 * this finds where the fairway actually IS at the club's landing distance.
 *
 * @param {Object} startPosition - Starting position { latitude, longitude }
 * @param {number} landingDistance - Distance in yards from start where ball will land
 * @param {Object} green - Green center GPS { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @returns {Object} Fairway center position { latitude, longitude } at landing distance
 */
export function calculateFairwayCenterlineTarget(startPosition, landingDistance, green, polygons) {
  if (!startPosition || !green || !polygons) {
    return projectPoint(startPosition, landingDistance, calculateBearing(startPosition, green));
  }

  const fairwayPolygons = polygons.filter(p => p.type === 'fairway');
  if (fairwayPolygons.length === 0) {
    return projectPoint(startPosition, landingDistance, calculateBearing(startPosition, green));
  }

  const holeBearing = calculateBearing(startPosition, green);
  const distanceWindow = 30; // Look for vertices within ±30 yards of landing distance

  let bestTarget = null;
  let bestWidth = 0;

  for (const fairway of fairwayPolygons) {
    if (!fairway.coordinates || fairway.coordinates.length < 3) {
      continue;
    }

    // Find vertices near the landing distance
    const nearbyVertices = fairway.coordinates.filter(v => {
      const dist = calculateDistance(startPosition, v);
      return Math.abs(dist - landingDistance) < distanceWindow;
    });

    if (nearbyVertices.length < 2) {
      continue;
    }

    // Calculate centroid of nearby vertices = fairway center at this distance
    const centroid = calculateCentroid(nearbyVertices);
    if (!centroid) continue;

    // Verify centroid is actually in fairway
    let targetPoint = centroid;
    if (!isPointInPolygon(centroid, fairway)) {
      // Find the nearest vertex that IS near the landing distance as fallback
      let closestDist = Infinity;
      for (const v of nearbyVertices) {
        const d = calculateDistance(centroid, v);
        if (d < closestDist) {
          closestDist = d;
          targetPoint = v;
        }
      }
    }

    // Estimate width at this point
    const width = estimateFairwayWidth(fairway.coordinates, targetPoint, holeBearing);

    if (width > bestWidth) {
      bestWidth = width;
      bestTarget = targetPoint;
    }
  }

  if (bestTarget) {
    return bestTarget;
  }

  // Fallback: straight-line projection
  return projectPoint(startPosition, landingDistance, holeBearing);
}

/**
 * Calculate fairway width at a given distance from the start position.
 * Used by the scorer to reward/penalize landing at wide/narrow fairway sections.
 *
 * @param {Object} startPosition - Starting position { latitude, longitude }
 * @param {number} distance - Distance from start in yards
 * @param {Object} green - Green center GPS { latitude, longitude }
 * @param {Array} polygons - Course polygons
 * @returns {number} Fairway width in yards at this distance (0 if no fairway)
 */
export function calculateFairwayWidthAtDistance(startPosition, distance, green, polygons) {
  if (!startPosition || !green || !polygons) {
    return 0;
  }

  const fairwayPolygons = polygons.filter(p => p.type === 'fairway');
  if (fairwayPolygons.length === 0) {
    return 0;
  }

  const holeBearing = calculateBearing(startPosition, green);
  const distanceWindow = 25;
  let maxWidth = 0;

  for (const fairway of fairwayPolygons) {
    if (!fairway.coordinates || fairway.coordinates.length < 3) {
      continue;
    }

    // Find vertices near this distance
    const nearbyVertices = fairway.coordinates.filter(v => {
      const dist = calculateDistance(startPosition, v);
      return Math.abs(dist - distance) < distanceWindow;
    });

    if (nearbyVertices.length >= 2) {
      const centroid = calculateCentroid(nearbyVertices);
      if (centroid) {
        const width = estimateFairwayWidth(fairway.coordinates, centroid, holeBearing);
        if (width > maxWidth) {
          maxWidth = width;
        }
      }
    }
  }

  return maxWidth;
}

// ============================================================================
// MASTER CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate all shot context adjustments
 *
 * @param {Object} params - All parameters needed for calculations
 * @returns {Object} Complete shot context with all adjustments
 */
export function calculateShotContext({
  player,
  weather,
  clubDistances,
  hazards,
  targetPosition,
  playerElevation,
  targetElevation,
  courseElevation,
  teeBox,
}) {
  const baseDistance = player?.distanceToGreen || 0;

  if (baseDistance === 0) {
    return {
      baseDistance: 0,
      effectiveDistance: 0,
      adjustments: {
        wind: { adjustedDistance: 0, distanceEffect: 0, windEffect: 'calm', clubAdjustment: 0, aimOffsetYards: 0, aimDirection: null, description: 'No distance data' },
        temperature: { adjustedDistance: 0, distanceEffect: 0, percentChange: 0, description: 'No distance data' },
        elevation: { adjustedDistance: 0, elevationDelta: 0, slopeEffect: 0, altitudeEffect: 0, description: 'No distance data' },
      },
      club: { primary: null, alternate: null, description: 'No distance data' },
      hazards: { relevantHazards: [], filteredOut: [], summary: 'No distance data' },
      awkwardDistance: { isAwkward: false, distanceAfterShot: 0, description: 'No distance data' },
      fairwayTargets: [],
      summary: 'No distance data available',
    };
  }

  // Calculate shot bearing for wind calculations
  const playerPosition = player?.currentPosition;
  const shotBearing = playerPosition && targetPosition
    ? calculateBearing(playerPosition, targetPosition)
    : 0;

  // Wind adjustment
  const wind = calculateWindAdjustment(
    baseDistance,
    weather?.windSpeed || 0,
    weather?.windDirection || 'N',
    shotBearing
  );

  // Temperature adjustment
  const temp = calculateTemperatureAdjustment(
    wind.adjustedDistance,
    weather?.temperature
  );

  // Elevation adjustment
  const elevation = calculateElevationAdjustment(
    temp.adjustedDistance,
    playerElevation,
    targetElevation,
    courseElevation
  );

  const effectiveDistance = elevation.adjustedDistance;

  // Club selection
  const club = selectClubsForDistance(
    effectiveDistance,
    clubDistances,
    player?.lieType || 'fairway'
  );

  // Hazard filtering
  const maxClubDistance = clubDistances
    ? Math.max(...Object.values(clubDistances))
    : 300;

  const hazardAnalysis = filterRelevantHazards(
    playerPosition,
    targetPosition,
    hazards,
    maxClubDistance
  );

  // Awkward distance detection (for approach shot planning)
  const awkwardDistance = detectAwkwardDistance(baseDistance, clubDistances);

  // Fairway targets (for tee shot planning)
  const fairwayTargets = teeBox && targetPosition
    ? calculateFairwayTargets(teeBox, targetPosition, hazards)
    : [];

  // Build summary
  const summary = buildShotSummary(baseDistance, effectiveDistance, wind, temp, elevation);

  return {
    baseDistance,
    effectiveDistance,
    adjustments: {
      wind,
      temperature: temp,
      elevation,
    },
    club,
    hazards: hazardAnalysis,
    awkwardDistance,
    fairwayTargets,
    summary,
  };
}

/**
 * Build a human-readable summary of all adjustments
 */
function buildShotSummary(baseDistance, effectiveDistance, wind, temp, elevation) {
  const totalAdjustment = effectiveDistance - baseDistance;

  if (Math.abs(totalAdjustment) < 3) {
    return `${baseDistance} yards - plays true to distance`;
  }

  const parts = [];
  if (Math.abs(wind.distanceEffect) >= 3) {
    parts.push(`wind ${wind.distanceEffect > 0 ? '+' : ''}${wind.distanceEffect}`);
  }
  if (Math.abs(temp.distanceEffect) >= 3) {
    parts.push(`temp ${temp.distanceEffect > 0 ? '+' : ''}${temp.distanceEffect}`);
  }
  if (Math.abs(elevation.slopeEffect) >= 3) {
    parts.push(`elevation ${elevation.slopeEffect > 0 ? '+' : ''}${elevation.slopeEffect}`);
  }

  return `${baseDistance} yards plays like ${effectiveDistance} (${parts.join(', ')})`;
}

// ============================================================================
// PLAYING LIKE DISTANCE (COMPOSITE ADJUSTMENT)
// ============================================================================

/**
 * Compute "playing like" distance with all adjustments applied in sequence.
 * This is the distance the player should club for, accounting for:
 * - Wind (direction and speed)
 * - Temperature (cold = shorter, hot = longer)
 * - Elevation (uphill/downhill and altitude)
 *
 * @param {number} baseDistance - Raw GPS distance to target
 * @param {Object} weather - Weather conditions
 *   @param {number} weather.windSpeed - Wind speed in mph
 *   @param {string} weather.windDirection - Wind direction (N, NE, etc.)
 *   @param {number} weather.temperature - Temperature in Fahrenheit
 *   @param {number} weather.courseElevation - Course elevation above sea level
 * @param {number} shotBearing - Direction of shot in degrees (0-360)
 * @param {number} playerElevation - Player's elevation in feet (optional)
 * @param {number} targetElevation - Target's elevation in feet (optional)
 * @returns {Object} { playingLikeDistance, adjustments }
 */
export function computePlayingLikeDistance(
  baseDistance,
  weather,
  shotBearing,
  playerElevation = null,
  targetElevation = null
) {
  // Step 1: Wind adjustment
  const wind = calculateWindAdjustment(
    baseDistance,
    weather?.windSpeed || 0,
    weather?.windDirection || 'N',
    shotBearing
  );

  // Step 2: Temperature adjustment (applied to wind-adjusted distance)
  const temp = calculateTemperatureAdjustment(
    wind.adjustedDistance,
    weather?.temperature
  );

  // Step 3: Elevation adjustment (applied to temp-adjusted distance)
  const elevation = calculateElevationAdjustment(
    temp.adjustedDistance,
    playerElevation,
    targetElevation,
    weather?.courseElevation || 0
  );

  // Final "plays like" distance
  const playingLikeDistance = elevation.adjustedDistance;

  return {
    playingLikeDistance,
    adjustments: {
      wind: {
        adjustedDistance: wind.adjustedDistance,
        distanceEffect: wind.distanceEffect,
        aimOffsetYards: wind.aimOffsetYards,
        aimDirection: wind.aimDirection,
        description: wind.description,
      },
      temperature: {
        adjustedDistance: temp.adjustedDistance,
        distanceEffect: temp.distanceEffect,
        description: temp.description,
      },
      elevation: {
        adjustedDistance: elevation.adjustedDistance,
        elevationDelta: elevation.elevationDelta,
        slopeEffect: elevation.slopeEffect,
        altitudeEffect: elevation.altitudeEffect,
        description: elevation.description,
      },
    },
    summary: buildShotSummary(baseDistance, playingLikeDistance, wind, temp, elevation),
  };
}
