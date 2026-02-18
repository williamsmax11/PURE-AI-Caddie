/**
 * Hole Plan Engine
 *
 * Main orchestrator for computing optimal hole plans.
 * This is a rule-based decision engine that replaces LLM-based planning.
 *
 * Algorithm: Forward planning from tee to green with shot scoring.
 * (Previously used backward planning from green to tee)
 */

import { calculateDistance, calculateBearing } from '../utils/geoUtils';
import {
  calculateWindAdjustment,
  calculateTemperatureAdjustment,
  calculateElevationAdjustment,
  calculateClubEffectiveReach,
  selectClubsForDistance,
  detectAwkwardDistance,
} from './shotCalculations';
import {
  projectPoint,
  calculateLandingZone,
  checkHazardConflicts,
  calculateSafeZone,
  getAvoidZones,
} from './landingZoneCalculator';
import { calculateDispersion } from './dispersionCalculator';
import {
  generateStrategies,
  scoreStrategies,
  generateRiskAssessment,
  findIdealApproachDistance,
  determineOptimalShotCount,
} from './strategyScorer';
import { generateForwardSequences, computePlayingLikeDistance } from './forwardSequenceGenerator';
import { DEFAULT_SCORING_CONFIG } from './scoringConfig';

/**
 * Apply player insights to club distances and get enhanced dispersion.
 * Returns adjusted clubDistances and a helper for measured dispersion.
 */
function applyPlayerInsights(clubDistances, playerInsights) {
  if (!playerInsights || !playerInsights.clubStats || playerInsights.dataQuality?.dataLevel === 'none') {
    return { adjustedDistances: clubDistances, getMeasuredStats: () => null };
  }

  const { clubStats, dataQuality } = playerInsights;
  const adjustedDistances = { ...clubDistances };

  // Only adjust distances at 'moderate' or 'strong' data levels
  if (dataQuality.dataLevel === 'moderate' || dataQuality.dataLevel === 'strong') {
    for (const [club, enteredDist] of Object.entries(clubDistances)) {
      const stats = clubStats[club];
      if (stats && stats.totalShots >= 5 && stats.avgDistance) {
        // Blend entered and measured distance based on sample confidence
        const confidence = getBlendConfidence(stats.totalShots);
        adjustedDistances[club] = Math.round(
          enteredDist * (1 - confidence) + stats.avgDistance * confidence
        );
      }
    }
  }

  // Helper to get measured stats for a specific club (for dispersion)
  const getMeasuredStats = (club) => {
    const normalized = club?.toLowerCase().replace(/[-\s]/g, '_');
    const stats = clubStats[normalized];
    return (stats && stats.totalShots >= 5) ? stats : null;
  };

  return { adjustedDistances, getMeasuredStats };
}

function getBlendConfidence(sampleSize) {
  if (sampleSize < 5) return 0;
  if (sampleSize < 10) return 0.2;
  if (sampleSize < 20) return 0.4;
  if (sampleSize < 30) return 0.6;
  if (sampleSize < 50) return 0.75;
  return 0.85;
}

// Feature flag for forward planning (set to true to use new algorithm)
const USE_FORWARD_PLANNING = true;

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Compute optimal hole plan
 *
 * @param {Object} holeData - Hole information
 *   @param {number} holeData.par - Hole par (3, 4, or 5)
 *   @param {number} holeData.yardage - Total hole yardage
 *   @param {Object} holeData.teeBox - Tee box GPS { latitude, longitude }
 *   @param {Object} holeData.green - Green center GPS { latitude, longitude }
 *   @param {Object} holeData.greenFront - Green front GPS (optional)
 *   @param {Object} holeData.greenBack - Green back GPS (optional)
 *   @param {Array} holeData.polygons - Course polygons (hazards, fairway, etc.)
 *
 * @param {Object} playerContext - Player information
 *   @param {Object} playerContext.position - Current position { latitude, longitude }
 *   @param {Object} playerContext.clubDistances - Club distances { clubId: yards }
 *   @param {number} playerContext.handicap - Player handicap (optional, default 15)
 *   @param {string} playerContext.lieType - Current lie (fairway, rough, bunker)
 *
 * @param {Object} weather - Weather conditions
 *   @param {number} weather.windSpeed - Wind speed in mph
 *   @param {string} weather.windDirection - Wind direction (N, NE, etc.)
 *   @param {number} weather.temperature - Temperature in Fahrenheit
 *
 * @returns {Object} ComputedHolePlan
 */
