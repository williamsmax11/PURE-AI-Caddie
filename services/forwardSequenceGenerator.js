/**
 * Forward Sequence Generator
 *
 * Generates shot sequences using forward planning (tee to green).
 * This replaces the backward planning approach with a more realistic
 * constraint-based forward planning algorithm.
 *
 * Algorithm:
 * 1. Generate all valid tee shot options
 * 2. For each tee shot, generate valid subsequent shots
 * 3. Score each complete sequence
 * 4. Return top sequences sorted by score
 */

import { calculateDistance, calculateBearing } from '../utils/geoUtils';
import {
  calculateWindAdjustment,
  calculateTemperatureAdjustment,
  calculateElevationAdjustment,
  calculateClubEffectiveReach,
  calculateFairwayCenterlineTarget,
  calculateFairwayWidthAtDistance,
} from './shotCalculations';
import {
  projectPoint,
  calculateLandingZone,
  checkHazardConflicts,
  calculateSafeZone,
  getAvoidZones,
  applyHazardBiasToTarget,
  analyzeHazardsAlongShotLine,
  calculateSafeGreenTarget,
} from './landingZoneCalculator';
import { calculateDispersion } from './dispersionCalculator';
import { scoreShot, scoreSequence, isInFairway } from './shotScorer';
import { DEFAULT_SCORING_CONFIG } from './scoringConfig';

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Generate all valid forward sequences for a hole
 *
 * @param {Object} holeData - Hole information
 *   @param {number} holeData.par - Hole par (3, 4, or 5)
 *   @param {Object} holeData.teeBox - Tee box GPS { latitude, longitude }
 *   @param {Object} holeData.green - Green center GPS { latitude, longitude }
 *   @param {Array} holeData.polygons - Course polygons
 *
 * @param {Object} playerContext - Player information
 *   @param {Object} playerContext.position - Current position (or null for tee)
 *   @param {Object} playerContext.clubDistances - Club distances { clubId: yards }
 *   @param {number} playerContext.handicap - Player handicap
 *   @param {string} playerContext.lieType - Current lie type
 *   @param {string} playerContext.bestArea - Player's strength area
 *   @param {string} playerContext.worstArea - Player's weakness area
 *
 * @param {Object} weather - Weather conditions
 *   @param {number} weather.windSpeed - Wind speed in mph
 *   @param {string} weather.windDirection - Wind direction
 *   @param {number} weather.temperature - Temperature in Fahrenheit
 *
 * @param {Object} config - Scoring configuration (optional)
 *
 * @returns {Array<Object>} Array of scored sequences sorted by totalScore
 */
export function generateForwardSequences(holeData, playerContext, weather = {}, config = DEFAULT_SCORING_CONFIG) {
  const { par, teeBox, green, polygons } = holeData;
  const { position, clubDistances, handicap = 15, lieType = 'tee' } = playerContext;

  // Determine starting position
  const startPosition = position || teeBox;
  if (!startPosition || !green) {
    return [];
  }

  // Calculate total distance
  const totalDistance = calculateDistance(startPosition, green);
  const holeBearing = calculateBearing(startPosition, green);

  // Determine if we're starting from tee
  const isFromTee = !position || (teeBox && calculateDistance(position, teeBox) < 10);

  // Generate sequences based on par
  let sequences = [];

  if (par === 3) {
    sequences = buildPar3Sequences({
      startPosition,
      green,
      polygons,
      clubDistances,
      handicap,
      lieType: isFromTee ? 'tee' : lieType,
      weather,
      holeBearing,
      playerContext,
      config,
    });
  } else if (par === 4) {
    sequences = buildPar4Sequences({
      startPosition,
      green,
      polygons,
      clubDistances,
      handicap,
      lieType: isFromTee ? 'tee' : lieType,
      weather,
      holeBearing,
      totalDistance,
      playerContext,
      config,
    });
  } else if (par === 5) {
    sequences = buildPar5Sequences({
      startPosition,
      green,
      polygons,
      clubDistances,
      handicap,
      lieType: isFromTee ? 'tee' : lieType,
      weather,
      holeBearing,
      totalDistance,
      playerContext,
      config,
    });
  }

  // Sort by total score (highest = best)
  sequences.sort((a, b) => b.totalScore - a.totalScore);

  return sequences;
}

// ============================================================================
// SEQUENCE BUILDERS BY PAR
// ============================================================================

/**
 * Build sequences for Par 3 holes (1 shot to green)
 *
 * CLUB-CENTRIC APPROACH:
 * 1. Calculate raw GPS distance to green (target)
 * 2. For each club, calculate where the ball will ACTUALLY land (effective reach)
 * 3. Select clubs whose effective reach covers the target
 * 4. rawDistance = effective reach (where ball lands)
 * 5. effectiveDistance = "plays like" distance (GPS distance adjusted for conditions)
 */
