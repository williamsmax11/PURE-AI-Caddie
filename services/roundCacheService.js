/**
 * Round Cache Service
 *
 * Manages local caching of round data during play.
 * Data is stored locally and only pushed to Supabase when the round is submitted.
 * This enables:
 * - Offline play capability
 * - Resume after app crash/close
 * - Reduced API calls during play
 * - Batch submission on round completion
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY_ACTIVE_ROUND = '@Pure:activeRound';
const CACHE_KEY_ROUND_HOLES = '@Pure:roundHoles';
const CACHE_KEY_AI_PLANS = '@Pure:aiPlans';
const CACHE_KEY_ROUND_SHOTS = '@Pure:roundShots';

/**
 * Initialize a new cached round when starting play.
 * This creates the local round data structure without hitting the database.
 *
 * @param {Object} params - Round initialization parameters
 * @param {string} params.tempId - Temporary local ID (e.g., uuid or timestamp)
 * @param {string} params.userId - User's ID
 * @param {Object} params.course - Course object with id, name, etc.
 * @param {Object} params.tee - Selected tee box data
 * @param {Object} params.weather - Weather conditions (optional)
 * @returns {Promise<Object>} The cached round object
 */
export async function initCachedRound({ tempId, userId, course, tee, weather = {} }) {
  const cachedRound = {
    tempId,
    userId,
    courseId: course.id,
    courseName: course.name,
    courseCity: course.city,
    courseState: course.state,
    teeBoxId: tee.id || null,
    teeColor: tee.color || tee.name,
    teeYardage: tee.yardage,
    teeRating: tee.rating,
    teeSlope: tee.slope,
    coursePar: tee.parTotal || null,
    weatherTempF: weather.temp_f || null,
    weatherWindMph: weather.wind_mph || null,
    weatherCondition: weather.condition || null,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    currentHole: 1,
    holesPlayed: 0,
    dbRoundId: null, // Will be set after pushing to DB
  };

  await AsyncStorage.setItem(CACHE_KEY_ACTIVE_ROUND, JSON.stringify(cachedRound));
  // Initialize empty holes array
  await AsyncStorage.setItem(CACHE_KEY_ROUND_HOLES, JSON.stringify([]));
  // Initialize empty AI plans
  await AsyncStorage.setItem(CACHE_KEY_AI_PLANS, JSON.stringify({}));
  // Initialize empty shots array
  await AsyncStorage.setItem(CACHE_KEY_ROUND_SHOTS, JSON.stringify([]));

  console.log('[RoundCache] Initialized new cached round:', tempId);
  return cachedRound;
}

/**
 * Get the currently active cached round (if any).
 * @returns {Promise<Object|null>} The cached round or null
 */
export async function getActiveCachedRound() {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY_ACTIVE_ROUND);
    if (data) {
      const round = JSON.parse(data);
      console.log('[RoundCache] Found active cached round:', round.tempId);
      return round;
    }
    return null;
  } catch (error) {
    console.error('[RoundCache] Error getting active round:', error);
    return null;
  }
}

/**
 * Get all cached hole scores for the active round.
 * @returns {Promise<Array>} Array of hole score objects
 */
export async function getCachedHoles() {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY_ROUND_HOLES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[RoundCache] Error getting cached holes:', error);
    return [];
  }
}

/**
 * Save or update a hole's score in the local cache.
 *
 * @param {number} holeNumber - Hole number (1-18)
 * @param {Object} holeData - Hole score data
 * @param {number} holeData.score - Strokes for the hole
 * @param {number} holeData.putts - Number of putts
 * @param {string} holeData.fairway_hit - 'hit', 'left', 'right', or 'na'
 * @param {boolean} holeData.gir - Green in regulation
 * @param {number} holeData.par - Par for the hole
 * @param {number} holeData.yardage - Yardage of the hole
 * @param {number} holeData.handicap_index - Hole handicap
 * @param {number} holeData.penalties - Penalty strokes
 * @returns {Promise<void>}
 */