/**
 * @param {Object} playerInsights - Optional player insights from playerInsightsService
 *   @param {Object} playerInsights.clubStats - Per-club measured stats
 *   @param {Array} playerInsights.tendencies - Detected tendencies
 *   @param {Object} playerInsights.dataQuality - Data quality info { dataLevel, totalShots, totalRounds }
 */
export function computeHolePlan(holeData, playerContext, weather = {}, config = null, playerInsights = null) {
  const { par, teeBox, green, polygons } = holeData;
  const { position, clubDistances, handicap = 15, lieType = 'fairway' } = playerContext;

  // Apply player insights to adjust club distances and get measured stats accessor
  const { adjustedDistances, getMeasuredStats } = applyPlayerInsights(clubDistances, playerInsights);

  // Create enhanced player context with adjusted distances
  const enhancedContext = {
    ...playerContext,
    clubDistances: adjustedDistances,
    _originalClubDistances: clubDistances,
    _getMeasuredStats: getMeasuredStats,
    _playerInsights: playerInsights,
  };

  // Determine starting position (player position or tee box)
  const startPosition = position || teeBox;
  if (!startPosition || !green) {
    return createErrorPlan('Missing position data');
  }

  // Calculate total distance
  const totalDistance = calculateDistance(startPosition, green);

  // Use forward planning if enabled
  if (USE_FORWARD_PLANNING) {
    return computeHolePlanForward(holeData, enhancedContext, weather, config);
  }

  // Legacy backward planning (fallback)
  return computeHolePlanBackward(holeData, enhancedContext, weather);
}

/**
 * Forward planning implementation
 * Generates shot sequences from tee to green with scoring
 */
function computeHolePlanForward(holeData, playerContext, weather = {}, config = null) {
  const { par, teeBox, green, polygons } = holeData;
  const { position, clubDistances, handicap = 15 } = playerContext;

  const startPosition = position || teeBox;
  if (!startPosition || !green) {
    return createErrorPlan('Missing position data');
  }

  const totalDistance = calculateDistance(startPosition, green);
  const scoringConfig = config || DEFAULT_SCORING_CONFIG;

  // Generate all forward sequences
  const sequences = generateForwardSequences(holeData, playerContext, weather, scoringConfig);

  if (sequences.length === 0) {
    return createErrorPlan('Could not generate shot sequences');
  }

  // Get top 3 sequences (already sorted by score)
  const topSequences = sequences.slice(0, 3);
  const bestSequence = topSequences[0];

  // Log top sequences for debugging
  console.log(`[HolePlan] ========== PLAN RESULTS ==========`);
  console.log(`[HolePlan] Generated ${sequences.length} total sequences`);
  topSequences.forEach((seq, i) => {
    const clubs = seq.shots.map(s => s.club).join(' → ');
    console.log(`[HolePlan] #${i + 1}: ${clubs} (score: ${Math.round(seq.totalScore)})`);
    seq.shots.forEach((shot, j) => {
      console.log(`[HolePlan]    Shot ${j + 1}: ${shot.club} - ${shot.distance} yds raw, ${shot.effectiveDistance} yds effective`);
    });
  });
  console.log(`[HolePlan] WINNER: ${bestSequence.shots.map(s => s.club).join(' → ')}`);

  // Generate risk assessment from best sequence
  const riskAssessment = generateRiskAssessmentFromSequence(bestSequence, holeData);

  // Calculate target score based on strategy type
  const targetScore = par + (bestSequence.strategyType === 'aggressive' ? -1 : 0);

  // Calculate success probability from score
  // Higher scores = higher probability (normalized to 0-1 range)
  const maxPossibleScore = 100; // Approximate max
  const minPossibleScore = -100; // Approximate min
  const normalizedScore = (bestSequence.totalScore - minPossibleScore) / (maxPossibleScore - minPossibleScore);
  const successProbability = Math.max(0.3, Math.min(0.95, normalizedScore));

  return {
    shots: bestSequence.shots,
    strategy: bestSequence.strategyType,
    targetScore,
    riskAssessment,
    metadata: {
      totalDistance,
      shotCount: bestSequence.shotCount,
      strategyScore: bestSequence.totalScore,
      successProbability: Math.round(successProbability * 100) / 100,
    },
    // NEW: Include alternative sequences for UI
    alternativeSequences: topSequences.slice(1).map(seq => ({
      shots: seq.shots,
      score: seq.totalScore,
      summary: seq.summary,
      strategyType: seq.strategyType,
    })),
  };
}