function buildPar3Sequences({
  startPosition,
  green,
  polygons,
  clubDistances,
  handicap,
  lieType,
  weather,
  holeBearing,
  playerContext,
  config,
}) {
  const sequences = [];
  const targetDistance = calculateDistance(startPosition, green);

  // Pre-compute hazard ranges from tee to green (for flight path penalties)
  const hazardRanges = analyzeHazardsAlongShotLine(startPosition, green, polygons);

  console.log(`[Par3] === SHOT CALCULATION (CLUB-CENTRIC) ===`);
  console.log(`[Par3] Target distance: ${Math.round(targetDistance)} yds (raw GPS to green)`);
  console.log(`[Par3] Weather: wind=${weather?.windSpeed || 0}mph ${weather?.windDirection || 'N/A'}, temp=${weather?.temperature || 'N/A'}°F`);
  console.log(`[Par3] Elevation: start=${startPosition.elevation ?? 'undefined'}, green=${green.elevation ?? 'undefined'}`);

  // Get valid clubs based on RAW target distance
  // The function calculates each club's effective reach and filters accordingly
  const validClubs = getValidClubsForShot(
    'approach',
    lieType,
    targetDistance,  // RAW distance (where we want ball to land)
    clubDistances,
    weather,
    holeBearing,
    { player: startPosition.elevation, target: green.elevation }
  );

  // Calculate safe green target (aim for part of green away from hazards)
  const safeGreenTarget = calculateSafeGreenTarget(green, startPosition, polygons, 0);

  for (const [club, clubDistance, effectiveReach, clubAdjustments] of validClubs) {
    console.log(`[Par3] Club ${club}: ${clubDistance} yd club → reaches ${effectiveReach} yds (target: ${Math.round(targetDistance)} yds)`);

    // Calculate dispersion for this club
    const dispersion = calculateDispersion(club, clubDistances, handicap);

    // Check hazard conflicts at the safe green target
    const hazardCheck = checkHazardConflicts(safeGreenTarget, polygons, dispersion.radius);
    const hazardConflicts = hazardCheck.conflicts.map(c => ({
      type: c.hazard?.type,
      name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
      overlapPercentage: c.type === 'inside' ? 100 : 50,
    }));

    // Get avoid zones
    const avoidZones = getAvoidZones(startPosition, safeGreenTarget, polygons);

    // Calculate safe zone
    const safeZone = calculateSafeZone(safeGreenTarget, dispersion.radius, polygons);

    // Calculate club utilization (effective reach vs club distance)
    const clubUtilization = effectiveReach / clubDistance;

    const shotOption = {
      shotNumber: 1,
      club,
      clubDistance,
      rawDistance: effectiveReach,      // Where ball lands (with conditions)
      effectiveDistance: clubDistance,   // Will be recomputed in formatShotForOutput
      targetDistance,                   // Original GPS distance to target
      distanceRemaining: 0, // On green
      startPosition,
      startElevation: startPosition.elevation,
      landingZone: safeGreenTarget,
      dispersionRadius: dispersion.radius,
      hazardConflicts,
      safeZone,
      avoidZones,
      adjustments: clubAdjustments,
      isApproach: true,
      hazardRanges,                    // For flight path penalty (carry over hazards)
    };

    // Score the shot
    const { score, breakdown } = scoreShot(
      shotOption,
      playerContext,
      { polygons, greenDepth: 30 },
      config
    );

    // Create sequence
    sequences.push({
      sequenceId: club,
      shots: [formatShotForOutput(shotOption, breakdown, weather, holeBearing)],
      totalScore: score,
      shotCount: 1,
      strategyType: deriveStrategyType(score, clubUtilization, hazardConflicts),
      summary: generateSequenceSummary([shotOption]),
    });
  }

  return sequences;
}

/**
 * Build sequences for Par 4 holes (2 shots: tee + approach)
 *
 * CLUB-CENTRIC APPROACH:
 * 1. For each tee club, calculate where ball will land (effective reach)
 * 2. Calculate remaining distance from actual landing spot
 * 3. For approach, select clubs whose effective reach covers the remaining distance
 */