export async function saveHoleToCache(holeNumber, holeData) {
  try {
    const holes = await getCachedHoles();

    // Find existing hole entry or create new one
    const existingIndex = holes.findIndex(h => h.holeNumber === holeNumber);
    const holeEntry = {
      holeNumber,
      score: holeData.score,
      putts: holeData.putts ?? null,
      fairwayHit: holeData.fairway_hit ?? null,
      gir: holeData.gir ?? null,
      par: holeData.par,
      yardage: holeData.yardage,
      handicapIndex: holeData.handicap_index,
      penalties: holeData.penalties ?? 0,
      savedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      holes[existingIndex] = holeEntry;
    } else {
      holes.push(holeEntry);
    }

    await AsyncStorage.setItem(CACHE_KEY_ROUND_HOLES, JSON.stringify(holes));

    // Update holes played count in active round
    const round = await getActiveCachedRound();
    if (round) {
      round.holesPlayed = holes.length;
      round.currentHole = holeNumber + 1;
      await AsyncStorage.setItem(CACHE_KEY_ACTIVE_ROUND, JSON.stringify(round));
    }

    console.log('[RoundCache] Saved hole', holeNumber, 'to cache');
  } catch (error) {
    console.error('[RoundCache] Error saving hole to cache:', error);
    throw error;
  }
}

/**
 * Update the current hole number in the cache.
 * @param {number} holeNumber - Current hole being played
 * @returns {Promise<void>}
 */
export async function updateCurrentHole(holeNumber) {
  try {
    const round = await getActiveCachedRound();
    if (round) {
      round.currentHole = holeNumber;
      await AsyncStorage.setItem(CACHE_KEY_ACTIVE_ROUND, JSON.stringify(round));
      console.log('[RoundCache] Updated current hole to:', holeNumber);
    }
  } catch (error) {
    console.error('[RoundCache] Error updating current hole:', error);
  }
}

/**
 * Save an AI plan for a specific hole to the cache.
 *
 * @param {number} holeNumber - Hole number
 * @param {Object} plan - AI plan data (shots, text, metadata)
 * @returns {Promise<void>}
 */
export async function saveAIPlanToCache(holeNumber, plan) {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY_AI_PLANS);
    const plans = data ? JSON.parse(data) : {};

    plans[holeNumber] = {
      ...plan,
      cachedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(CACHE_KEY_AI_PLANS, JSON.stringify(plans));
    console.log('[RoundCache] Saved AI plan for hole', holeNumber);
  } catch (error) {
    console.error('[RoundCache] Error saving AI plan:', error);
  }
}

/**
 * Get cached AI plan for a specific hole.
 *
 * @param {number} holeNumber - Hole number
 * @returns {Promise<Object|null>} The cached plan or null
 */
export async function getCachedAIPlan(holeNumber) {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY_AI_PLANS);
    const plans = data ? JSON.parse(data) : {};
    return plans[holeNumber] || null;
  } catch (error) {
    console.error('[RoundCache] Error getting AI plan:', error);
    return null;
  }
}

/**
 * Get all cached AI plans.
 * @returns {Promise<Object>} Object mapping hole numbers to plans
 */
export async function getAllCachedAIPlans() {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY_AI_PLANS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('[RoundCache] Error getting all AI plans:', error);
    return {};
  }
}

/**
 * Link the cached round to a database round ID.
 * Called after the round is created in Supabase.
 *
 * @param {string} dbRoundId - The round ID from Supabase
 * @returns {Promise<void>}
 */
export async function linkCacheToDbRound(dbRoundId) {
  try {
    const round = await getActiveCachedRound();
    if (round) {
      round.dbRoundId = dbRoundId;
      await AsyncStorage.setItem(CACHE_KEY_ACTIVE_ROUND, JSON.stringify(round));
      console.log('[RoundCache] Linked cache to DB round:', dbRoundId);
    }
  } catch (error) {
    console.error('[RoundCache] Error linking cache to DB:', error);
  }
}

// ============================================================================
// SHOT CACHING
// ============================================================================