/**
 * Generate risk assessment from a scored sequence
 */
function generateRiskAssessmentFromSequence(sequence, holeData) {
  const { shots } = sequence;
  const { polygons = [] } = holeData;

  // Find the main threat from all shots
  let mainThreat = 'None';
  let worstCase = 'Miss the fairway';
  let bailout = 'Play conservatively';

  // Check all shots for hazards
  for (const shot of shots) {
    if (shot.avoidZones && shot.avoidZones.length > 0) {
      const topHazard = shot.avoidZones[0];
      if (topHazard.type === 'water' || topHazard.type === 'ob') {
        mainThreat = `${topHazard.type === 'water' ? 'Water' : 'OB'} ${topHazard.direction || ''}`.trim();
        worstCase = topHazard.type === 'water' ? 'Penalty stroke and drop' : 'Stroke and distance';
        bailout = `Aim away from ${topHazard.direction || 'hazard'}`;
        break;
      } else if (mainThreat === 'None') {
        mainThreat = `${topHazard.name || topHazard.type} ${topHazard.direction || ''}`.trim();
      }
    }
  }

  // Check score breakdown for risk indicators
  if (sequence.totalScore < 0) {
    worstCase = 'High risk of bogey or worse';
  }

  return {
    mainThreat,
    worstCase,
    bailout,
  };
}

/**
 * Legacy backward planning implementation (kept for fallback)
 */
function computeHolePlanBackward(holeData, playerContext, weather = {}) {
  const { par, teeBox, green, polygons } = holeData;
  const { position, clubDistances, handicap = 15, lieType = 'fairway' } = playerContext;

  const startPosition = position || teeBox;
  const totalDistance = calculateDistance(startPosition, green);

  // Generate and score strategies
  const strategies = generateStrategies(holeData, playerContext);
  const optimalStrategy = scoreStrategies(strategies, holeData, playerContext);

  // Determine shot count
  const shotCount = determineOptimalShotCount(
    totalDistance,
    clubDistances,
    par,
    optimalStrategy.type
  );

  // Build shot sequence working backwards from green
  const shots = buildShotSequence({
    startPosition,
    green,
    polygons,
    clubDistances,
    handicap,
    lieType,
    weather,
    shotCount,
    strategy: optimalStrategy,
  });

  // Generate risk assessment
  const riskAssessment = generateRiskAssessment(shots, holeData, playerContext);

  // Calculate target score
  const targetScore = par + (optimalStrategy.type === 'aggressive' ? -1 : 0);

  return {
    shots,
    strategy: optimalStrategy.type,
    targetScore,
    riskAssessment,
    metadata: {
      totalDistance,
      shotCount,
      strategyScore: optimalStrategy.totalScore,
      successProbability: optimalStrategy.successProbability,
    },
  };
}

// ============================================================================
// SHOT SEQUENCE BUILDING
// ============================================================================

/**
 * Build shot sequence working backwards from the green
 *
 * @param {Object} params - All parameters needed
 * @returns {Array} Array of shot objects
 */