function buildPar4Sequences({
  startPosition,
  green,
  polygons,
  clubDistances,
  handicap,
  lieType,
  weather,
  holeBearing,
  totalDistance,
  playerContext,
  config,
}) {
  const sequences = [];
  const reverseBearing = (holeBearing + 180) % 360;

  // Pre-compute hazard distance ranges along the shot corridor
  const hazardRanges = analyzeHazardsAlongShotLine(startPosition, green, polygons);

  // Get valid tee shot clubs with effective reach calculated
  const teeLieType = lieType === 'tee' ? 'tee' : lieType;
  const teeClubs = getValidClubsForShot(
    'tee',
    teeLieType,
    totalDistance,
    clubDistances,
    weather,
    holeBearing,
    { player: startPosition.elevation, target: startPosition.elevation }
  );

  for (const [teeClub, teeClubDistance, teeEffectiveReach, teeAdjustments] of teeClubs) {
    // Calculate tee shot landing zone
    const teeDispersion = calculateDispersion(teeClub, clubDistances, handicap);

    console.log(`[Par4] === TEE SHOT: ${teeClub} (CLUB-CENTRIC) ===`);
    console.log(`[Par4] Club: ${teeClubDistance} yds → reaches ${teeEffectiveReach} yds`);
    console.log(`[Par4] Adjustments: wind=${teeAdjustments?.wind ?? 0}, temp=${teeAdjustments?.temperature ?? 0}, elev=${teeAdjustments?.elevation ?? 0}`);

    // Use fairway centerline targeting (follows doglegs instead of straight line)
    let teeLandingPosition = calculateFairwayCenterlineTarget(startPosition, teeEffectiveReach, green, polygons);

    // Apply hazard bias (push target away from nearby hazards, especially penalty hazards)
    teeLandingPosition = applyHazardBiasToTarget(teeLandingPosition, startPosition, polygons, teeDispersion.radius);

    // Calculate landing zone with hazard avoidance (existing lateral adjustment)
    const teeLandingZone = calculateLandingZone(
      green,
      totalDistance - teeEffectiveReach,
      reverseBearing,
      polygons,
      teeDispersion.radius
    );

    // Use centerline-targeted position, fall back to landing zone if needed
    const teeLanding = teeLandingPosition || teeLandingZone.position;

    // Calculate distance remaining after tee shot (from actual landing spot)
    const distanceAfterTee = calculateDistance(teeLanding, green);

    // Check if tee shot lands in fairway
    const teeLandsInFairway = isInFairway(teeLanding, polygons);
    const expectedLie = teeLandsInFairway ? 'fairway' : 'rough';

    // Check hazard conflicts for tee shot
    const teeHazardCheck = checkHazardConflicts(teeLanding, polygons, teeDispersion.radius);
    const teeHazardConflicts = teeHazardCheck.conflicts.map(c => ({
      type: c.hazard?.type,
      name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
      overlapPercentage: c.type === 'inside' ? 100 : 50,
    }));

    // Get avoid zones for tee shot
    const teeAvoidZones = getAvoidZones(startPosition, teeLanding, polygons);

    // Calculate fairway width at this landing distance
    const fairwayWidth = calculateFairwayWidthAtDistance(startPosition, teeEffectiveReach, green, polygons);

    // Analyze hazards from landing zone to green (what the next shot will face)
    const nextShotHazardRanges = analyzeHazardsAlongShotLine(teeLanding, green, polygons);

    const teeShot = {
      shotNumber: 1,
      club: teeClub,
      clubDistance: teeClubDistance,
      rawDistance: teeEffectiveReach,       // Where ball lands (with conditions)
      effectiveDistance: teeClubDistance,   // Will be recomputed in formatShotForOutput
      targetDistance: totalDistance,
      distanceRemaining: distanceAfterTee,
      startPosition,
      startElevation: startPosition.elevation,
      landingZone: teeLanding,
      dispersionRadius: teeDispersion.radius,
      hazardConflicts: teeHazardConflicts,
      avoidZones: teeAvoidZones,
      adjustments: teeAdjustments,
      isApproach: false,
      expectedLie,
      fairwayWidth,              // For fairway width scoring
      hazardRanges,              // For distance-based hazard avoidance scoring
      nextShotHazardRanges,      // For next-shot-over-hazard penalty
    };

    console.log(`[Par4] === APPROACH after ${teeClub} (CLUB-CENTRIC) ===`);
    console.log(`[Par4] Target distance to green: ${Math.round(distanceAfterTee)} yds (raw GPS)`);

    // Calculate safe green target (aim for part of green away from hazards)
    const safeGreenTarget = calculateSafeGreenTarget(green, teeLanding, polygons, 0);

    // Get approach clubs - pass RAW distance and let function calculate effective reach
    const approachClubs = getValidClubsForShot(
      'approach',
      expectedLie,
      distanceAfterTee,  // RAW distance to target
      clubDistances,
      weather,
      holeBearing,
      { player: teeLanding.elevation, target: green.elevation }
    );

    for (const [approachClub, approachClubDistance, approachEffectiveReach, approachAdjustments] of approachClubs) {
      console.log(`[Par4] SELECTED: ${approachClub} (${approachClubDistance} yd club → reaches ${approachEffectiveReach} yds) for ${Math.round(distanceAfterTee)} yd target`);

      // Calculate approach dispersion
      const approachDispersion = calculateDispersion(approachClub, clubDistances, handicap);

      // Check hazard conflicts for approach at safe green target
      const approachHazardCheck = checkHazardConflicts(safeGreenTarget, polygons, approachDispersion.radius);
      const approachHazardConflicts = approachHazardCheck.conflicts.map(c => ({
        type: c.hazard?.type,
        name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
        overlapPercentage: c.type === 'inside' ? 100 : 50,
      }));

      // Get avoid zones for approach
      const approachAvoidZones = getAvoidZones(teeLanding, safeGreenTarget, polygons);

      // Calculate safe zone for approach
      const approachSafeZone = calculateSafeZone(safeGreenTarget, approachDispersion.radius, polygons);

      const approachShot = {
        shotNumber: 2,
        club: approachClub,
        clubDistance: approachClubDistance,
        rawDistance: approachEffectiveReach,       // Where ball lands (with conditions)
        effectiveDistance: approachClubDistance,   // Will be recomputed in formatShotForOutput
        targetDistance: distanceAfterTee,
        distanceRemaining: 0,
        startPosition: teeLanding,
        startElevation: teeLanding.elevation,
        landingZone: safeGreenTarget,
        dispersionRadius: approachDispersion.radius,
        hazardConflicts: approachHazardConflicts,
        safeZone: approachSafeZone,
        avoidZones: approachAvoidZones,
        adjustments: approachAdjustments,
        isApproach: true,
        hazardRanges: nextShotHazardRanges,       // For flight path penalty (carry over hazards)
      };

      // Score the sequence
      const { totalScore, shotScores } = scoreSequence(
        [teeShot, approachShot],
        playerContext,
        { polygons, greenDepth: 30 },
        config
      );

      // Create sequence
      console.log(`[Par4] SEQUENCE: ${teeClub} → ${approachClub}, Score: ${Math.round(totalScore)}`);
      sequences.push({
        sequenceId: `${teeClub}-${approachClub}`,
        shots: [
          formatShotForOutput(teeShot, shotScores[0]?.breakdown, weather, holeBearing),
          formatShotForOutput(approachShot, shotScores[1]?.breakdown, weather, holeBearing),
        ],
        totalScore,
        shotCount: 2,
        strategyType: deriveStrategyType(totalScore, teeClubDistance / totalDistance, teeHazardConflicts),
        summary: generateSequenceSummary([teeShot, approachShot]),
      });
    }
  }

  console.log(`[Par4] Total sequences generated: ${sequences.length}`);
  return sequences;
}

/**
 * Build sequences for Par 5 holes (2 or 3 shots)
 *
 * CLUB-CENTRIC APPROACH:
 * 1. For each club, calculate where ball will land (effective reach)
 * 2. Calculate remaining distance from actual landing spots
 * 3. Select clubs whose effective reach covers the target
 */
