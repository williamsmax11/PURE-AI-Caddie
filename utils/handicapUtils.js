/**
 * Handicap Utilities
 *
 * Shared handicap calculation logic used by HomeScreen (display),
 * handicapService (persistence), and other consumers.
 *
 * Uses a simplified USGA method:
 *   Differential = ((Score - Course Rating) × 113) / Slope Rating
 *   Handicap = Average of best 40% of differentials (min 3 required)
 */

/**
 * Calculate handicap differentials from an array of round objects.
 * Each qualifying round must have: total_score, tee_rating, tee_slope.
 *
 * @param {Array<Object>} rounds - Round objects from the DB
 * @returns {Array<number>} Differentials for qualifying rounds
 */
export function calculateDifferentials(rounds) {
  return rounds
    .filter(r => r.total_score && r.tee_rating && r.tee_slope)
    .map(r => ((r.total_score - r.tee_rating) * 113) / r.tee_slope);
}

/**
 * Calculate a handicap index from an array of differentials.
 * Requires at least 3 differentials.
 *
 * - Sort differentials ascending (best first)
 * - Take the best 40% (min 1, max 8)
 * - Average them
 * - Floor at 0
 *
 * @param {Array<number>} differentials - Pre-computed differentials
 * @returns {{ handicap: number|null, roundCount: number, differentialAvg: number|null }}
 */
export function calculateHandicapFromDifferentials(differentials) {
  if (differentials.length < 3) {
    return { handicap: null, roundCount: differentials.length, differentialAvg: null };
  }

  const sorted = [...differentials].sort((a, b) => a - b);
  const count = Math.min(8, Math.ceil(sorted.length * 0.4));
  const best = sorted.slice(0, Math.max(count, 1));
  const avg = best.reduce((a, b) => a + b, 0) / best.length;
  const handicap = Math.max(0, avg);

  return {
    handicap: Math.round(handicap * 10) / 10,
    roundCount: differentials.length,
    differentialAvg: Math.round(avg * 100) / 100,
  };
}

/**
 * Calculate handicap directly from rounds.
 * Combines calculateDifferentials + calculateHandicapFromDifferentials.
 *
 * @param {Array<Object>} rounds - Round objects with total_score, tee_rating, tee_slope
 * @returns {{ handicap: number|null, roundCount: number, differentialAvg: number|null }}
 */
export function calculateHandicap(rounds) {
  const differentials = calculateDifferentials(rounds);
  return calculateHandicapFromDifferentials(differentials);
}
