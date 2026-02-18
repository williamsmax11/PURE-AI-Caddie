/**
 * Player Insights Service
 *
 * Loads and caches the user's analytics data (club stats + tendencies) for use
 * during play. Called once at round start to avoid per-shot DB queries.
 *
 * Data Levels:
 *   none     - 0 rounds (pure rule-based, current behavior)
 *   minimal  - 1-3 rounds (show basic stats, no recommendation changes)
 *   moderate - 4-10 rounds (start adjusting club distances and dispersion)
 *   strong   - 10+ rounds (full personalization, AI recommendations)
 */

import { supabase } from '../config/supabase';

// In-memory cache (lives for the duration of the app session)
let _cachedInsights = null;
let _cachedUserId = null;

// ============================================================================
// DATA LEVEL THRESHOLDS
// ============================================================================

const DATA_LEVELS = {
  none: { minRounds: 0, minShots: 0 },
  minimal: { minRounds: 1, minShots: 10 },
  moderate: { minRounds: 4, minShots: 50 },
  strong: { minRounds: 10, minShots: 150 },
};

/**
 * Determine data quality level from shot/round counts.
 */
function determineDataLevel(totalRounds, totalShots) {
  if (totalRounds >= DATA_LEVELS.strong.minRounds && totalShots >= DATA_LEVELS.strong.minShots) {
    return 'strong';
  }
  if (totalRounds >= DATA_LEVELS.moderate.minRounds && totalShots >= DATA_LEVELS.moderate.minShots) {
    return 'moderate';
  }
  if (totalRounds >= DATA_LEVELS.minimal.minRounds && totalShots >= DATA_LEVELS.minimal.minShots) {
    return 'minimal';
  }
  return 'none';
}

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load player insights from Supabase.
 * Call at round start; results are cached in memory.
 *
 * @param {string} userId
 * @param {boolean} forceRefresh - Skip cache and re-fetch
 * @returns {Object} { clubStats, tendencies, dataQuality, error }
 */
export async function loadPlayerInsights(userId, forceRefresh = false) {
  // Return cached data if same user and not forcing refresh
  if (!forceRefresh && _cachedInsights && _cachedUserId === userId) {
    return _cachedInsights;
  }

  try {
    // Fetch club stats and tendencies in parallel
    const [clubStatsResult, tendenciesResult, roundCountResult] = await Promise.all([
      supabase
        .from('user_club_stats')
        .select('*')
        .eq('user_id', userId),
      supabase
        .from('user_tendencies')
        .select('*')
        .eq('user_id', userId),
      supabase
        .from('rounds')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed'),
    ]);

    if (clubStatsResult.error) {
      console.warn('[Insights] Error fetching club stats:', clubStatsResult.error.message);
    }
    if (tendenciesResult.error) {
      console.warn('[Insights] Error fetching tendencies:', tendenciesResult.error.message);
    }

    // Build club stats map: { clubId: stats }
    const clubStats = {};
    const totalShots = (clubStatsResult.data || []).reduce((sum, row) => {
      clubStats[row.club] = {
        club: row.club,
        avgDistance: row.avg_distance,
        medianDistance: row.median_distance,
        stdDistance: row.std_distance,
        maxDistance: row.max_distance,
        minDistance: row.min_distance,
        avgOffline: row.avg_offline,
        stdOffline: row.std_offline,
        missLeftPct: row.miss_left_pct,
        missRightPct: row.miss_right_pct,
        missShortPct: row.miss_short_pct,
        missLongPct: row.miss_long_pct,
        dispersionRadius: row.dispersion_radius,
        lateralDispersion: row.lateral_dispersion,
        distanceDispersion: row.distance_dispersion,
        avgDistanceToTarget: row.avg_distance_to_target,
        totalShots: row.total_shots,
        last10Avg: row.last_10_avg,
      };
      return sum + (row.total_shots || 0);
    }, 0);

    // Build tendencies array
    const tendencies = (tendenciesResult.data || []).map(row => ({
      type: row.tendency_type,
      key: row.tendency_key,
      data: row.tendency_data,
      confidence: row.confidence,
      sampleSize: row.sample_size,
    }));

    const totalRounds = roundCountResult.count || 0;
    const dataLevel = determineDataLevel(totalRounds, totalShots);

    const insights = {
      clubStats,
      tendencies,
      dataQuality: {
        totalShots,
        totalRounds,
        dataLevel,
        clubsTracked: Object.keys(clubStats).length,
        tendenciesDetected: tendencies.length,
      },
      error: null,
    };

    // Cache
    _cachedInsights = insights;
    _cachedUserId = userId;

    console.log(`[Insights] Loaded: ${dataLevel} level, ${totalShots} shots, ${totalRounds} rounds, ${Object.keys(clubStats).length} clubs, ${tendencies.length} tendencies`);

    return insights;
  } catch (error) {
    console.error('[Insights] Error loading insights:', error);
    return {
      clubStats: {},
      tendencies: [],
      dataQuality: { totalShots: 0, totalRounds: 0, dataLevel: 'none', clubsTracked: 0, tendenciesDetected: 0 },
      error: error.message,
    };
  }
}