function buildPar5Sequences({
  startPosition,
  green,
  polygons,
  clubDistances,
  handicap,
  lieType,
  weather,
  holeBearing,
  totalDistance,
  playerContext,
  config,
}) {
  const sequences = [];
  const reverseBearing = (holeBearing + 180) % 360;

  // Pre-compute hazard distance ranges along the shot corridor
  const hazardRanges = analyzeHazardsAlongShotLine(startPosition, green, polygons);

  // Get player's longest club distance
  const maxClubDistance = Math.max(...Object.values(clubDistances));

  // Can player reach in 2? (needs to cover total distance with 2 shots)
  const canReachInTwo = maxClubDistance * 2 >= totalDistance;

  // Get valid tee shot clubs with effective reach calculated
  const teeLieType = lieType === 'tee' ? 'tee' : lieType;
  const teeClubs = getValidClubsForShot(
    'tee',
    teeLieType,
    totalDistance,
    clubDistances,
    weather,
    holeBearing,
    { player: startPosition.elevation, target: startPosition.elevation }
  );

  for (const [teeClub, teeClubDistance, teeEffectiveReach, teeAdjustments] of teeClubs) {
    const teeDispersion = calculateDispersion(teeClub, clubDistances, handicap);

    console.log(`[Par5] === TEE SHOT: ${teeClub} (CLUB-CENTRIC) ===`);
    console.log(`[Par5] Club: ${teeClubDistance} yds → reaches ${teeEffectiveReach} yds`);

    // Use fairway centerline targeting (follows doglegs instead of straight line)
    let teeLandingPosition = calculateFairwayCenterlineTarget(startPosition, teeEffectiveReach, green, polygons);

    // Apply hazard bias (push target away from nearby hazards, especially penalty hazards)
    teeLandingPosition = applyHazardBiasToTarget(teeLandingPosition, startPosition, polygons, teeDispersion.radius);

    // Calculate landing zone with hazard avoidance (existing lateral adjustment)
    const teeLandingZone = calculateLandingZone(
      green,
      totalDistance - teeEffectiveReach,
      reverseBearing,
      polygons,
      teeDispersion.radius
    );

    // Use centerline-targeted position, fall back to landing zone if needed
    const teeLanding = teeLandingPosition || teeLandingZone.position;
    const distanceAfterTee = calculateDistance(teeLanding, green);
    const teeLandsInFairway = isInFairway(teeLanding, polygons);
    const expectedLieAfterTee = teeLandsInFairway ? 'fairway' : 'rough';

    // Tee shot hazard conflicts
    const teeHazardCheck = checkHazardConflicts(teeLanding, polygons, teeDispersion.radius);
    const teeHazardConflicts = teeHazardCheck.conflicts.map(c => ({
      type: c.hazard?.type,
      name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
      overlapPercentage: c.type === 'inside' ? 100 : 50,
    }));

    const teeAvoidZones = getAvoidZones(startPosition, teeLanding, polygons);

    // Calculate fairway width at this landing distance
    const fairwayWidth = calculateFairwayWidthAtDistance(startPosition, teeEffectiveReach, green, polygons);

    // Analyze hazards from landing zone to green (what the next shot will face)
    const nextShotHazardRanges = analyzeHazardsAlongShotLine(teeLanding, green, polygons);

    const teeShot = {
      shotNumber: 1,
      club: teeClub,
      clubDistance: teeClubDistance,
      rawDistance: teeEffectiveReach,       // Where ball lands (with conditions)
      effectiveDistance: teeClubDistance,   // Will be recomputed in formatShotForOutput
      targetDistance: totalDistance,
      distanceRemaining: distanceAfterTee,
      startPosition,
      startElevation: startPosition.elevation,
      landingZone: teeLanding,
      dispersionRadius: teeDispersion.radius,
      hazardConflicts: teeHazardConflicts,
      avoidZones: teeAvoidZones,
      adjustments: teeAdjustments,
      isApproach: false,
      expectedLie: expectedLieAfterTee,
      fairwayWidth,              // For fairway width scoring
      hazardRanges,              // For distance-based hazard avoidance scoring
      nextShotHazardRanges,      // For next-shot-over-hazard penalty
    };

    // ============================================
    // Path A: Going for it in 2 (aggressive)
    // ============================================
    if (canReachInTwo) {
      console.log(`[Par5] === GO FOR IT after ${teeClub} (CLUB-CENTRIC) ===`);
      console.log(`[Par5] Target distance to green: ${Math.round(distanceAfterTee)} yds`);

      // Calculate safe green target for aggressive approach
      const goForItGreenTarget = calculateSafeGreenTarget(green, teeLanding, polygons, 0);

      // Get approach clubs - pass RAW distance and let function calculate effective reach
      const goingForItClubs = getValidClubsForShot(
        'approach',
        expectedLieAfterTee,
        distanceAfterTee,  // RAW distance to target
        clubDistances,
        weather,
        holeBearing,
        { player: teeLanding.elevation, target: green.elevation }
      );

      for (const [approachClub, approachClubDistance, approachEffectiveReach, approachAdjustments] of goingForItClubs) {
        console.log(`[Par5] SELECTED: ${approachClub} (${approachClubDistance} yd club → reaches ${approachEffectiveReach} yds)`);

        const approachDispersion = calculateDispersion(approachClub, clubDistances, handicap);
        const approachHazardCheck = checkHazardConflicts(goForItGreenTarget, polygons, approachDispersion.radius);
        const approachHazardConflicts = approachHazardCheck.conflicts.map(c => ({
          type: c.hazard?.type,
          name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
          overlapPercentage: c.type === 'inside' ? 100 : 50,
        }));

        const approachAvoidZones = getAvoidZones(teeLanding, goForItGreenTarget, polygons);
        const approachSafeZone = calculateSafeZone(goForItGreenTarget, approachDispersion.radius, polygons);

        const approachShot = {
          shotNumber: 2,
          club: approachClub,
          clubDistance: approachClubDistance,
          rawDistance: approachEffectiveReach,       // Where ball lands
          effectiveDistance: approachClubDistance,   // Will be recomputed in formatShotForOutput
          targetDistance: distanceAfterTee,
          distanceRemaining: 0,
          startPosition: teeLanding,
          startElevation: teeLanding.elevation,
          landingZone: goForItGreenTarget,
          dispersionRadius: approachDispersion.radius,
          hazardConflicts: approachHazardConflicts,
          safeZone: approachSafeZone,
          avoidZones: approachAvoidZones,
          adjustments: approachAdjustments,
          isApproach: true,
          hazardRanges: nextShotHazardRanges,       // For flight path penalty (carry over hazards)
        };

        const { totalScore, shotScores } = scoreSequence(
          [teeShot, approachShot],
          playerContext,
          { polygons, greenDepth: 30 },
          config
        );

        sequences.push({
          sequenceId: `${teeClub}-${approachClub}-go`,
          shots: [
            formatShotForOutput(teeShot, shotScores[0]?.breakdown, weather, holeBearing),
            formatShotForOutput(approachShot, shotScores[1]?.breakdown, weather, holeBearing),
          ],
          totalScore,
          shotCount: 2,
          strategyType: 'aggressive',
          summary: generateSequenceSummary([teeShot, approachShot]),
        });
      }
    }

    // ============================================
    // Path B: Layup strategy (3 shots)
    // ============================================
    const layupOptions = generateLayupOptions(teeLanding, distanceAfterTee, clubDistances, playerContext);

    // Pre-compute hazard ranges from tee landing position for layup shots
    const layupHazardRanges = analyzeHazardsAlongShotLine(teeLanding, green, polygons);

    for (const layupOption of layupOptions) {
      const { club: layupClub, clubDistance: layupClubDistance } = layupOption;

      const layupDispersion = calculateDispersion(layupClub, clubDistances, handicap);

      // Calculate layup effective reach using club-centric approach
      const layupReachInfo = calculateClubEffectiveReach(
        layupClubDistance,
        weather,
        holeBearing,
        teeLanding.elevation,
        teeLanding.elevation // Approximate target elevation
      );
      const layupEffectiveReach = layupReachInfo.effectiveReach;

      // Use fairway centerline targeting for layup (follows doglegs)
      let layupLandingPosition = calculateFairwayCenterlineTarget(teeLanding, layupEffectiveReach, green, polygons);

      // Apply hazard bias to layup target
      layupLandingPosition = applyHazardBiasToTarget(layupLandingPosition, teeLanding, polygons, layupDispersion.radius);

      const distanceAfterLayup = calculateDistance(layupLandingPosition, green);

      // Check if layup lands in fairway
      const layupLandsInFairway = isInFairway(layupLandingPosition, polygons);
      const expectedLieAfterLayup = layupLandsInFairway ? 'fairway' : 'rough';

      // Layup hazard conflicts
      const layupHazardCheck = checkHazardConflicts(layupLandingPosition, polygons, layupDispersion.radius);
      const layupHazardConflicts = layupHazardCheck.conflicts.map(c => ({
        type: c.hazard?.type,
        name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
        overlapPercentage: c.type === 'inside' ? 100 : 50,
      }));

      const layupAvoidZones = getAvoidZones(teeLanding, layupLandingPosition, polygons);

      // Calculate fairway width at layup landing distance
      const layupFairwayWidth = calculateFairwayWidthAtDistance(teeLanding, layupEffectiveReach, green, polygons);

      // Analyze hazards from layup landing to green (what the final approach will face)
      const layupNextShotHazardRanges = analyzeHazardsAlongShotLine(layupLandingPosition, green, polygons);

      const layupShot = {
        shotNumber: 2,
        club: layupClub,
        clubDistance: layupClubDistance,
        rawDistance: layupEffectiveReach,       // Where ball lands
        effectiveDistance: layupClubDistance,   // Will be recomputed in formatShotForOutput
        targetDistance: distanceAfterTee,
        distanceRemaining: distanceAfterLayup,
        startPosition: teeLanding,
        startElevation: teeLanding.elevation,
        landingZone: layupLandingPosition,
        dispersionRadius: layupDispersion.radius,
        hazardConflicts: layupHazardConflicts,
        avoidZones: layupAvoidZones,
        adjustments: layupReachInfo.adjustments,
        isApproach: false,
        expectedLie: expectedLieAfterLayup,
        fairwayWidth: layupFairwayWidth,     // For fairway width scoring
        hazardRanges: layupHazardRanges,     // For distance-based hazard avoidance
        nextShotHazardRanges: layupNextShotHazardRanges,  // For next-shot-over-hazard penalty
      };

      // Generate final approach from layup position
      console.log(`[Par5] === FINAL APPROACH after layup (CLUB-CENTRIC) ===`);
      console.log(`[Par5] Target distance to green: ${Math.round(distanceAfterLayup)} yds`);

      // Calculate safe green target for final approach (aim away from hazards)
      const finalGreenTarget = calculateSafeGreenTarget(green, layupLandingPosition, polygons, 0);

      // Get final approach clubs - pass RAW distance
      const finalApproachClubs = getValidClubsForShot(
        'approach',
        expectedLieAfterLayup,
        distanceAfterLayup,  // RAW distance to target
        clubDistances,
        weather,
        holeBearing,
        { player: layupLandingPosition.elevation, target: green.elevation }
      );

      for (const [finalClub, finalClubDistance, finalEffectiveReach, finalAdjustments] of finalApproachClubs) {

        const finalDispersion = calculateDispersion(finalClub, clubDistances, handicap);
        const finalHazardCheck = checkHazardConflicts(finalGreenTarget, polygons, finalDispersion.radius);
        const finalHazardConflicts = finalHazardCheck.conflicts.map(c => ({
          type: c.hazard?.type,
          name: c.hazard?.label || c.hazard?.name || c.hazard?.type,
          overlapPercentage: c.type === 'inside' ? 100 : 50,
        }));

        const finalAvoidZones = getAvoidZones(layupLandingPosition, finalGreenTarget, polygons);
        const finalSafeZone = calculateSafeZone(finalGreenTarget, finalDispersion.radius, polygons);

        const finalApproach = {
          shotNumber: 3,
          club: finalClub,
          clubDistance: finalClubDistance,
          rawDistance: finalEffectiveReach,       // Where ball lands
          effectiveDistance: finalClubDistance,   // Will be recomputed in formatShotForOutput
          targetDistance: distanceAfterLayup,
          distanceRemaining: 0,
          startPosition: layupLandingPosition,
          startElevation: layupLandingPosition.elevation,
          landingZone: finalGreenTarget,
          dispersionRadius: finalDispersion.radius,
          hazardConflicts: finalHazardConflicts,
          safeZone: finalSafeZone,
          avoidZones: finalAvoidZones,
          adjustments: finalAdjustments,
          isApproach: true,
          hazardRanges: layupNextShotHazardRanges,  // For flight path penalty (carry over hazards)
        };

        const { totalScore, shotScores } = scoreSequence(
          [teeShot, layupShot, finalApproach],
          playerContext,
          { polygons, greenDepth: 30 },
          config
        );

        sequences.push({
          sequenceId: `${teeClub}-${layupClub}-${finalClub}`,
          shots: [
            formatShotForOutput(teeShot, shotScores[0]?.breakdown, weather, holeBearing),
            formatShotForOutput(layupShot, shotScores[1]?.breakdown, weather, holeBearing),
            formatShotForOutput(finalApproach, shotScores[2]?.breakdown, weather, holeBearing),
          ],
          totalScore,
          shotCount: 3,
          strategyType: 'smart',
          summary: generateSequenceSummary([teeShot, layupShot, finalApproach]),
        });
      }
    }
  }

  return sequences;
}

