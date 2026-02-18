/**
 * Shot Analytics Service
 *
 * Computes per-club statistics and player tendency patterns from raw shot data.
 * Runs after round submission (not during play) to avoid impacting gameplay performance.
 *
 * Populates:
 * - user_club_stats: Per-club distance, accuracy, and dispersion stats
 * - user_tendencies: Pattern detection (miss biases, hole type performance, etc.)
 */

import { supabase } from '../config/supabase';
import { fetchAllUserShots } from './roundService';

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

/**
 * Calculate confidence level based on sample size.
 * @param {number} sampleSize - Number of data points
 * @returns {number} Confidence 0-1
 */
function calculateConfidence(sampleSize) {
  if (sampleSize < 5) return 0;
  if (sampleSize < 10) return 0.3;
  if (sampleSize < 15) return 0.5;
  if (sampleSize < 20) return 0.65;
  if (sampleSize < 30) return 0.8;
  if (sampleSize < 50) return 0.9;
  return 0.95;
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squaredDiffs = arr.map(x => (x - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1));
}

function percentageOf(arr, predicate) {
  if (arr.length === 0) return 0;
  return arr.filter(predicate).length / arr.length;
}

// ============================================================================
// CLUB STATISTICS COMPUTATION
// ============================================================================

/**
 * Compute per-club statistics from raw shot data.
 *
 * @param {Array} shots - All user shots from round_shots
 * @returns {Object} Map of club -> stats object
 */
export function computeClubStats(shots) {
  // Group shots by club (exclude putts - they don't have meaningful distance data)
  const clubGroups = {};
  for (const shot of shots) {
    if (!shot.club || shot.club === 'putter') continue;
    if (shot.distance_actual == null) continue;

    if (!clubGroups[shot.club]) {
      clubGroups[shot.club] = [];
    }
    clubGroups[shot.club].push(shot);
  }

  const clubStats = {};

  for (const [club, clubShots] of Object.entries(clubGroups)) {
    const distances = clubShots.map(s => s.distance_actual).filter(d => d != null && d > 0);
    const offlines = clubShots.map(s => s.distance_offline).filter(d => d != null);
    const targDists = clubShots.map(s => s.distance_to_target).filter(d => d != null);

    if (distances.length === 0) continue;

    // Distance stats
    const avgDist = mean(distances);
    const medDist = median(distances);
    const stdDist = stdDev(distances);
    const maxDist = Math.max(...distances);
    const minDist = Math.min(...distances);

    // Accuracy stats (offline: positive = right, negative = left)
    const avgOff = offlines.length > 0 ? mean(offlines) : null;
    const stdOff = offlines.length > 1 ? stdDev(offlines) : null;
    const missLeftPct = percentageOf(offlines, d => d < -5);
    const missRightPct = percentageOf(offlines, d => d > 5);

    // Distance miss (short/long relative to planned distance)
    const distDiffs = clubShots
      .filter(s => s.distance_actual != null && s.distance_planned != null)
      .map(s => s.distance_actual - s.distance_planned);
    const missShortPct = percentageOf(distDiffs, d => d < -5);
    const missLongPct = percentageOf(distDiffs, d => d > 5);

    // Dispersion (1-sigma radius from center of cluster)
    const lateralDisp = offlines.length > 1 ? stdDev(offlines) : null;
    const distDisp = distances.length > 1 ? stdDev(distances) : null;
    const dispRadius = (lateralDisp != null && distDisp != null)
      ? Math.round(Math.sqrt(lateralDisp ** 2 + distDisp ** 2))
      : null;

    // Target accuracy
    const avgDistToTarget = targDists.length > 0 ? mean(targDists) : null;

    // Rolling last 10
    const last10 = distances.slice(-10);
    const last10Avg = last10.length > 0 ? mean(last10) : null;

    clubStats[club] = {
      club,
      avgDistance: Math.round(avgDist * 10) / 10,
      medianDistance: Math.round(medDist * 10) / 10,
      stdDistance: Math.round(stdDist * 10) / 10,
      maxDistance: Math.round(maxDist),
      minDistance: Math.round(minDist),
      avgOffline: avgOff != null ? Math.round(avgOff * 10) / 10 : null,
      stdOffline: stdOff != null ? Math.round(stdOff * 10) / 10 : null,
      missLeftPct: Math.round(missLeftPct * 100),
      missRightPct: Math.round(missRightPct * 100),
      missShortPct: Math.round(missShortPct * 100),
      missLongPct: Math.round(missLongPct * 100),
      dispersionRadius: dispRadius,
      lateralDispersion: lateralDisp != null ? Math.round(lateralDisp * 10) / 10 : null,
      distanceDispersion: distDisp != null ? Math.round(distDisp * 10) / 10 : null,
      avgDistanceToTarget: avgDistToTarget != null ? Math.round(avgDistToTarget * 10) / 10 : null,
      totalShots: clubShots.length,
      last10Avg: last10Avg != null ? Math.round(last10Avg * 10) / 10 : null,
    };
  }

  return clubStats;
}

