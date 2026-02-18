/**
 * Strategy Scorer
 *
 * Evaluates and scores different strategy options for playing a hole.
 * Determines optimal approach based on player skill, hole layout, and conditions.
 */

import { calculateDistance } from '../utils/geoUtils';
import { calculateDispersion } from './dispersionCalculator';
import { checkHazardConflicts } from './landingZoneCalculator';

// ============================================================================
// STRATEGY TYPES
// ============================================================================

/**
 * Strategy definitions with their characteristics
 */
const STRATEGY_PROFILES = {
  aggressive: {
    type: 'aggressive',
    description: 'Attack the hole - maximize distance and birdie opportunities',
    riskTolerance: 0.7, // Accept 70% success rate
    distanceMultiplier: 1.0, // Use full club distances
    targetScoreOffset: -1, // Aim for birdie
    rewardMultiplier: 1.3,
    riskMultiplier: 1.5,
  },
  conservative: {
    type: 'conservative',
    description: 'Play safe - prioritize fairway and avoid trouble',
    riskTolerance: 0.9, // Require 90% success rate
    distanceMultiplier: 0.9, // Use 90% of club distance
    targetScoreOffset: 0, // Aim for par
    rewardMultiplier: 0.9,
    riskMultiplier: 0.7,
  },
  smart: {
    type: 'smart',
    description: 'Balanced approach - optimize for expected score',
    riskTolerance: 0.8, // Accept 80% success rate
    distanceMultiplier: 0.95, // Use 95% of club distance
    targetScoreOffset: 0, // Aim for par with birdie potential
    rewardMultiplier: 1.1,
    riskMultiplier: 1.0,
  },
};

// ============================================================================
// STRATEGY GENERATION
// ============================================================================

/**
 * Generate possible strategies for a hole
 *
 * @param {Object} holeData - Hole information { par, yardage, polygons, etc. }
 * @param {Object} playerContext - Player info { clubDistances, handicap, position }
 * @returns {Array} Array of strategy options with initial data
 */
export function generateStrategies(holeData, playerContext) {
  const { par, yardage } = holeData;
  const { clubDistances, handicap = 15 } = playerContext;

  const strategies = [];

  // Determine base shot count by par
  const baseShotCount = {
    3: 1, // Par 3: 1 shot to green
    4: 2, // Par 4: tee shot + approach
    5: 3, // Par 5: tee shot + layup/second + approach
  }[par] || 2;

  // Get player's longest club distance
  const maxDistance = clubDistances
    ? Math.max(...Object.values(clubDistances))
    : 250;

  // Aggressive strategy
  strategies.push({
    ...STRATEGY_PROFILES.aggressive,
    shotCount: calculateAggressiveShotCount(par, yardage, maxDistance),
    suitability: calculateStrategySuitability('aggressive', holeData, playerContext),
  });

  // Conservative strategy
  strategies.push({
    ...STRATEGY_PROFILES.conservative,
    shotCount: baseShotCount,
    suitability: calculateStrategySuitability('conservative', holeData, playerContext),
  });

  // Smart strategy
  strategies.push({
    ...STRATEGY_PROFILES.smart,
    shotCount: calculateSmartShotCount(par, yardage, maxDistance, handicap),
    suitability: calculateStrategySuitability('smart', holeData, playerContext),
  });

  return strategies;
}

/**
 * Calculate shot count for aggressive strategy
 */
function calculateAggressiveShotCount(par, yardage, maxDistance) {
  switch (par) {
    case 3:
      return 1; // Always 1 shot on par 3
    case 4:
      return 2; // Standard 2 shots
    case 5:
      // Can we reach in 2?
      return maxDistance * 2 >= yardage ? 2 : 3;
    default:
      return 2;
  }
}

/**
 * Calculate shot count for smart strategy
 */
function calculateSmartShotCount(par, yardage, maxDistance, handicap) {
  switch (par) {
    case 3:
      return 1;
    case 4:
      return 2;
    case 5:
      // Higher handicaps should usually play 3 shots
      // Lower handicaps can try to reach in 2 on shorter par 5s
      if (handicap <= 10 && maxDistance * 2 >= yardage - 20) {
        return 2;
      }
      return 3;
    default:
      return 2;
  }
}