// ============================================================================
// CLUB CONSTRAINT FUNCTIONS
// ============================================================================

/**
 * Get valid clubs for a shot type based on constraints
 *
 * CLUB-CENTRIC APPROACH (NEW):
 * - targetDistance is the RAW GPS distance (where we want ball to land)
 * - For each club, we calculate its EFFECTIVE REACH (where ball will actually land with conditions)
 * - We select clubs whose effective reach covers the target distance
 *
 * Example with 15mph headwind:
 * - Target: 160 yards (raw GPS distance to green)
 * - 7-iron (165 yds normal) → effective reach 148 yds (too short!)
 * - 6-iron (175 yds normal) → effective reach 157 yds (close but short)
 * - 5-iron (185 yds normal) → effective reach 166 yds (covers 160 ✓)
 *
 * @param {string} shotType - 'tee', 'layup', or 'approach'
 * @param {string} lieType - Current lie type
 * @param {number} targetDistance - RAW GPS distance to target (where we want ball to land)
 * @param {Object} clubDistances - Player's club distances
 * @param {Object} weather - Weather conditions { windSpeed, windDirection, temperature, courseElevation }
 * @param {number} shotBearing - Direction of shot in degrees (0-360)
 * @param {Object} elevations - { player: playerElevation, target: targetElevation }
 * @returns {Array<[string, number, number, Object]>} Array of [clubId, clubDistance, effectiveReach, adjustments]
 */