/**
 * Save a shot to the local cache during play.
 *
 * @param {Object} shotData - Shot data to cache
 * @param {number} shotData.holeNumber - Hole number (1-18)
 * @param {number} shotData.shotNumber - Shot number within the hole
 * @param {Object} shotData.from - GPS position where player hit from { latitude, longitude, elevation? }
 * @param {Object} shotData.to - GPS position where ball landed (may be null until next shot)
 * @param {Object} shotData.target - Planned target position from AI { latitude, longitude }
 * @param {string} shotData.club - Club used (e.g., 'driver', '7_iron')
 * @param {string} shotData.lieType - Lie type (tee, fairway, rough, bunker, fringe, green)
 * @param {string} shotData.result - Outcome (fairway, rough_left, rough_right, bunker, water, ob, green, fringe)
 * @param {number} shotData.distanceActual - GPS-measured distance in yards
 * @param {number} shotData.distancePlanned - Planned distance from AI recommendation
 * @param {number} shotData.distanceToTarget - Distance from actual landing to target
 * @param {number} shotData.distanceOffline - Lateral miss in yards (+ = right, - = left)
 * @param {number} shotData.windSpeed - Wind speed at time of shot
 * @param {string} shotData.windDirection - Wind direction at time of shot
 * @param {number} shotData.temperatureF - Temperature at time of shot
 * @param {number} shotData.effectiveDistance - "Plays like" distance
 * @returns {Promise<void>}
 */
export async function saveShotToCache(shotData) {
  try {
    const shots = await getCachedShots();

    const shotEntry = {
      holeNumber: shotData.holeNumber,
      shotNumber: shotData.shotNumber,
      from: shotData.from || null,
      to: shotData.to || null,
      target: shotData.target || null,
      club: shotData.club,
      lieType: shotData.lieType || 'fairway',
      result: shotData.result || null,
      distanceActual: shotData.distanceActual || null,
      distancePlanned: shotData.distancePlanned || null,
      distanceToTarget: shotData.distanceToTarget || null,
      distanceOffline: shotData.distanceOffline || null,
      windSpeed: shotData.windSpeed || null,
      windDirection: shotData.windDirection || null,
      temperatureF: shotData.temperatureF || null,
      effectiveDistance: shotData.effectiveDistance || null,
      shotFeel: shotData.shotFeel || null,
      feltGood: shotData.feltGood ?? null,
      playedAt: new Date().toISOString(),
    };

    // Replace if same hole+shot number exists (edit), otherwise append
    const existingIndex = shots.findIndex(
      s => s.holeNumber === shotData.holeNumber && s.shotNumber === shotData.shotNumber
    );

    if (existingIndex >= 0) {
      shots[existingIndex] = shotEntry;
    } else {
      shots.push(shotEntry);
    }

    await AsyncStorage.setItem(CACHE_KEY_ROUND_SHOTS, JSON.stringify(shots));
    console.log('[RoundCache] Saved shot', shotData.shotNumber, 'on hole', shotData.holeNumber);
  } catch (error) {
    console.error('[RoundCache] Error saving shot to cache:', error);
  }
}

/**
 * Update the landing position (to) for a previously cached shot.
 * Called when the player reaches the ball and we know where it landed.
 *
 * @param {number} holeNumber - Hole number
 * @param {number} shotNumber - Shot number
 * @param {Object} landingPosition - { latitude, longitude, elevation? }
 * @param {number} distanceActual - Measured distance in yards
 * @param {number} distanceToTarget - Distance from landing to planned target
 * @param {number} distanceOffline - Lateral miss in yards
 * @returns {Promise<void>}
 */
export async function updateShotLanding(holeNumber, shotNumber, landingPosition, distanceActual, distanceToTarget, distanceOffline) {
  try {
    const shots = await getCachedShots();
    const index = shots.findIndex(
      s => s.holeNumber === holeNumber && s.shotNumber === shotNumber
    );

    if (index >= 0) {
      shots[index].to = landingPosition;
      if (distanceActual != null) shots[index].distanceActual = distanceActual;
      if (distanceToTarget != null) shots[index].distanceToTarget = distanceToTarget;
      if (distanceOffline != null) shots[index].distanceOffline = distanceOffline;
      await AsyncStorage.setItem(CACHE_KEY_ROUND_SHOTS, JSON.stringify(shots));
      console.log('[RoundCache] Updated landing for shot', shotNumber, 'on hole', holeNumber);
    }
  } catch (error) {
    console.error('[RoundCache] Error updating shot landing:', error);
  }
}

