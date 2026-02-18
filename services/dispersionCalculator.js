/**
 * Dispersion Calculator
 *
 * Models player accuracy based on club, distance, and skill level.
 * Provides dispersion radius predictions for shot planning.
 *
 * Based on golf statistics and strokes gained data:
 * - Amateur dispersion is typically 7-10% of carry distance
 * - Lower handicaps have tighter dispersion patterns
 * - Driver has higher dispersion than irons
 * - Wedges have the tightest dispersion
 */

// ============================================================================
// CLUB DISPERSION FACTORS
// ============================================================================

/**
 * Dispersion factor by club type
 * Higher = more dispersion
 * Based on PGA Tour and amateur statistics
 */
const CLUB_DISPERSION_FACTORS = {
  driver: 1.4,
  '3_wood': 1.25,
  '5_wood': 1.2,
  '4_hybrid': 1.15,
  '5_hybrid': 1.1,
  '3_iron': 1.15,
  '4_iron': 1.1,
  '5_iron': 1.05,
  '6_iron': 1.0,
  '7_iron': 0.95,
  '8_iron': 0.9,
  '9_iron': 0.85,
  pw: 0.75,
  w_46: 0.7,
  w_48: 0.7,
  w_50: 0.7,
  gw: 0.7,
  w_52: 0.7,
  w_54: 0.65,
  sw: 0.65,
  w_56: 0.65,
  w_58: 0.6,
  w_60: 0.6,
  lw: 0.6,
};

/**
 * Get club dispersion factor with fallback logic
 */
function getClubFactor(club) {
  if (!club) return 1.0;

  const normalized = club.toLowerCase().replace(/[-\s]/g, '_');

  // Direct match
  if (CLUB_DISPERSION_FACTORS[normalized]) {
    return CLUB_DISPERSION_FACTORS[normalized];
  }

  // Category-based fallback
  if (normalized.includes('driver')) return 1.4;
  if (normalized.includes('wood')) return 1.2;
  if (normalized.includes('hybrid')) return 1.1;
  if (normalized.includes('w_') || normalized.includes('wedge')) return 0.7;
  if (normalized.includes('iron')) return 1.0;

  return 1.0;
}

// ============================================================================
// HANDICAP ADJUSTMENT
// ============================================================================

/**
 * Calculate handicap-based dispersion multiplier
 *
 * Baseline handicap: 10 (scratch players are more accurate)
 * Formula scales dispersion based on skill level
 *
 * @param {number} handicap - Player's handicap (0-36)
 * @returns {number} Multiplier (0.7 for scratch, 1.0 for 10 hdcp, 1.5+ for high hdcp)
 */
function getHandicapFactor(handicap) {
  if (handicap === null || handicap === undefined) {
    return 1.0; // Default to 10 handicap equivalent
  }

  const normalizedHandicap = Math.max(0, Math.min(36, handicap));

  // Linear scale: 0 hdcp = 0.7x, 10 hdcp = 1.0x, 20 hdcp = 1.3x, 36 hdcp = 1.78x
  return 0.7 + (normalizedHandicap * 0.03);
}

// ============================================================================
// MAIN DISPERSION CALCULATION
// ============================================================================

/**
 * Calculate dispersion radius for a given club and player
 *
 * The dispersion radius represents the area where approximately 68% of shots
 * will land (one standard deviation).
 *
 * When measured data from user_club_stats is available (5+ shots), uses the
 * player's actual dispersion pattern. Otherwise falls back to formula-based
 * estimation.
 *
 * @param {string} club - Club identifier (e.g., 'driver', '7_iron', 'pw')
 * @param {Object} clubDistances - Player's club distances { clubId: distance }
 * @param {number} handicap - Player's handicap (optional, defaults to 15)
 * @param {Object} measuredStats - Optional measured stats from user_club_stats for this club
 * @returns {Object} Dispersion info
 */