function buildShotSequence({
  startPosition,
  green,
  polygons,
  clubDistances,
  handicap,
  lieType,
  weather,
  shotCount,
  strategy,
  getMeasuredStats,
}) {
  const shots = [];
  const holeBearing = calculateBearing(startPosition, green);
  const reverseBearing = (holeBearing + 180) % 360;

  // Find ideal approach distance
  const idealApproach = findIdealApproachDistance(clubDistances);

  if (shotCount === 1) {
    // Par 3 or driveable par 4 - single shot to green
    const shot = buildApproachShot({
      shotNumber: 1,
      fromPosition: startPosition,
      toPosition: green,
      polygons,
      clubDistances,
      handicap,
      lieType,
      weather,
      holeBearing,
      getMeasuredStats,
    });
    shots.push(shot);
  } else if (shotCount === 2) {
    // Two shots: tee shot + approach
    const totalDistance = calculateDistance(startPosition, green);
    const teeDistance = totalDistance - idealApproach;

    // Shot 1: Tee shot to landing zone
    const teeClub = findBestClubForDistance(teeDistance, clubDistances);
    const teeMeasured = getMeasuredStats ? getMeasuredStats(teeClub) : null;
    const landingZone1 = calculateLandingZone(
      green,
      idealApproach,
      reverseBearing,
      polygons,
      calculateDispersion(teeClub, clubDistances, handicap, teeMeasured).radius
    );

    const shot1 = buildTeeShot({
      shotNumber: 1,
      fromPosition: startPosition,
      targetZone: landingZone1,
      polygons,
      clubDistances,
      handicap,
      lieType,
      weather,
      holeBearing,
      getMeasuredStats,
    });
    shots.push(shot1);

    // Shot 2: Approach to green
    const shot2 = buildApproachShot({
      shotNumber: 2,
      fromPosition: landingZone1.position,
      toPosition: green,
      polygons,
      clubDistances,
      handicap,
      lieType: 'fairway', // Assume fairway for planned shot
      weather,
      holeBearing,
      getMeasuredStats,
    });
    shots.push(shot2);
  } else if (shotCount === 3) {
    // Three shots: tee shot + layup + approach (par 5)
    const totalDistance = calculateDistance(startPosition, green);

    // Work backwards: approach from ideal distance
    const approachDistance = idealApproach;

    // Layup should leave ideal approach
    const layupTargetFromGreen = approachDistance;
    const ironMeasured = getMeasuredStats ? getMeasuredStats('7_iron') : null;
    const layupZone = calculateLandingZone(
      green,
      layupTargetFromGreen,
      reverseBearing,
      polygons,
      calculateDispersion('7_iron', clubDistances, handicap, ironMeasured).radius
    );

    // Tee shot - cover remaining distance
    const teeDistance = totalDistance - layupTargetFromGreen - idealApproach;
    const teeTargetFromLayup = calculateDistance(startPosition, layupZone.position);

    const driverMeasured = getMeasuredStats ? getMeasuredStats('driver') : null;
    const landingZone1 = calculateLandingZone(
      layupZone.position,
      teeTargetFromLayup,
      (holeBearing + 180) % 360,
      polygons,
      calculateDispersion('driver', clubDistances, handicap, driverMeasured).radius
    );

    // Shot 1: Tee shot
    const shot1 = buildTeeShot({
      shotNumber: 1,
      fromPosition: startPosition,
      targetZone: { position: landingZone1.position, ...landingZone1 },
      polygons,
      clubDistances,
      handicap,
      lieType,
      weather,
      holeBearing,
      getMeasuredStats,
    });
    shots.push(shot1);

    // Shot 2: Layup
    const shot2 = buildLayupShot({
      shotNumber: 2,
      fromPosition: landingZone1.position,
      targetZone: layupZone,
      polygons,
      clubDistances,
      handicap,
      weather,
      holeBearing,
      green,
      getMeasuredStats,
    });
    shots.push(shot2);

    // Shot 3: Approach
    const shot3 = buildApproachShot({
      shotNumber: 3,
      fromPosition: layupZone.position,
      toPosition: green,
      polygons,
      clubDistances,
      handicap,
      lieType: 'fairway',
      weather,
      holeBearing,
      getMeasuredStats,
    });
    shots.push(shot3);
  }

  return shots;
}

// ============================================================================
// SHOT BUILDERS
// ============================================================================

/**
 * Build a tee shot
 *
 * DISTANCE-CENTRIC APPROACH (aligned with tap marker):
 * - rawDistance = where ball lands (effective reach with conditions)
 * - effectiveDistance = "plays like" distance (GPS distance adjusted for conditions)
 */