// ============================================================================
// TENDENCY DETECTION
// ============================================================================

/**
 * Detect player tendencies from shot and round data.
 *
 * @param {Array} shots - All user shots
 * @param {Object} clubStats - Pre-computed club stats
 * @returns {Array} Array of tendency objects
 */
export function detectTendencies(shots, clubStats) {
  const tendencies = [];

  // --- Club Bias Tendencies ---
  for (const [club, stats] of Object.entries(clubStats)) {
    if (stats.totalShots < 5) continue;

    // Detect lateral bias (push/pull)
    if (stats.avgOffline != null && Math.abs(stats.avgOffline) > 3) {
      const direction = stats.avgOffline > 0 ? 'right' : 'left';
      tendencies.push({
        tendencyType: 'club_bias',
        tendencyKey: `${club}_miss`,
        tendencyData: {
          direction,
          yards: Math.abs(stats.avgOffline),
          club,
          description: `Tends to miss ${club.replace(/_/g, ' ')} ${Math.abs(stats.avgOffline).toFixed(1)} yards ${direction}`,
        },
        confidence: calculateConfidence(stats.totalShots),
        sampleSize: stats.totalShots,
      });
    }

    // Detect distance bias (consistently short or long)
    const clubShots = shots.filter(s => s.club === club && s.distance_actual != null && s.distance_planned != null);
    if (clubShots.length >= 5) {
      const distDiffs = clubShots.map(s => s.distance_actual - s.distance_planned);
      const avgDiff = mean(distDiffs);
      if (Math.abs(avgDiff) > 5) {
        const bias = avgDiff > 0 ? 'long' : 'short';
        tendencies.push({
          tendencyType: 'club_bias',
          tendencyKey: `${club}_distance`,
          tendencyData: {
            bias,
            yards: Math.abs(avgDiff),
            club,
            description: `Hits ${club.replace(/_/g, ' ')} ${Math.abs(avgDiff).toFixed(0)} yards ${bias} on average`,
          },
          confidence: calculateConfidence(clubShots.length),
          sampleSize: clubShots.length,
        });
      }
    }
  }

  // --- Long Iron Aggregate Bias ---
  const longIronClubs = ['3_iron', '4_iron', '5_iron', '4_hybrid', '5_hybrid'];
  const longIronShots = shots.filter(
    s => longIronClubs.includes(s.club) && s.distance_offline != null
  );
  if (longIronShots.length >= 8) {
    const avgOff = mean(longIronShots.map(s => s.distance_offline));
    if (Math.abs(avgOff) > 4) {
      const direction = avgOff > 0 ? 'right' : 'left';
      tendencies.push({
        tendencyType: 'club_bias',
        tendencyKey: 'long_iron_miss',
        tendencyData: {
          direction,
          yards: Math.abs(avgOff),
          clubs: longIronClubs,
          description: `Tends to push long irons ${Math.abs(avgOff).toFixed(1)} yards ${direction}`,
        },
        confidence: calculateConfidence(longIronShots.length),
        sampleSize: longIronShots.length,
      });
    }
  }

  // --- Hole Type Tendencies (requires round_holes data, computed from shots + hole par) ---
  // Group shots by hole and check par context
  const par3Shots = shots.filter(s => s.shot_number === 1 && s.lie_type === 'tee');
  // Note: Full hole type tendencies require combining round_holes data
  // which is done in the Edge Function. Here we detect shot-based patterns.

  // --- Distance Range Tendencies ---
  const distRanges = [
    { key: '100_125', min: 100, max: 125 },
    { key: '125_150', min: 125, max: 150 },
    { key: '150_175', min: 150, max: 175 },
    { key: '175_200', min: 175, max: 200 },
    { key: '200_plus', min: 200, max: 999 },
  ];

  for (const range of distRanges) {
    const rangeShots = shots.filter(
      s => s.distance_planned != null
        && s.distance_planned >= range.min
        && s.distance_planned < range.max
        && s.result != null
    );

    if (rangeShots.length >= 5) {
      const greenHits = rangeShots.filter(s => s.result === 'green' || s.result === 'fringe');
      const girPct = greenHits.length / rangeShots.length;

      tendencies.push({
        tendencyType: 'distance_range',
        tendencyKey: range.key,
        tendencyData: {
          girPct: Math.round(girPct * 100),
          totalShots: rangeShots.length,
          greenHits: greenHits.length,
          range: `${range.min}-${range.max === 999 ? '+' : range.max}`,
          description: `${Math.round(girPct * 100)}% GIR from ${range.min}-${range.max === 999 ? '200+' : range.max} yards`,
        },
        confidence: calculateConfidence(rangeShots.length),
        sampleSize: rangeShots.length,
      });
    }
  }

  // --- Condition Tendencies ---
  // Wind impact
  const windyShots = shots.filter(s => s.wind_speed != null && s.wind_speed >= 15 && s.distance_offline != null);
  const calmShots = shots.filter(s => s.wind_speed != null && s.wind_speed < 10 && s.distance_offline != null);

  if (windyShots.length >= 5 && calmShots.length >= 5) {
    const windyAvgOff = mean(windyShots.map(s => Math.abs(s.distance_offline)));
    const calmAvgOff = mean(calmShots.map(s => Math.abs(s.distance_offline)));
    const windImpact = windyAvgOff - calmAvgOff;

    if (windImpact > 3) {
      tendencies.push({
        tendencyType: 'condition',
        tendencyKey: 'wind_over_15',
        tendencyData: {
          windyAvgMiss: Math.round(windyAvgOff * 10) / 10,
          calmAvgMiss: Math.round(calmAvgOff * 10) / 10,
          extraMiss: Math.round(windImpact * 10) / 10,
          description: `Misses ${windImpact.toFixed(1)} extra yards in wind above 15mph`,
        },
        confidence: calculateConfidence(Math.min(windyShots.length, calmShots.length)),
        sampleSize: windyShots.length,
      });
    }
  }

  // --- Situational: Approach from rough ---
  const roughApproaches = shots.filter(s => s.lie_type === 'rough' && s.distance_actual != null && s.distance_planned != null);
  const fairwayApproaches = shots.filter(s => s.lie_type === 'fairway' && s.distance_actual != null && s.distance_planned != null && s.shot_number > 1);

  if (roughApproaches.length >= 5 && fairwayApproaches.length >= 5) {
    const roughAvgDiff = mean(roughApproaches.map(s => s.distance_actual - s.distance_planned));
    const fairwayAvgDiff = mean(fairwayApproaches.map(s => s.distance_actual - s.distance_planned));
    const roughPenalty = roughAvgDiff - fairwayAvgDiff;

    if (roughPenalty < -5) {
      tendencies.push({
        tendencyType: 'situational',
        tendencyKey: 'approach_from_rough',
        tendencyData: {
          roughPenalty: Math.round(Math.abs(roughPenalty)),
          description: `Loses ${Math.abs(roughPenalty).toFixed(0)} yards from rough vs fairway`,
        },
        confidence: calculateConfidence(Math.min(roughApproaches.length, fairwayApproaches.length)),
        sampleSize: roughApproaches.length,
      });
    }
  }

  return tendencies;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Save computed club stats to Supabase.
 *
 * @param {string} userId - User ID
 * @param {Object} clubStats - Map of club -> stats
 * @returns {Object} { error: string|null }
 */
export async function saveClubStats(userId, clubStats) {
  const rows = Object.values(clubStats).map(stats => ({
    user_id: userId,
    club: stats.club,
    avg_distance: stats.avgDistance,
    median_distance: stats.medianDistance,
    std_distance: stats.stdDistance,
    max_distance: stats.maxDistance,
    min_distance: stats.minDistance,
    avg_offline: stats.avgOffline,
    std_offline: stats.stdOffline,
    miss_left_pct: stats.missLeftPct,
    miss_right_pct: stats.missRightPct,
    miss_short_pct: stats.missShortPct,
    miss_long_pct: stats.missLongPct,
    dispersion_radius: stats.dispersionRadius,
    lateral_dispersion: stats.lateralDispersion,
    distance_dispersion: stats.distanceDispersion,
    avg_distance_to_target: stats.avgDistanceToTarget,
    total_shots: stats.totalShots,
    last_10_avg: stats.last10Avg,
    last_updated: new Date().toISOString(),
  }));

  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from('user_club_stats')
    .upsert(rows, { onConflict: 'user_id,club' });

  if (error) {
    console.error('[Analytics] Error saving club stats:', error.message);
    return { error: error.message };
  }

  console.log(`[Analytics] Saved stats for ${rows.length} clubs`);
  return { error: null };
}

/**
 * Save computed tendencies to Supabase.
 *
 * @param {string} userId - User ID
 * @param {Array} tendencies - Array of tendency objects
 * @returns {Object} { error: string|null }
 */
export async function saveTendencies(userId, tendencies) {
  const rows = tendencies.map(t => ({
    user_id: userId,
    tendency_type: t.tendencyType,
    tendency_key: t.tendencyKey,
    tendency_data: t.tendencyData,
    confidence: t.confidence,
    sample_size: t.sampleSize,
    last_updated: new Date().toISOString(),
  }));

  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from('user_tendencies')
    .upsert(rows, { onConflict: 'user_id,tendency_type,tendency_key' });

  if (error) {
    console.error('[Analytics] Error saving tendencies:', error.message);
    return { error: error.message };
  }

  console.log(`[Analytics] Saved ${rows.length} tendencies`);
  return { error: null };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run full analytics computation for a user.
 * Call this after a round is submitted.
 *
 * @param {string} userId - User ID
 * @returns {Object} { clubStats, tendencies, error }
 */
export async function computeAndSaveAnalytics(userId) {
  console.log('[Analytics] Starting analytics computation for user:', userId);

  // Fetch all completed round shots
  const { data: shots, error: fetchError } = await fetchAllUserShots(userId);
  if (fetchError) {
    console.error('[Analytics] Error fetching shots:', fetchError);
    return { clubStats: null, tendencies: null, error: fetchError };
  }

  if (!shots || shots.length === 0) {
    console.log('[Analytics] No shots found, skipping analytics');
    return { clubStats: {}, tendencies: [], error: null };
  }

  console.log(`[Analytics] Processing ${shots.length} shots`);

  // Compute club stats
  const clubStats = computeClubStats(shots);

  // Detect tendencies
  const tendencies = detectTendencies(shots, clubStats);

  // Save to database
  const statsResult = await saveClubStats(userId, clubStats);
  const tendResult = await saveTendencies(userId, tendencies);

  const error = statsResult.error || tendResult.error || null;

  console.log(`[Analytics] Complete: ${Object.keys(clubStats).length} clubs, ${tendencies.length} tendencies`);

  return { clubStats, tendencies, error };
}
