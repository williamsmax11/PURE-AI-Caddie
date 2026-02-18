/**
 * Shot Path Animation Utilities
 *
 * Pure math functions for generating animated shot path visualizations
 * on the satellite map. No React/RN dependencies.
 */

/**
 * Generate a curved arc path between two GPS coordinates using a quadratic
 * Bezier curve. The control point is offset perpendicular to the midpoint,
 * creating a natural ball-flight arc.
 *
 * @param {Object} start - {latitude, longitude}
 * @param {Object} end - {latitude, longitude}
 * @param {number} numPoints - intermediate points (50 = smooth at satellite zoom)
 * @param {number} arcHeight - control point offset in GPS degrees
 * @param {string} side - 'left' or 'right' to control curve direction
 * @returns {Array<{latitude, longitude}>}
 */
export function generateBezierArc(start, end, numPoints = 50, arcHeight = 0.0005, side = 'left') {
  const midLat = (start.latitude + end.latitude) / 2;
  const midLng = (start.longitude + end.longitude) / 2;

  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;

  // Perpendicular vector (rotated 90 degrees)
  const perpLat = side === 'left' ? -dLng : dLng;
  const perpLng = side === 'left' ? dLat : -dLat;

  const perpLen = Math.sqrt(perpLat * perpLat + perpLng * perpLng);
  if (perpLen === 0) {
    // Start and end are the same point; return a single-point array
    return [{ latitude: start.latitude, longitude: start.longitude }];
  }

  const controlPoint = {
    latitude: midLat + (perpLat / perpLen) * arcHeight,
    longitude: midLng + (perpLng / perpLen) * arcHeight,
  };

  // Quadratic Bezier: B(t) = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const oneMinusT = 1 - t;
    points.push({
      latitude:
        oneMinusT * oneMinusT * start.latitude +
        2 * oneMinusT * t * controlPoint.latitude +
        t * t * end.latitude,
      longitude:
        oneMinusT * oneMinusT * start.longitude +
        2 * oneMinusT * t * controlPoint.longitude +
        t * t * end.longitude,
    });
  }

  return points;
}

/**
 * Deceleration easing - fast start, gradual slowdown.
 * Simulates a golf ball losing velocity after being struck.
 */
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Calculate appropriate arc height based on shot type and distance.
 * Longer shots get more pronounced arcs; short chips stay flat.
 *
 * @param {number} distanceYards
 * @param {string} club - club name (e.g., "Driver", "7 Iron", "PW")
 * @returns {number} arc height in GPS degrees
 */
export function calculateArcHeight(distanceYards, club) {
  const clubLower = (club || '').toLowerCase();

  // Putter/chip: nearly flat
  if (clubLower.includes('putter') || distanceYards < 30) {
    return distanceYards * 0.0000002;
  }
  // Wedges: low-medium arc
  if (clubLower.includes('wedge') || clubLower.includes('pw') || clubLower.includes('sw') || clubLower.includes('lw') || clubLower.includes('gw') || clubLower.includes('aw')) {
    return distanceYards * 0.0000008;
  }
  // Short/mid irons: medium arc
  if (distanceYards < 180) {
    return distanceYards * 0.000001;
  }
  // Long irons/woods/driver: high arc
  return distanceYards * 0.0000013;
}

/**
 * Generate an array of RGBA color strings for the Polyline strokeColors prop.
 * Creates a gradient trail: transparent at the tail, bright at the leading edge.
 *
 * @param {number} totalPoints - total points in the full arc
 * @param {number} revealedCount - how many points are currently revealed
 * @param {string} baseColor - hex color like '#34d399'
 * @param {number} tailLength - how many trailing points to fade (15-20)
 * @returns {string[]} array of rgba strings, length = revealedCount
 */
export function generateTrailColors(totalPoints, revealedCount, baseColor, tailLength = 18) {
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);

  const colors = [];
  for (let i = 0; i < revealedCount; i++) {
    const distFromHead = revealedCount - 1 - i;
    if (distFromHead >= tailLength) {
      colors.push(`rgba(${r}, ${g}, ${b}, 0.05)`);
    } else {
      const alpha = 0.15 + 0.85 * (1 - distFromHead / tailLength);
      colors.push(`rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`);
    }
  }
  return colors;
}