function buildTeeShot({
  shotNumber,
  fromPosition,
  targetZone,
  polygons,
  clubDistances,
  handicap,
  lieType,
  weather,
  holeBearing,
  getMeasuredStats,
}) {
  const targetDistance = calculateDistance(fromPosition, targetZone.position);

  // Select club based on target distance
  const clubSelection = selectClubsForDistance(targetDistance, clubDistances, lieType);
  const club = clubSelection.primary?.club || 'driver';
  const clubDistance = clubDistances[club] || 250;

  // Calculate where ball will actually land (club-centric)
  const reachInfo = calculateClubEffectiveReach(
    clubDistance,
    weather,
    holeBearing,
    fromPosition.elevation,
    targetZone.position?.elevation
  );

  // Calculate dispersion (use measured stats when available)
  const measuredStats = getMeasuredStats ? getMeasuredStats(club) : null;
  const dispersion = calculateDispersion(club, clubDistances, handicap, measuredStats);

  // Get avoid zones
  const avoidZones = getAvoidZones(fromPosition, targetZone.position, polygons);

  // Calculate safe zone
  const safeZone = calculateSafeZone(targetZone.position, dispersion.radius, polygons);

  // Generate target description
  const targetDescription = generateTargetDescription(targetZone, avoidZones);

  const rawDistance = reachInfo.effectiveReach;
  // Compute "plays like" using same method as tap marker
  const playingLike = computePlayingLikeDistance(
    Math.round(rawDistance),
    weather,
    holeBearing,
    fromPosition.elevation,
    targetZone.position?.elevation
  );
  const effectiveDistance = Math.round(playingLike.effectiveDistance);

  return {
    shotNumber,
    club: formatClubName(club),
    distance: rawDistance,
    effectiveDistance: effectiveDistance,
    expectedDistance: rawDistance,
    landingZone: {
      latitude: targetZone.position?.latitude || 0,
      longitude: targetZone.position?.longitude || 0,
      description: targetZone.description || `${rawDistance} yards out`,
    },
    target: targetDescription || 'Center of fairway',
    safeZone: {
      latitude: safeZone.position?.latitude || 0,
      longitude: safeZone.position?.longitude || 0,
      direction: safeZone.direction || 'center',
      description: safeZone.description || 'Safe zone',
    },
    avoidZones: avoidZones || [],
    dispersionRadius: dispersion.radius || 15,
    adjustments: reachInfo.adjustments,
    confidence: clubSelection.primary?.confidence || 'medium',
    reasoning: generateShotReasoning('tee', club, rawDistance, effectiveDistance, avoidZones, null, reachInfo.adjustments),
  };
}

/**
 * Build an approach shot
 *
 * DISTANCE-CENTRIC APPROACH (aligned with tap marker):
 * - rawDistance = where ball lands (effective reach with conditions)
 * - effectiveDistance = "plays like" distance (GPS distance adjusted for conditions)
 */
function buildApproachShot({
  shotNumber,
  fromPosition,
  toPosition,
  polygons,
  clubDistances,
  handicap,
  lieType,
  weather,
  holeBearing,
  getMeasuredStats,
}) {
  const targetDistance = calculateDistance(fromPosition, toPosition);

  // Select club based on target distance
  const clubSelection = selectClubsForDistance(targetDistance, clubDistances, lieType);
  const club = clubSelection.primary?.club || selectDefaultClub(targetDistance);
  const clubDistance = clubDistances[club] || targetDistance;

  // Calculate where ball will actually land (club-centric)
  const reachInfo = calculateClubEffectiveReach(
    clubDistance,
    weather,
    holeBearing,
    fromPosition.elevation,
    toPosition?.elevation
  );

  // Calculate dispersion (use measured stats when available)
  const measuredStats = getMeasuredStats ? getMeasuredStats(club) : null;
  const dispersion = calculateDispersion(club, clubDistances, handicap, measuredStats);

  // Get avoid zones
  const avoidZones = getAvoidZones(fromPosition, toPosition, polygons);

  // Calculate safe zone (for green approach)
  const safeZone = calculateSafeZone(toPosition, dispersion.radius, polygons);

  const rawDistance = reachInfo.effectiveReach;
  // Compute "plays like" using same method as tap marker
  const playingLike = computePlayingLikeDistance(
    Math.round(rawDistance),
    weather,
    holeBearing,
    fromPosition.elevation,
    toPosition?.elevation
  );
  const effectiveDistance = Math.round(playingLike.effectiveDistance);

  return {
    shotNumber,
    club: formatClubName(club),
    distance: rawDistance,
    effectiveDistance: effectiveDistance,
    expectedDistance: rawDistance,
    landingZone: {
      latitude: toPosition?.latitude || 0,
      longitude: toPosition?.longitude || 0,
      description: 'Center of green',
    },
    target: 'Center of green - safe two-putt position',
    safeZone: {
      latitude: safeZone.position?.latitude || 0,
      longitude: safeZone.position?.longitude || 0,
      direction: safeZone.direction || 'center',
      description: safeZone.description || 'Safe zone',
    },
    avoidZones: avoidZones || [],
    dispersionRadius: dispersion.radius || 15,
    adjustments: reachInfo.adjustments,
    confidence: clubSelection.primary?.confidence || 'medium',
    reasoning: generateShotReasoning('approach', club, rawDistance, effectiveDistance, avoidZones, null, reachInfo.adjustments),
    nextShotDistance: 0, // On green
  };
}