export function calculateDispersion(club, clubDistances, handicap = 15, measuredStats = null) {
  // If we have sufficient measured data, use it instead of formula
  if (measuredStats && measuredStats.totalShots >= 5 && measuredStats.dispersionRadius != null) {
    const confidence = calculateMeasuredConfidence(measuredStats.totalShots);
    const formulaResult = calculateFormulaDispersion(club, clubDistances, handicap);

    // Blend measured and formula based on confidence
    const radius = Math.round(
      measuredStats.dispersionRadius * confidence +
      formulaResult.radius * (1 - confidence)
    );
    const lateral = measuredStats.lateralDispersion != null
      ? Math.round(measuredStats.lateralDispersion * confidence + formulaResult.lateralDispersion * (1 - confidence))
      : formulaResult.lateralDispersion;
    const distDisp = measuredStats.distanceDispersion != null
      ? Math.round(measuredStats.distanceDispersion * confidence + formulaResult.distanceDispersion * (1 - confidence))
      : formulaResult.distanceDispersion;

    return {
      radius,
      lateralDispersion: lateral,
      distanceDispersion: distDisp,
      distance: measuredStats.avgDistance || formulaResult.distance,
      handicapFactor: formulaResult.handicapFactor,
      clubFactor: formulaResult.clubFactor,
      dataSource: 'measured',
      confidence: Math.round(confidence * 100) / 100,
      sampleSize: measuredStats.totalShots,
      description: `${radius} yard dispersion (measured from ${measuredStats.totalShots} shots)`,
    };
  }

  // Fall back to formula-based calculation
  return calculateFormulaDispersion(club, clubDistances, handicap);
}

/**
 * Confidence for blending measured vs formula data based on sample size.
 */
function calculateMeasuredConfidence(sampleSize) {
  if (sampleSize < 5) return 0;
  if (sampleSize < 10) return 0.4;
  if (sampleSize < 20) return 0.65;
  if (sampleSize < 30) return 0.8;
  if (sampleSize < 50) return 0.9;
  return 0.95;
}

/**
 * Pure formula-based dispersion calculation (original algorithm).
 */
function calculateFormulaDispersion(club, clubDistances, handicap) {
  // Get the distance for this club
  const distance = clubDistances?.[club] || estimateClubDistance(club);

  // Base dispersion as percentage of distance
  // Amateur dispersion is roughly 8% of carry distance
  const baseDispersionPercent = 0.08;

  // Apply factors
  const handicapFactor = getHandicapFactor(handicap);
  const clubFactor = getClubFactor(club);

  // Calculate dispersion radius
  const dispersionRadius = Math.round(distance * baseDispersionPercent * handicapFactor * clubFactor);

  // Also calculate lateral dispersion (side-to-side)
  // Typically 60% of total dispersion is lateral for amateurs
  const lateralDispersion = Math.round(dispersionRadius * 0.6);

  // Calculate distance dispersion (short/long)
  // Typically 80% of total dispersion is distance for amateurs
  const distanceDispersion = Math.round(dispersionRadius * 0.8);

  return {
    radius: dispersionRadius,
    lateralDispersion,
    distanceDispersion,
    distance,
    handicapFactor: Math.round(handicapFactor * 100) / 100,
    clubFactor: Math.round(clubFactor * 100) / 100,
    dataSource: 'formula',
    confidence: 0,
    sampleSize: 0,
    description: `${dispersionRadius} yard dispersion radius`,
  };
}

/**
 * Estimate club distance if not provided
 * Uses typical amateur distances
 */
function estimateClubDistance(club) {
  const defaults = {
    driver: 230,
    '3_wood': 210,
    '5_wood': 195,
    '4_hybrid': 185,
    '5_hybrid': 175,
    '3_iron': 185,
    '4_iron': 175,
    '5_iron': 165,
    '6_iron': 155,
    '7_iron': 145,
    '8_iron': 135,
    '9_iron': 125,
    pw: 115,
    gw: 100,
    sw: 85,
    lw: 70,
  };

  const normalized = club?.toLowerCase().replace(/[-\s]/g, '_');
  return defaults[normalized] || 150;
}

// ============================================================================
// CONFIDENCE ANALYSIS
// ============================================================================