/**
 * Calculate how suitable a strategy is for this hole/player
 */
function calculateStrategySuitability(strategyType, holeData, playerContext) {
  const { par, yardage, polygons } = holeData;
  const { handicap = 15 } = playerContext;

  let suitability = 0.5; // Base suitability

  // Count hazards
  const hazardCount = (polygons || []).filter(p =>
    ['water', 'bunker', 'ob', 'penalty'].includes(p.type)
  ).length;

  switch (strategyType) {
    case 'aggressive':
      // Aggressive suits lower handicaps and fewer hazards
      suitability += (15 - handicap) * 0.02;
      suitability -= hazardCount * 0.05;
      // Shorter holes favor aggression
      if (par === 4 && yardage < 380) suitability += 0.1;
      if (par === 5 && yardage < 500) suitability += 0.15;
      break;

    case 'conservative':
      // Conservative suits higher handicaps and more hazards
      suitability += (handicap - 10) * 0.02;
      suitability += hazardCount * 0.05;
      // Longer/harder holes favor conservative play
      if (par === 4 && yardage > 420) suitability += 0.1;
      if (par === 5 && yardage > 550) suitability += 0.1;
      break;

    case 'smart':
      // Smart is generally suitable for most situations
      suitability = 0.7;
      // Slightly favor smart for mid-handicaps
      if (handicap >= 8 && handicap <= 20) suitability += 0.1;
      break;
  }

  return Math.max(0, Math.min(1, suitability));
}

// ============================================================================
// STRATEGY SCORING
// ============================================================================

/**
 * Score all strategies and return the best one
 *
 * @param {Array} strategies - Array of strategy objects
 * @param {Object} holeData - Hole information
 * @param {Object} playerContext - Player information
 * @returns {Object} Best strategy with scores
 */
export function scoreStrategies(strategies, holeData, playerContext) {
  const scoredStrategies = strategies.map(strategy => {
    const successProbability = calculateSuccessProbability(strategy, holeData, playerContext);
    const expectedScore = calculateExpectedScore(strategy, successProbability, holeData.par);
    const riskScore = assessStrategyRisk(strategy, holeData, playerContext);

    // Weighted total score
    // Higher is better
    const totalScore =
      (successProbability * 0.35) +
      ((10 - expectedScore) / 10 * 0.35) + // Lower expected score is better
      (strategy.suitability * 0.15) +
      ((10 - riskScore) / 10 * 0.15); // Lower risk is better

    return {
      ...strategy,
      successProbability: Math.round(successProbability * 100) / 100,
      expectedScore: Math.round(expectedScore * 100) / 100,
      riskScore: Math.round(riskScore * 100) / 100,
      totalScore: Math.round(totalScore * 100) / 100,
    };
  });

  // Sort by total score (highest first)
  scoredStrategies.sort((a, b) => b.totalScore - a.totalScore);

  return scoredStrategies[0];
}

/**
 * Calculate probability of executing strategy successfully
 *
 * @param {Object} strategy - Strategy being evaluated
 * @param {Object} holeData - Hole information
 * @param {Object} playerContext - Player information
 * @returns {number} Probability 0-1
 */
export function calculateSuccessProbability(strategy, holeData, playerContext) {
  const { clubDistances, handicap = 15 } = playerContext;
  const { yardage, polygons } = holeData;

  // Base probability from handicap
  // Lower handicap = higher base probability
  let baseProbability = 0.9 - (handicap * 0.015);

  // Strategy modifier
  const strategyModifier = {
    aggressive: 0.85,
    conservative: 1.1,
    smart: 1.0,
  }[strategy.type] || 1.0;

  // Hazard penalty
  const hazardTypes = ['water', 'bunker', 'ob', 'penalty'];
  const hazardCount = (polygons || []).filter(p => hazardTypes.includes(p.type)).length;
  const hazardPenalty = hazardCount * 0.03 * strategy.riskMultiplier;

  // Distance factor (longer holes are harder)
  const distanceFactor = yardage > 450 ? 0.95 : yardage > 400 ? 0.97 : 1.0;

  // Shot count factor (more shots = more chances for error)
  const shotCountFactor = strategy.shotCount === 2 ? 1.0 : strategy.shotCount === 3 ? 0.95 : 1.0;

  const probability = baseProbability * strategyModifier * distanceFactor * shotCountFactor - hazardPenalty;

  return Math.max(0.3, Math.min(0.95, probability));
}