// ============================================================================
// ACCESSORS (use after loadPlayerInsights)
// ============================================================================

/**
 * Get measured stats for a specific club.
 * Returns null if no data or insufficient samples.
 *
 * @param {string} club - Club identifier
 * @param {number} minShots - Minimum shots required (default 5)
 * @returns {Object|null} Club stats or null
 */
export function getClubStats(club, minShots = 5) {
  if (!_cachedInsights?.clubStats?.[club]) return null;
  const stats = _cachedInsights.clubStats[club];
  return stats.totalShots >= minShots ? stats : null;
}

/**
 * Get all club stats.
 * @returns {Object} Map of club -> stats
 */
export function getAllClubStats() {
  return _cachedInsights?.clubStats || {};
}

/**
 * Get tendencies by type.
 *
 * @param {string} type - Tendency type (e.g., 'club_bias', 'distance_range', 'condition')
 * @param {number} minConfidence - Minimum confidence threshold (default 0.3)
 * @returns {Array} Matching tendencies
 */
export function getTendenciesByType(type, minConfidence = 0.3) {
  if (!_cachedInsights?.tendencies) return [];
  return _cachedInsights.tendencies.filter(
    t => t.type === type && t.confidence >= minConfidence
  );
}

/**
 * Get a specific tendency by type and key.
 *
 * @param {string} type
 * @param {string} key
 * @returns {Object|null}
 */
export function getTendency(type, key) {
  if (!_cachedInsights?.tendencies) return null;
  return _cachedInsights.tendencies.find(
    t => t.type === type && t.key === key
  ) || null;
}

/**
 * Get the current data quality level.
 * @returns {string} 'none' | 'minimal' | 'moderate' | 'strong'
 */
export function getDataLevel() {
  return _cachedInsights?.dataQuality?.dataLevel || 'none';
}

/**
 * Check if data is sufficient for a specific feature.
 *
 * @param {string} feature - Feature name
 * @returns {boolean}
 */
export function isFeatureReady(feature) {
  const level = _cachedInsights?.dataQuality?.dataLevel || 'none';

  switch (feature) {
    case 'club_distance_override':    // Use measured avg instead of entered distance
    case 'measured_dispersion':       // Use measured dispersion instead of formula
      return level === 'moderate' || level === 'strong';
    case 'miss_compensation':         // Shift aim points based on miss tendencies
    case 'strategy_adjustment':       // Adjust par 3/5 strategy based on scoring
      return level === 'strong';
    case 'basic_stats_display':       // Show basic stats in UI
      return level !== 'none';
    case 'ai_recommendations':        // Claude API-powered advice
      return level === 'strong';
    default:
      return false;
  }
}

/**
 * Get the effective club distance, blending entered and measured values.
 *
 * @param {string} club - Club identifier
 * @param {number} enteredDistance - User-entered distance
 * @returns {number} Blended distance
 */
export function getEffectiveClubDistance(club, enteredDistance) {
  const stats = getClubStats(club, 5);
  if (!stats || !stats.avgDistance) return enteredDistance;

  // Blend based on confidence from sample size
  const confidence = calculateBlendConfidence(stats.totalShots);
  return Math.round(enteredDistance * (1 - confidence) + stats.avgDistance * confidence);
}

/**
 * Confidence for blending entered vs measured distance.
 */
function calculateBlendConfidence(sampleSize) {
  if (sampleSize < 5) return 0;
  if (sampleSize < 10) return 0.2;
  if (sampleSize < 20) return 0.4;
  if (sampleSize < 30) return 0.6;
  if (sampleSize < 50) return 0.75;
  return 0.85;
}

/**
 * Get lateral aim adjustment for a club based on measured miss bias.
 * Returns yards to shift aim point (positive = shift right, negative = shift left).
 * The aim shift is opposite to the miss direction (miss right -> aim left).
 *
 * @param {string} club - Club identifier
 * @returns {number} Aim offset in yards (0 if no data)
 */
export function getAimAdjustment(club) {
  const stats = getClubStats(club, 10);
  if (!stats || stats.avgOffline == null) return 0;

  // Only adjust if bias is meaningful (>3 yards)
  if (Math.abs(stats.avgOffline) < 3) return 0;

  const confidence = calculateBlendConfidence(stats.totalShots);
  // Negate: if player misses right (+), aim left (-)
  return -Math.round(stats.avgOffline * confidence * 10) / 10;
}

/**
 * Clear cached insights (call on sign out or user switch).
 */
export function clearInsightsCache() {
  _cachedInsights = null;
  _cachedUserId = null;
}