/**
 * Analyze shot confidence based on dispersion vs target size
 *
 * @param {number} dispersionRadius - Player's dispersion for this shot
 * @param {number} targetRadius - Size of target (green, landing zone)
 * @param {Object} hazardInfo - Info about nearby hazards
 * @returns {Object} Confidence assessment
 */
export function analyzeConfidence(dispersionRadius, targetRadius, hazardInfo = null) {
  const ratio = dispersionRadius / targetRadius;

  let confidence;
  let level;

  if (ratio < 0.5) {
    confidence = 'high';
    level = 0.85; // 85% chance of hitting target
  } else if (ratio < 0.75) {
    confidence = 'medium';
    level = 0.7;
  } else if (ratio < 1.0) {
    confidence = 'low';
    level = 0.55;
  } else {
    confidence = 'very low';
    level = 0.4;
  }

  // Reduce confidence if hazards are close
  if (hazardInfo?.conflicts?.length > 0) {
    const hazardPenalty = hazardInfo.conflicts.some(c => c.severity === 'critical') ? 0.15 : 0.08;
    level -= hazardPenalty;
    if (confidence === 'high') confidence = 'medium';
  }

  return {
    confidence,
    level: Math.round(level * 100) / 100,
    dispersionRadius,
    targetRadius,
    ratio: Math.round(ratio * 100) / 100,
    description: `${Math.round(level * 100)}% chance of hitting target`,
  };
}

// ============================================================================
// MISS PATTERN ANALYSIS
// ============================================================================

/**
 * Predict likely miss patterns for a club/player combination
 *
 * When measured stats are available, uses actual miss percentages and lateral
 * bias from user_club_stats. Otherwise falls back to handicap-based estimation.
 *
 * @param {string} club - Club being used
 * @param {number} handicap - Player's handicap
 * @param {string} playerTendency - Optional player-specific tendency ('fade', 'draw', 'straight')
 * @param {Object} measuredStats - Optional measured stats from user_club_stats for this club
 * @returns {Object} Miss pattern prediction
 */
export function predictMissPattern(club, handicap = 15, playerTendency = null, measuredStats = null) {
  // Use measured data if available with sufficient sample size
  if (measuredStats && measuredStats.totalShots >= 5) {
    const lateralBias = measuredStats.avgOffline != null
      ? (measuredStats.avgOffline > 2 ? 'right' : measuredStats.avgOffline < -2 ? 'left' : 'center')
      : (playerTendency === 'draw' ? 'left' : 'right');

    const distanceBias = measuredStats.missShortPct > measuredStats.missLongPct ? 'short' : 'long';

    const lateralMissLikelihood = (measuredStats.missLeftPct + measuredStats.missRightPct) / 100;
    const distanceMissLikelihood = (measuredStats.missShortPct + measuredStats.missLongPct) / 100;

    const avgMissYards = measuredStats.avgOffline != null ? Math.abs(measuredStats.avgOffline) : 0;
    const biasMagnitude = avgMissYards > 12 ? 'strong' : avgMissYards > 6 ? 'moderate' : 'slight';

    return {
      lateralBias,
      lateralMissLikelihood: Math.round(lateralMissLikelihood * 100) / 100,
      distanceBias,
      distanceMissLikelihood: Math.round(distanceMissLikelihood * 100) / 100,
      biasMagnitude,
      avgOfflineYards: measuredStats.avgOffline,
      primaryMiss: lateralMissLikelihood > distanceMissLikelihood ? lateralBias : distanceBias,
      dataSource: 'measured',
      sampleSize: measuredStats.totalShots,
      description: `Most likely miss: ${biasMagnitude} ${lateralBias}${avgMissYards > 2 ? ` (${avgMissYards.toFixed(1)} yds)` : ''}, ${distanceBias}`,
    };
  }

  // Fall back to formula-based estimation
  const clubFactor = getClubFactor(club);

  // Default amateur tendency (slight fade/slice)
  let lateralBias = playerTendency === 'draw' ? 'left' : playerTendency === 'fade' ? 'right' : 'right';
  let distanceBias = 'short'; // Amateurs are almost always short

  // Higher dispersion clubs have more lateral miss
  const lateralMissLikelihood = clubFactor > 1.2 ? 0.6 : 0.4;
  const distanceMissLikelihood = clubFactor < 0.8 ? 0.7 : 0.5;

  // Higher handicaps miss more to their tendency side
  const biasMagnitude = handicap > 20 ? 'strong' : handicap > 12 ? 'moderate' : 'slight';

  return {
    lateralBias,
    lateralMissLikelihood,
    distanceBias,
    distanceMissLikelihood,
    biasMagnitude,
    primaryMiss: lateralMissLikelihood > distanceMissLikelihood ? lateralBias : distanceBias,
    dataSource: 'formula',
    sampleSize: 0,
    description: `Most likely miss: ${biasMagnitude} ${lateralBias}, ${distanceBias}`,
  };
}