/**
 * Calculate expected score for a strategy
 *
 * @param {Object} strategy - Strategy being evaluated
 * @param {number} successProb - Probability of success
 * @param {number} par - Hole par
 * @returns {number} Expected score
 */
export function calculateExpectedScore(strategy, successProb, par) {
  const targetScore = par + strategy.targetScoreOffset;

  // When successful, achieve target score
  // When unsuccessful, expect bogey or worse
  const failureScore = par + 1 + (1 - successProb) * strategy.riskMultiplier;

  return (successProb * targetScore) + ((1 - successProb) * failureScore);
}

/**
 * Assess risk level of a strategy
 *
 * @param {Object} strategy - Strategy being evaluated
 * @param {Object} holeData - Hole information
 * @param {Object} playerContext - Player information
 * @returns {number} Risk score 1-10 (higher = riskier)
 */
export function assessStrategyRisk(strategy, holeData, playerContext) {
  const { polygons } = holeData;
  const { clubDistances, handicap = 15 } = playerContext;

  let riskScore = 3; // Base risk

  // Strategy inherent risk
  riskScore += {
    aggressive: 3,
    conservative: -1,
    smart: 1,
  }[strategy.type] || 0;

  // Hazard risk
  const hazardTypes = ['water', 'ob', 'penalty'];
  const severeHazards = (polygons || []).filter(p => hazardTypes.includes(p.type));
  riskScore += severeHazards.length * 0.8;

  // Bunker risk (less severe)
  const bunkers = (polygons || []).filter(p => p.type === 'bunker');
  riskScore += bunkers.length * 0.3;

  // Handicap risk (higher handicap = more risk)
  riskScore += (handicap - 10) * 0.1;

  // Fewer shots = higher risk per shot
  if (strategy.shotCount === 2 && holeData.par === 5) {
    riskScore += 2; // Going for it in 2 on par 5
  }

  return Math.max(1, Math.min(10, riskScore));
}

// ============================================================================
// RISK ASSESSMENT
// ============================================================================

/**
 * Generate detailed risk assessment for a hole plan
 *
 * @param {Array} shots - Planned shots
 * @param {Object} holeData - Hole information
 * @param {Object} playerContext - Player information
 * @returns {Object} Risk assessment { mainThreat, worstCase, bailout }
 */
export function generateRiskAssessment(shots, holeData, playerContext) {
  const { polygons } = holeData;

  // Find main threat (most dangerous hazard in play)
  const hazardTypes = ['water', 'ob', 'penalty', 'bunker'];
  const hazards = (polygons || []).filter(p => hazardTypes.includes(p.type));

  let mainThreat = 'None - open hole';
  let worstCase = 'Bogey if you miss fairway';
  let bailout = 'Center of fairway/green';

  if (hazards.length > 0) {
    // Prioritize by severity
    const waterHazard = hazards.find(h => h.type === 'water');
    const obHazard = hazards.find(h => h.type === 'ob');
    const bunkerHazard = hazards.find(h => h.type === 'bunker');

    if (waterHazard) {
      mainThreat = `Water ${waterHazard.label || ''}`.trim();
      worstCase = 'Double bogey or worse if ball finds water';
      bailout = 'Play away from water, accept longer approach';
    } else if (obHazard) {
      mainThreat = 'Out of bounds';
      worstCase = 'Stroke and distance penalty';
      bailout = 'Play to safe side of fairway';
    } else if (bunkerHazard) {
      mainThreat = `Bunker ${bunkerHazard.label || ''}`.trim();
      worstCase = 'Bogey from poor bunker shot';
      bailout = 'Aim away from bunkers, take extra club';
    }
  }

  // Analyze shot-specific risks
  if (shots && shots.length > 0) {
    const firstShot = shots[0];
    if (firstShot.avoidZones && firstShot.avoidZones.length > 0) {
      const primaryHazard = firstShot.avoidZones[0];
      mainThreat = `${primaryHazard.type} ${primaryHazard.direction}`;
    }
  }

  return {
    mainThreat,
    worstCase,
    bailout,
  };
}