/**
 * Get all cached shots for the active round.
 * @returns {Promise<Array>} Array of shot objects
 */
export async function getCachedShots() {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY_ROUND_SHOTS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[RoundCache] Error getting cached shots:', error);
    return [];
  }
}

/**
 * Get cached shots for a specific hole.
 * @param {number} holeNumber - Hole number (1-18)
 * @returns {Promise<Array>} Array of shot objects for that hole
 */
export async function getCachedShotsForHole(holeNumber) {
  const shots = await getCachedShots();
  return shots.filter(s => s.holeNumber === holeNumber);
}

/**
 * Get the next shot number for a hole (1-based).
 * @param {number} holeNumber - Hole number
 * @returns {Promise<number>} Next shot number
 */
export async function getNextShotNumber(holeNumber) {
  const holeShots = await getCachedShotsForHole(holeNumber);
  return holeShots.length + 1;
}

/**
 * Delete a cached shot (if user wants to undo).
 * @param {number} holeNumber - Hole number
 * @param {number} shotNumber - Shot number to delete
 * @returns {Promise<void>}
 */
export async function deleteCachedShot(holeNumber, shotNumber) {
  try {
    let shots = await getCachedShots();
    shots = shots.filter(
      s => !(s.holeNumber === holeNumber && s.shotNumber === shotNumber)
    );

    // Renumber remaining shots for this hole
    const holeShots = shots.filter(s => s.holeNumber === holeNumber);
    holeShots.sort((a, b) => a.shotNumber - b.shotNumber);
    holeShots.forEach((s, i) => { s.shotNumber = i + 1; });

    await AsyncStorage.setItem(CACHE_KEY_ROUND_SHOTS, JSON.stringify(shots));
    console.log('[RoundCache] Deleted shot', shotNumber, 'on hole', holeNumber);
  } catch (error) {
    console.error('[RoundCache] Error deleting cached shot:', error);
  }
}

/**
 * Compute summary statistics from cached holes.
 * Same logic as roundService.completeRound but on local data.
 *
 * @param {Array} holes - Array of cached hole data
 * @returns {Object} Summary statistics
 */
export function computeRoundStats(holes) {
  let totalScore = 0;
  let totalPutts = 0;
  let frontNine = 0;
  let backNine = 0;
  let fairwaysHit = 0;
  let fairwaysTotal = 0;
  let girCount = 0;
  let girTotal = 0;
  let totalPar = 0;

  (holes || []).forEach((h) => {
    if (h.score != null) {
      totalScore += h.score;
      if (h.holeNumber <= 9) frontNine += h.score;
      else backNine += h.score;
    }
    if (h.putts != null) totalPutts += h.putts;
    if (h.par) totalPar += h.par;

    // FIR: only count par 4s and par 5s
    if (h.par >= 4 && h.fairwayHit !== 'na' && h.fairwayHit != null) {
      fairwaysTotal++;
      if (h.fairwayHit === 'hit') fairwaysHit++;
    }

    // GIR
    if (h.gir != null) {
      girTotal++;
      if (h.gir) girCount++;
    }
  });

  return {
    totalScore,
    totalPutts,
    frontNineScore: frontNine,
    backNineScore: backNine,
    fairwaysHit,
    fairwaysTotal,
    greensInReg: girCount,
    greensTotal: girTotal,
    holesPlayed: holes.length,
    scoreToPar: totalScore - totalPar,
  };
}

/**
 * Get all cached round data formatted for database submission.
 * This prepares the data structure needed by roundService.
 *
 * @returns {Promise<Object>} Object containing round and holes data for DB
 */