// ============================================================================
// SHOT SELECTION HELPERS
// ============================================================================

/**
 * Recommend the tightest dispersion club for a distance
 * Useful when accuracy is critical (narrow fairway, over water)
 *
 * @param {number} targetDistance - Required distance in yards
 * @param {Object} clubDistances - Player's club distances
 * @param {number} handicap - Player's handicap
 * @returns {Object} Club recommendation with dispersion info
 */
export function findMostAccurateClub(targetDistance, clubDistances, handicap = 15) {
  if (!clubDistances || Object.keys(clubDistances).length === 0) {
    return { club: null, error: 'No club data available' };
  }

  // Find clubs that can reach the distance
  const candidates = Object.entries(clubDistances)
    .filter(([_, dist]) => dist >= targetDistance)
    .map(([club, distance]) => ({
      club,
      distance,
      ...calculateDispersion(club, clubDistances, handicap),
    }))
    .sort((a, b) => a.radius - b.radius); // Sort by tightest dispersion

  if (candidates.length === 0) {
    // No club can reach - return longest club
    const longest = Object.entries(clubDistances)
      .sort((a, b) => b[1] - a[1])[0];
    return {
      club: longest[0],
      distance: longest[1],
      note: 'No club reaches target - using longest club',
      ...calculateDispersion(longest[0], clubDistances, handicap),
    };
  }

  const best = candidates[0];
  const alternate = candidates.length > 1 ? candidates[1] : null;

  return {
    primary: {
      club: best.club,
      distance: best.distance,
      dispersion: best.radius,
      confidence: best.radius < 20 ? 'high' : best.radius < 30 ? 'medium' : 'low',
    },
    alternate: alternate ? {
      club: alternate.club,
      distance: alternate.distance,
      dispersion: alternate.radius,
    } : null,
    analysis: `${best.club} has tightest dispersion (${best.radius} yards) for this shot`,
  };
}

/**
 * Calculate dispersion ellipse (for visualization)
 *
 * @param {Object} center - Center point { latitude, longitude }
 * @param {number} lateralDispersion - Side-to-side dispersion in yards
 * @param {number} distanceDispersion - Short-long dispersion in yards
 * @param {number} shotBearing - Direction of shot in degrees
 * @param {number} points - Number of points for ellipse (default 32)
 * @returns {Array} Array of coordinates forming ellipse
 */
export function calculateDispersionEllipse(center, lateralDispersion, distanceDispersion, shotBearing, points = 32) {
  const ellipsePoints = [];

  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;

    // Calculate point on ellipse
    const x = lateralDispersion * Math.cos(angle);
    const y = distanceDispersion * Math.sin(angle);

    // Rotate by shot bearing
    const bearingRad = shotBearing * Math.PI / 180;
    const rotatedX = x * Math.cos(bearingRad) - y * Math.sin(bearingRad);
    const rotatedY = x * Math.sin(bearingRad) + y * Math.cos(bearingRad);

    // Convert to lat/long offset (approximate)
    // 1 degree latitude ≈ 364,000 feet ≈ 121,333 yards
    // 1 degree longitude varies by latitude
    const latOffset = rotatedY / 121333;
    const lonOffset = rotatedX / (121333 * Math.cos(center.latitude * Math.PI / 180));

    ellipsePoints.push({
      latitude: center.latitude + latOffset,
      longitude: center.longitude + lonOffset,
    });
  }

  return ellipsePoints;
}