export function getValidClubsForShot(shotType, lieType, targetDistance, clubDistances, weather = null, shotBearing = 0, elevations = null) {
  if (!clubDistances) return [];

  console.log(`[ClubSelect] Getting valid clubs for ${shotType}, target: ${Math.round(targetDistance)} yds (raw GPS)`);
  if (weather) {
    console.log(`[ClubSelect] Conditions: wind=${weather.windSpeed || 0}mph ${weather.windDirection || 'calm'}, temp=${weather.temperature || 70}°F`);
  }

  const clubsWithReach = Object.entries(clubDistances).map(([club, clubDistance]) => {
    // Calculate where this club's shot will actually land with current conditions
    const reachInfo = calculateClubEffectiveReach(
      clubDistance,
      weather,
      shotBearing,
      elevations?.player,
      elevations?.target
    );

    return {
      club,
      clubDistance,
      effectiveReach: reachInfo.effectiveReach,
      adjustments: reachInfo.adjustments,
    };
  });

  const validClubs = clubsWithReach.filter(({ club, clubDistance, effectiveReach }) => {
    // RULE 1: Driver only off tee
    if (club === 'driver' && shotType !== 'tee') {
      return false;
    }

    // RULE 2: For tee shots, prefer driver but allow woods
    if (shotType === 'tee') {
      const teeClubs = ['driver', '3_wood', '5_wood', '3_hybrid', '4_hybrid', '5_hybrid', '3_iron', '4_iron'];
      if (!teeClubs.includes(club)) {
        return false;
      }
    }

    // RULE 3: No woods/hybrids from deep rough or bunkers
    if (lieType === 'bunker' || lieType === 'heavy_rough') {
      const restrictedClubs = ['driver', '3_wood', '5_wood', '7_wood', '3_hybrid', '4_hybrid'];
      if (restrictedClubs.includes(club)) {
        return false;
      }
    }

    // RULE 4: Club's EFFECTIVE REACH must cover target distance
    // This is the key change: we compare effective reach (where ball lands) to target
    if (shotType === 'approach') {
      // Club's effective reach must be able to reach the target
      // Example: 160 yd target, club reaches 148 yds = 12 short = REJECTED
      //          160 yd target, club reaches 160 yds = exact = OK
      //          160 yd target, club reaches 165 yds = 5 long = OK (grip down)
      if (effectiveReach < targetDistance - 5) {
        console.log(`[ClubSelect] REJECTED ${club} (${clubDistance} yd club → reaches ${effectiveReach} yds) - can't reach ${Math.round(targetDistance)} yd target`);
        return false;
      }
      // Club shouldn't fly way past green (max 15 yards beyond target)
      if (effectiveReach > targetDistance + 15) {
        console.log(`[ClubSelect] REJECTED ${club} (${clubDistance} yd club → reaches ${effectiveReach} yds) - too long for ${Math.round(targetDistance)} yd target`);
        return false;
      }
    }

    // RULE 5: For tee/layup shots, don't use clubs way below target distance
    // Compare effective reach to target (minimum 60% utilization)
    if (shotType !== 'approach' && effectiveReach > targetDistance * 1.67) {
      return false;
    }

    // RULE 6: Minimum distance threshold - don't recommend long clubs for short shots
    const minDistanceThresholds = {
      driver: 200,
      '3_wood': 180,
      '5_wood': 160,
      '3_hybrid': 150,
      '4_hybrid': 140,
      '5_hybrid': 130,
      '3_iron': 150,
      '4_iron': 140,
      '5_iron': 130,
    };

    const minDistance = minDistanceThresholds[club] || 0;
    if (targetDistance < minDistance) {
      return false;
    }

    return true;
  });

  // Return as array of [clubId, clubDistance, effectiveReach, adjustments]
  const result = validClubs.map(({ club, clubDistance, effectiveReach, adjustments }) =>
    [club, clubDistance, effectiveReach, adjustments]
  );

  console.log(`[ClubSelect] Valid clubs for ${Math.round(targetDistance)} yds:`,
    result.map(([c, d, r]) => `${c}(${d}yd→${r}yd)`).join(', ') || 'NONE');

  return result;
}

// ============================================================================
// LAYUP OPTION GENERATION
// ============================================================================

/**
 * Generate layup options that leave ideal approach distances
 *
 * @param {Object} fromPosition - Current position
 * @param {number} distanceToGreen - Distance to green from current position
 * @param {Object} clubDistances - Player's club distances
 * @param {Object} playerContext - Player context
 * @returns {Array<Object>} Array of layup options
 */