/**
 * Build a layup shot
 *
 * DISTANCE-CENTRIC APPROACH (aligned with tap marker):
 * - rawDistance = where ball lands (effective reach with conditions)
 * - effectiveDistance = "plays like" distance (GPS distance adjusted for conditions)
 */
function buildLayupShot({
  shotNumber,
  fromPosition,
  targetZone,
  polygons,
  clubDistances,
  handicap,
  weather,
  holeBearing,
  green,
  getMeasuredStats,
}) {
  const targetDistance = calculateDistance(fromPosition, targetZone.position);
  const distanceToGreen = calculateDistance(targetZone.position, green);

  // Select club based on target distance
  const clubSelection = selectClubsForDistance(targetDistance, clubDistances, 'fairway');
  const club = clubSelection.primary?.club || '5_iron';
  const clubDistance = clubDistances[club] || targetDistance;

  // Calculate where ball will actually land (club-centric)
  const reachInfo = calculateClubEffectiveReach(
    clubDistance,
    weather,
    holeBearing,
    fromPosition.elevation,
    targetZone.position?.elevation
  );

  // Calculate dispersion (use measured stats when available)
  const measuredStats = getMeasuredStats ? getMeasuredStats(club) : null;
  const dispersion = calculateDispersion(club, clubDistances, handicap, measuredStats);

  // Get avoid zones
  const avoidZones = getAvoidZones(fromPosition, targetZone.position, polygons);

  // Calculate safe zone
  const safeZone = calculateSafeZone(targetZone.position, dispersion.radius, polygons);

  // Check for awkward distance
  const awkwardCheck = detectAwkwardDistance(distanceToGreen, clubDistances);

  const rawDistance = reachInfo.effectiveReach;
  // Compute "plays like" using same method as tap marker
  const playingLike = computePlayingLikeDistance(
    Math.round(rawDistance),
    weather,
    holeBearing,
    fromPosition.elevation,
    targetZone.position?.elevation
  );
  const effectiveDistance = Math.round(playingLike.effectiveDistance);

  return {
    shotNumber,
    club: formatClubName(club),
    distance: rawDistance,
    effectiveDistance: effectiveDistance,
    expectedDistance: rawDistance,
    landingZone: {
      latitude: targetZone.position?.latitude || 0,
      longitude: targetZone.position?.longitude || 0,
      description: `Layup zone - ${Math.round(distanceToGreen)} yards to green`,
    },
    target: `Layup to ${Math.round(distanceToGreen)} yards`,
    safeZone: {
      latitude: safeZone.position?.latitude || 0,
      longitude: safeZone.position?.longitude || 0,
      direction: safeZone.direction || 'center',
      description: safeZone.description || 'Safe zone',
    },
    avoidZones: avoidZones || [],
    dispersionRadius: dispersion.radius || 15,
    adjustments: reachInfo.adjustments,
    confidence: clubSelection.primary?.confidence || 'medium',
    reasoning: generateShotReasoning('layup', club, rawDistance, effectiveDistance, avoidZones, distanceToGreen, reachInfo.adjustments),
    nextShotDistance: Math.round(distanceToGreen),
    awkwardWarning: awkwardCheck.isAwkward ? awkwardCheck.description : null,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate all adjustments for a shot
 */
function calculateShotAdjustments(baseDistance, weather, shotBearing) {
  const wind = calculateWindAdjustment(
    baseDistance,
    weather?.windSpeed || 0,
    weather?.windDirection || 'N',
    shotBearing
  );

  const temp = calculateTemperatureAdjustment(
    wind.adjustedDistance,
    weather?.temperature
  );

  // Note: Elevation would need elevation data passed in
  const effectiveDistance = temp.adjustedDistance;

  return {
    baseDistance,
    effectiveDistance,
    wind: {
      distanceEffect: wind.distanceEffect,
      aimOffsetYards: wind.aimOffsetYards,
      aimDirection: wind.aimDirection,
      description: wind.description,
    },
    temperature: {
      distanceEffect: temp.distanceEffect,
      description: temp.description,
    },
  };
}

/**
 * Find best club for a given distance
 */
function findBestClubForDistance(distance, clubDistances) {
  if (!clubDistances) return 'driver';

  const clubs = Object.entries(clubDistances)
    .sort((a, b) => b[1] - a[1]); // Sort by distance descending

  for (const [club, clubDist] of clubs) {
    if (clubDist >= distance) {
      return club;
    }
  }

  return clubs[0]?.[0] || 'driver';
}

/**
 * Select default club based on distance
 */
function selectDefaultClub(distance) {
  if (distance <= 100) return 'pw';
  if (distance <= 120) return 'pw';
  if (distance <= 140) return '9_iron';
  if (distance <= 155) return '8_iron';
  if (distance <= 170) return '7_iron';
  if (distance <= 185) return '6_iron';
  if (distance <= 200) return '5_iron';
  if (distance <= 220) return '4_hybrid';
  if (distance <= 240) return '3_wood';
  return 'driver';
}

/**
 * Format club name for display
 */
function formatClubName(clubId) {
  if (!clubId) return '';

  // Handle wedge notation
  if (clubId.startsWith('w_')) {
    return `${clubId.slice(2)}° Wedge`;
  }

  // Handle common abbreviations
  const clubNames = {
    pw: 'Pitching Wedge',
    gw: 'Gap Wedge',
    sw: 'Sand Wedge',
    lw: 'Lob Wedge',
  };

  if (clubNames[clubId.toLowerCase()]) {
    return clubNames[clubId.toLowerCase()];
  }

  return clubId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Generate target description based on zone and hazards
 */
function generateTargetDescription(targetZone, avoidZones) {
  const parts = [];

  if (targetZone.description) {
    parts.push(targetZone.description);
  }

  if (avoidZones && avoidZones.length > 0) {
    const hazard = avoidZones[0];
    parts.push(`Avoid ${hazard.type} ${hazard.direction}`);
  }

  return parts.join(' - ') || 'Center of fairway';
}

/**
 * Generate reasoning for a shot
 * Note: Playing distance, wind aim, and hazards are shown separately in the UI,
 * so this provides supplementary strategic context only.
 *
 * @param {string} shotType - 'tee', 'approach', or 'layup'
 * @param {string} _club - Club name (unused, shown in header)
 * @param {number} _rawDistance - Actual GPS distance (unused, shown in header)
 * @param {number} _effectiveDistance - "Plays like" distance (unused, shown in UI)
 * @param {Array} _avoidZones - Hazards to avoid (unused, shown as warnings)
 * @param {number} nextDistance - Distance for next shot
 * @param {Object} _adjustments - Wind/temp adjustments (unused, shown in UI)
 */
function generateShotReasoning(shotType, _club, _rawDistance, _effectiveDistance, _avoidZones, nextDistance = null, _adjustments = null) {
  // The UI shows: target, plays-like distance, wind aim, and hazard warnings
  // Reasoning provides a brief strategic note
  if (shotType === 'approach') {
    return 'Aim for center of green';
  }

  // For layup shots, indicate the strategic purpose
  if (shotType === 'layup' && nextDistance) {
    if (nextDistance >= 80 && nextDistance <= 120) {
      return 'Sets up comfortable wedge approach';
    } else if (nextDistance < 80) {
      return 'Short pitch to follow';
    }
  }

  return 'Good position for next shot';
}

/**
 * Create error plan when computation fails
 */
function createErrorPlan(errorMessage) {
  return {
    shots: [],
    strategy: 'smart',
    targetScore: 0,
    riskAssessment: {
      mainThreat: 'Unknown',
      worstCase: 'Unable to compute plan',
      bailout: 'Play conservatively',
    },
    error: errorMessage,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildShotSequence,
  calculateShotAdjustments,
  formatClubName,
};