// ============================================================================
// SHOT COUNT OPTIMIZATION
// ============================================================================

/**
 * Determine optimal number of shots based on distance and clubs
 *
 * @param {number} totalDistance - Total distance to cover
 * @param {Object} clubDistances - Player's club distances
 * @param {number} par - Hole par
 * @param {string} strategyType - Strategy type
 * @returns {number} Optimal shot count
 */
export function determineOptimalShotCount(totalDistance, clubDistances, par, strategyType) {
  if (!clubDistances || Object.keys(clubDistances).length === 0) {
    return par - 1; // Default to regulation
  }

  const maxDistance = Math.max(...Object.values(clubDistances));
  const idealApproachDistance = findIdealApproachDistance(clubDistances);

  // Par 3: always 1 shot
  if (par === 3) {
    return 1;
  }

  // Par 4: usually 2 shots
  if (par === 4) {
    // Can we reach in 1? (very rare)
    if (totalDistance <= maxDistance && strategyType === 'aggressive') {
      return 1;
    }
    return 2;
  }

  // Par 5: 2 or 3 shots
  if (par === 5) {
    // Can we reach in 2?
    if (maxDistance * 2 >= totalDistance && strategyType !== 'conservative') {
      return 2;
    }
    return 3;
  }

  return par - 1;
}

/**
 * Find ideal approach distance based on player's wedge distances
 *
 * @param {Object} clubDistances - Player's club distances
 * @returns {number} Ideal approach distance in yards
 */
export function findIdealApproachDistance(clubDistances) {
  if (!clubDistances) {
    return 120; // Default
  }

  // Find wedge distances (most accurate clubs for approach)
  const wedgeClubs = Object.entries(clubDistances)
    .filter(([club]) => {
      const normalized = club.toLowerCase();
      return normalized.includes('w_') ||
             normalized === 'pw' ||
             normalized === 'gw' ||
             normalized === 'sw' ||
             normalized === 'lw' ||
             normalized.includes('wedge');
    })
    .map(([club, distance]) => ({ club, distance }))
    .sort((a, b) => b.distance - a.distance); // Sort by distance descending

  if (wedgeClubs.length > 0) {
    // Return longest wedge distance (full swing approach)
    return wedgeClubs[0].distance;
  }

  // Fallback to 9-iron or PW distance
  return clubDistances['9_iron'] || clubDistances['pw'] || 120;
}

/**
 * Find ideal layup distance for par 5s
 *
 * @param {number} distanceToGreen - Current distance to green
 * @param {Object} clubDistances - Player's club distances
 * @returns {Object} Layup recommendation
 */
export function findIdealLayupDistance(distanceToGreen, clubDistances) {
  const idealApproach = findIdealApproachDistance(clubDistances);

  // Target leaving ideal approach distance
  const targetLayupDistance = distanceToGreen - idealApproach;

  // Avoid awkward distances (30-50 yards)
  const awkwardMin = 30;
  const awkwardMax = 50;

  if (idealApproach >= awkwardMin && idealApproach <= awkwardMax) {
    // Ideal approach is awkward - adjust
    return {
      targetDistance: distanceToGreen - 80, // Leave 80 yards instead
      leavingDistance: 80,
      reason: 'Adjusted to avoid awkward yardage',
    };
  }

  return {
    targetDistance: targetLayupDistance,
    leavingDistance: idealApproach,
    reason: `Leaves ${idealApproach} yard approach`,
  };
}