export function generateLayupOptions(fromPosition, distanceToGreen, clubDistances, playerContext) {
  const options = [];

  // Find player's wedge distances to determine ideal approach range
  const wedgeRange = getIdealWedgeDistance(clubDistances);

  // Ideal layup distance = distanceToGreen - idealWedgeDistance
  const idealLayupCarry = distanceToGreen - wedgeRange.sweet;

  // Find clubs that land near the ideal layup distance
  const layupClubs = ['5_iron', '6_iron', '7_iron', '8_iron', '9_iron', '5_wood', '5_hybrid', '4_hybrid'];

  for (const [club, distance] of Object.entries(clubDistances)) {
    // Skip non-layup clubs
    if (!layupClubs.some(lc => club.includes(lc))) {
      continue;
    }

    // Check if club naturally lands near ideal layup
    const diff = Math.abs(distance - idealLayupCarry);
    if (diff > 30) continue; // Too far from ideal

    const remaining = distanceToGreen - distance;

    // Skip if remaining would be awkward distance
    if (remaining >= 30 && remaining <= 60) continue;

    options.push({
      club,
      clubDistance: distance,
      targetDistance: distance,
      leavesDistance: remaining,
      isIdeal: diff < 15,
    });
  }

  // Sort by how close to ideal
  options.sort((a, b) => Math.abs(a.leavesDistance - wedgeRange.sweet) - Math.abs(b.leavesDistance - wedgeRange.sweet));

  return options.slice(0, 3); // Return top 3 options
}

/**
 * Get ideal wedge distance range for player
 *
 * @param {Object} clubDistances - Player's club distances
 * @returns {Object} { min, max, sweet }
 */
function getIdealWedgeDistance(clubDistances) {
  const wedgeClubs = Object.entries(clubDistances)
    .filter(([club]) => {
      return club.includes('w_') || club === 'pw' || club === 'gw' || club === 'sw' || club === 'lw' ||
             club === '9_iron' || club.includes('wedge');
    })
    .map(([club, distance]) => distance)
    .sort((a, b) => a - b);

  if (wedgeClubs.length === 0) {
    return { min: 80, max: 120, sweet: 100 };
  }

  return {
    min: Math.max(75, wedgeClubs[0]),
    max: Math.min(130, wedgeClubs[wedgeClubs.length - 1]),
    sweet: wedgeClubs[Math.floor(wedgeClubs.length / 2)],
  };
}

// ============================================================================
// PLAYING LIKE DISTANCE CALCULATION
// ============================================================================

/**
 * Compute playing-like distance with all adjustments
 *
 * @param {number} baseDistance - Raw GPS distance
 * @param {Object} weather - Weather conditions
 * @param {number} shotBearing - Shot bearing in degrees
 * @param {number} playerElevation - Player elevation (optional)
 * @param {number} targetElevation - Target elevation (optional)
 * @returns {Object} { effectiveDistance, adjustments }
 */