export async function getCacheDataForSubmission() {
  const round = await getActiveCachedRound();
  const holes = await getCachedHoles();
  const aiPlans = await getAllCachedAIPlans();
  const shots = await getCachedShots();
  const stats = computeRoundStats(holes);

  if (!round) {
    return null;
  }

  return {
    round: {
      tempId: round.tempId,
      dbRoundId: round.dbRoundId,
      userId: round.userId,
      courseId: round.courseId,
      teeBoxId: round.teeBoxId,
      status: 'completed',
      startedAt: round.startedAt,
      completedAt: new Date().toISOString(),
      teeColor: round.teeColor,
      teeYardage: round.teeYardage,
      teeRating: round.teeRating,
      teeSlope: round.teeSlope,
      coursePar: round.coursePar,
      weatherTempF: round.weatherTempF,
      weatherWindMph: round.weatherWindMph,
      weatherCondition: round.weatherCondition,
      ...stats,
    },
    holes: holes.map(h => ({
      holeNumber: h.holeNumber,
      score: h.score,
      putts: h.putts,
      fairwayHit: h.fairwayHit,
      gir: h.gir,
      par: h.par,
      yardage: h.yardage,
      handicapIndex: h.handicapIndex,
      penalties: h.penalties,
    })),
    shots: shots.map(s => ({
      holeNumber: s.holeNumber,
      shotNumber: s.shotNumber,
      fromLat: s.from?.latitude || null,
      fromLon: s.from?.longitude || null,
      fromElevation: s.from?.elevation || null,
      toLat: s.to?.latitude || null,
      toLon: s.to?.longitude || null,
      toElevation: s.to?.elevation || null,
      targetLat: s.target?.latitude || null,
      targetLon: s.target?.longitude || null,
      club: s.club,
      lieType: s.lieType,
      result: s.result,
      distanceActual: s.distanceActual,
      distancePlanned: s.distancePlanned,
      distanceToTarget: s.distanceToTarget,
      distanceOffline: s.distanceOffline,
      windSpeed: s.windSpeed,
      windDirection: s.windDirection,
      temperatureF: s.temperatureF,
      effectiveDistance: s.effectiveDistance,
      shotFeel: s.shotFeel || null,
      feltGood: s.feltGood ?? null,
      playedAt: s.playedAt,
    })),
    aiPlans,
  };
}

/**
 * Clear all cached round data.
 * Called after successful submission to database or when abandoning a round.
 *
 * @returns {Promise<void>}
 */
export async function clearRoundCache() {
  try {
    await AsyncStorage.multiRemove([
      CACHE_KEY_ACTIVE_ROUND,
      CACHE_KEY_ROUND_HOLES,
      CACHE_KEY_AI_PLANS,
      CACHE_KEY_ROUND_SHOTS,
    ]);
    console.log('[RoundCache] Cache cleared');
  } catch (error) {
    console.error('[RoundCache] Error clearing cache:', error);
  }
}

/**
 * Check if there's a resumable round in the cache.
 * Returns true if there's an in-progress round that hasn't been synced.
 *
 * @returns {Promise<boolean>}
 */
export async function hasResumableRound() {
  const round = await getActiveCachedRound();
  return round !== null && round.status === 'in_progress';
}

/**
 * Get resume data for displaying "Continue Round" UI.
 *
 * @returns {Promise<Object|null>} Resume info or null
 */
export async function getResumeInfo() {
  const round = await getActiveCachedRound();
  const holes = await getCachedHoles();
  const shots = await getCachedShots();

  if (!round) {
    return null;
  }

  return {
    tempId: round.tempId,
    dbRoundId: round.dbRoundId,
    courseName: round.courseName,
    courseCity: round.courseCity,
    courseState: round.courseState,
    teeColor: round.teeColor,
    currentHole: round.currentHole,
    holesPlayed: holes.length,
    shotsLogged: shots.length,
    startedAt: round.startedAt,
    // Reconstruct course and tee objects for the game
    course: {
      id: round.courseId,
      name: round.courseName,
      city: round.courseCity,
      state: round.courseState,
    },
    tee: {
      id: round.teeBoxId,
      color: round.teeColor,
      name: round.teeColor,
      yardage: round.teeYardage,
      rating: round.teeRating,
      slope: round.teeSlope,
    },
    holes: holes.map(h => ({
      hole: h.holeNumber,
      score: h.score,
      putts: h.putts,
      fairwayHit: h.fairwayHit,
      girHit: h.gir,
      penalties: h.penalties,
    })),
  };
}