export function computePlayingLikeDistance(baseDistance, weather, shotBearing, playerElevation = null, targetElevation = null) {
  // Wind adjustment
  const wind = calculateWindAdjustment(
    baseDistance,
    weather?.windSpeed || 0,
    weather?.windDirection || 'N',
    shotBearing
  );

  // Temperature adjustment (applied to wind-adjusted distance)
  const temp = calculateTemperatureAdjustment(
    wind.adjustedDistance,
    weather?.temperature
  );

  // Elevation adjustment (applied to temp-adjusted distance)
  const elevation = calculateElevationAdjustment(
    temp.adjustedDistance,
    playerElevation,
    targetElevation,
    weather?.courseElevation || 0
  );

  return {
    effectiveDistance: elevation.adjustedDistance,
    adjustments: {
      wind,
      temperature: temp,
      elevation,
    },
  };
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

/**
 * Format a shot option for output (matches existing UI format)
 *
 * DISTANCE-CENTRIC SEMANTICS (aligned with tap marker):
 * - distance = where ball lands (effective reach with conditions)
 * - effectiveDistance = "plays like" (GPS distance adjusted for wind/temp/elevation)
 *
 * Example output: "Driver - 245 yds, plays like 268"
 * Meaning: Ball lands at 245 yards, that distance plays like 268 given conditions
 */
function formatShotForOutput(shot, breakdown, weather, holeBearing) {
  // Use actual GPS distance from start to landing zone (matches what tap marker measures)
  // shot.rawDistance is effectiveReach (theoretical), but the landing zone may have been
  // shifted by hazard avoidance / centerline targeting, so GPS distance can differ.
  const gpsDistance = (shot.startPosition && shot.landingZone?.latitude)
    ? calculateDistance(shot.startPosition, shot.landingZone)
    : Math.round(shot.rawDistance);
  const rawDist = Math.round(gpsDistance);
  const targetDist = Math.round(shot.targetDistance || shot.distanceRemaining || rawDist);

  // Compute shot bearing from actual positions (matches what tap marker computes)
  const shotBearing = (shot.startPosition && shot.landingZone?.latitude)
    ? calculateBearing(shot.startPosition, shot.landingZone)
    : holeBearing;

  // Compute "plays like" using same sequential method as tap marker
  const playingLike = computePlayingLikeDistance(
    rawDist,
    weather,
    shotBearing,
    shot.startElevation || null,
    shot.landingZone?.elevation || null
  );
  const effectiveDist = Math.round(playingLike.effectiveDistance);

  // SAFEGUARD: Log warning if ball won't reach the target
  if (shot.isApproach && rawDist < targetDist - 10) {
    console.warn(`[WARNING] ${shot.club} (${shot.clubDistance} yd club) lands at ${rawDist} yds - short of ${targetDist} yd target`);
  }

  // DEBUG: Detailed comparison log for plays-like alignment
  console.log(`[PLAN-SHOT] ===== Shot ${shot.shotNumber}: ${shot.club} =====`);
  console.log(`[PLAN-SHOT] gpsDistance: ${rawDist} (effectiveReach was: ${Math.round(shot.rawDistance)})`);
  console.log(`[PLAN-SHOT] effectiveDistance (plays like): ${effectiveDist}`);
  console.log(`[PLAN-SHOT] clubDistance: ${shot.clubDistance}`);
  console.log(`[PLAN-SHOT] shotBearing: ${shotBearing} (holeBearing was: ${holeBearing})`);
  console.log(`[PLAN-SHOT] startPosition: ${shot.startPosition?.latitude}, ${shot.startPosition?.longitude}`);
  console.log(`[PLAN-SHOT] startElevation: ${shot.startElevation || null}`);
  console.log(`[PLAN-SHOT] landingZone elevation: ${shot.landingZone?.elevation || null}`);
  console.log(`[PLAN-SHOT] landingZone lat/lng: ${shot.landingZone?.latitude}, ${shot.landingZone?.longitude}`);
  console.log(`[PLAN-SHOT] weather: wind=${weather?.windSpeed} mph ${weather?.windDirection}, temp=${weather?.temperature}°F, courseElev=${weather?.courseElevation || 0}`);
  console.log(`[PLAN-SHOT] adjustments: wind=${playingLike.adjustments?.wind?.distanceEffect}, temp=${playingLike.adjustments?.temperature?.distanceEffect}, elev=${playingLike.adjustments?.elevation?.slopeEffect}`);
  console.log(`[PLAN-SHOT] ===================================`);

  return {
    shotNumber: shot.shotNumber,
    club: formatClubName(shot.club),
    distance: rawDist,              // Actual GPS distance from start to landing
    effectiveDistance: effectiveDist,  // "Plays like" distance (same calc as tap marker)
    expectedDistance: rawDist,      // Same as distance for consistency
    landingZone: shot.landingZone,
    target: shot.isApproach ? 'Center of green' : generateTargetDescription(shot),
    safeZone: shot.safeZone || null,
    avoidZones: shot.avoidZones || [],
    dispersionRadius: shot.dispersionRadius,
    adjustments: shot.adjustments,
    confidence: calculateConfidence(shot),
    reasoning: generateReasoning(shot),
    nextShotDistance: shot.distanceRemaining,
    scoreBreakdown: breakdown,
  };
}

/**
 * Format club name for display
 */
function formatClubName(clubId) {
  if (!clubId) return '';

  if (clubId.startsWith('w_')) {
    return `${clubId.slice(2)}° Wedge`;
  }

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
 * Generate target description incorporating fairway width and hazard avoidance info
 */
function generateTargetDescription(shot) {
  if (shot.isApproach) {
    return 'Center of green - safe two-putt position';
  }

  const parts = [];
  const distance = Math.round(shot.distanceRemaining);

  // Base target
  if (distance > 0) {
    parts.push(`Leave ${distance} yards to green`);
  }

  // Add fairway width context
  if (shot.fairwayWidth && shot.fairwayWidth > 0) {
    const dispersionDiameter = (shot.dispersionRadius || 15) * 2;
    if (shot.fairwayWidth >= dispersionDiameter * 2) {
      parts.push('wide fairway');
    } else if (shot.fairwayWidth < dispersionDiameter) {
      parts.push('narrow fairway');
    }
  }

  // Add hazard avoidance context
  if (shot.hazardRanges && shot.hazardRanges.length > 0) {
    const overlapping = shot.hazardRanges.filter(hr => {
      const dispersion = (shot.dispersionRadius || 15) * 0.8;
      return (shot.rawDistance + dispersion) >= hr.frontDistance &&
             (shot.rawDistance - dispersion) <= hr.backDistance;
    });
    const cleared = shot.hazardRanges.filter(hr => {
      const dispersion = (shot.dispersionRadius || 15) * 0.8;
      return (shot.rawDistance - dispersion) > hr.backDistance ||
             (shot.rawDistance + dispersion) < hr.frontDistance;
    });
    if (cleared.length > 0 && overlapping.length === 0) {
      parts.push(`clears ${cleared[0].name}`);
    }
  }

  if (parts.length === 0) {
    return 'Center of fairway';
  }

  return parts.join(' - ');
}

/**
 * Calculate confidence level based on shot characteristics
 *
 * - rawDistance = where ball lands (effective reach)
 * - effectiveDistance = "plays like" distance
 * - Compare how close landing spot is to target
 */
function calculateConfidence(shot) {
  // Calculate how close the landing spot is to the target
  const targetDist = shot.targetDistance || shot.rawDistance;
  const landingDist = shot.rawDistance;

  // How close is the landing to the target? (1.0 = exact, > 1.0 = long, < 1.0 = short)
  const accuracy = targetDist > 0 ? landingDist / targetDist : 1.0;

  // High confidence: lands within ±5% of target, no hazards
  if (accuracy >= 0.95 && accuracy <= 1.05 && shot.hazardConflicts.length === 0) {
    return 'high';
  }

  // Medium confidence: lands within ±10% of target, minimal hazards
  if (accuracy >= 0.9 && accuracy <= 1.1 && shot.hazardConflicts.length <= 1) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate reasoning text
 * Note: Playing distance, wind aim, and hazards are shown separately in the UI,
 * so this field provides supplementary context only.
 */
function generateReasoning(shot) {
  // The UI shows: target, plays-like distance, wind aim, and hazard warnings
  // Reasoning provides a brief strategic note
  if (shot.isApproach) {
    return 'Aim for center of green';
  }

  // Check for distance-based hazard avoidance reasoning
  if (shot.hazardRanges && shot.hazardRanges.length > 0) {
    const dispersion = (shot.dispersionRadius || 15) * 0.8;
    const landingMin = shot.rawDistance - dispersion;
    const landingMax = shot.rawDistance + dispersion;

    for (const hr of shot.hazardRanges) {
      if (landingMax < hr.frontDistance && (hr.frontDistance - landingMax) < 20) {
        return `Stays short of ${hr.name}`;
      }
      if (landingMin > hr.backDistance && (landingMin - hr.backDistance) < 20) {
        return `Clears past ${hr.name}`;
      }
    }
  }

  // For layup/tee shots, indicate the strategic purpose
  if (shot.distanceRemaining > 0) {
    const remaining = Math.round(shot.distanceRemaining);
    if (remaining >= 80 && remaining <= 120) {
      return 'Sets up comfortable wedge approach';
    } else if (remaining < 80) {
      return 'Short pitch to follow';
    }
  }

  return 'Good position for next shot';
}

/**
 * Derive strategy type from sequence characteristics
 */
function deriveStrategyType(totalScore, utilizationOrDistance, hazardConflicts) {
  // High score with few hazards = aggressive worked
  if (totalScore > 30 && hazardConflicts.length === 0) {
    return 'aggressive';
  }

  // Low score with hazards = conservative needed
  if (totalScore < 0 || hazardConflicts.length > 2) {
    return 'conservative';
  }

  return 'smart';
}

/**
 * Generate sequence summary
 */
function generateSequenceSummary(shots) {
  const clubs = shots.map(s => formatClubName(s.club)).join(' → ');
  return clubs;
}
