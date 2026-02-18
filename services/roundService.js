/**
 * Round Service
 *
 * Handles CRUD operations for golf rounds and per-hole scoring.
 */

import { supabase } from '../config/supabase';

/**
 * Create a new round when the player starts playing.
 */
export async function createRound(userId, course, tee, weather = {}) {
  const { data, error } = await supabase
    .from('rounds')
    .insert({
      user_id: userId,
      course_id: course.id,
      tee_box_id: tee.id || null,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      tee_color: tee.color || tee.name,
      tee_yardage: tee.yardage,
      tee_rating: tee.rating,
      tee_slope: tee.slope,
      course_par: tee.parTotal || null,
      weather_temp_f: weather.temp_f || null,
      weather_wind_mph: weather.wind_mph || null,
      weather_condition: weather.condition || null,
      holes_played: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating round:', error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Save or update a single hole's score and stats.
 * Uses upsert so it works for both initial save and corrections.
 */
export async function saveHoleScore(roundId, holeNumber, holeData) {
  const { data, error } = await supabase
    .from('round_holes')
    .upsert(
      {
        round_id: roundId,
        hole_number: holeNumber,
        score: holeData.score,
        putts: holeData.putts ?? null,
        fairway_hit: holeData.fairway_hit ?? null,
        gir: holeData.gir ?? null,
        par: holeData.par,
        yardage: holeData.yardage,
        handicap_index: holeData.handicap_index,
        penalties: holeData.penalties ?? 0,
      },
      { onConflict: 'round_id,hole_number' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error saving hole score:', error.message);
    return { data: null, error: error.message };
  }

  // Update holes_played count on the round
  await supabase
    .from('rounds')
    .update({ holes_played: holeNumber })
    .eq('id', roundId);

  return { data, error: null };
}

/**
 * Mark a round as completed and compute summary stats.
 */
export async function completeRound(roundId) {
  // Fetch all hole scores for this round
  const { data: holes, error: fetchError } = await supabase
    .from('round_holes')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number', { ascending: true });

  if (fetchError) {
    console.error('Error fetching round holes:', fetchError.message);
    return { data: null, error: fetchError.message };
  }

  // Compute summary stats
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
      if (h.hole_number <= 9) frontNine += h.score;
      else backNine += h.score;
    }
    if (h.putts != null) totalPutts += h.putts;
    if (h.par) totalPar += h.par;

    // FIR: only count par 4s and par 5s
    if (h.par >= 4 && h.fairway_hit !== 'na' && h.fairway_hit != null) {
      fairwaysTotal++;
      if (h.fairway_hit === 'hit') fairwaysHit++;
    }

    // GIR
    if (h.gir != null) {
      girTotal++;
      if (h.gir) girCount++;
    }
  });

  const { data, error } = await supabase
    .from('rounds')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_score: totalScore,
      total_putts: totalPutts,
      front_nine_score: frontNine,
      back_nine_score: backNine,
      fairways_hit: fairwaysHit,
      fairways_total: fairwaysTotal,
      greens_in_reg: girCount,
      greens_total: girTotal,
      holes_played: (holes || []).length,
      score_to_par: totalScore - totalPar,
    })
    .eq('id', roundId)
    .select()
    .single();

  if (error) {
    console.error('Error completing round:', error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Mark a round as abandoned (user quit early).
 */
export async function abandonRound(roundId) {
  const { data, error } = await supabase
    .from('rounds')
    .update({ status: 'abandoned', completed_at: new Date().toISOString() })
    .eq('id', roundId)
    .select()
    .single();

  if (error) {
    console.error('Error abandoning round:', error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Fetch completed rounds for the current user, most recent first.
 */
export async function fetchRoundHistory(userId, limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('rounds')
    .select(`
      *,
      course:Courses(id, name, city, state)
    `)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching round history:', error.message);
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Fetch a single round with all hole scores.
 */
export async function fetchRoundDetail(roundId) {
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select(`
      *,
      course:Courses(id, name, city, state)
    `)
    .eq('id', roundId)
    .single();

  if (roundError) {
    console.error('Error fetching round:', roundError.message);
    return { data: null, error: roundError.message };
  }

  const { data: holes, error: holesError } = await supabase
    .from('round_holes')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number', { ascending: true });

  if (holesError) {
    console.error('Error fetching round holes:', holesError.message);
    return { data: null, error: holesError.message };
  }

  return {
    data: { ...round, holes: holes || [] },
    error: null,
  };
}

/**
 * Fetch the user's in-progress round (if any), for resume support.
 * Includes course name for display purposes.
 */
export async function fetchInProgressRound(userId) {
  const { data, error } = await supabase
    .from('rounds')
    .select(`
      *,
      course:Courses(id, name, city, state)
    `)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching in-progress round:', error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Submit a complete round with all holes in a batch operation.
 * Used when submitting a locally-cached round to the database.
 *
 * @param {Object} roundData - The round metadata and computed stats
 * @param {Array} holesData - Array of hole scores
 * @returns {Object} { data: round, error: string|null }
 */
export async function submitCompleteRound(roundData, holesData, shotsData = []) {
  try {
    // First, create the round record
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        user_id: roundData.userId,
        course_id: roundData.courseId,
        tee_box_id: roundData.teeBoxId || null,
        status: 'completed',
        started_at: roundData.startedAt,
        completed_at: roundData.completedAt || new Date().toISOString(),
        tee_color: roundData.teeColor,
        tee_yardage: roundData.teeYardage,
        tee_rating: roundData.teeRating,
        tee_slope: roundData.teeSlope,
        course_par: roundData.coursePar || null,
        weather_temp_f: roundData.weatherTempF || null,
        weather_wind_mph: roundData.weatherWindMph || null,
        weather_condition: roundData.weatherCondition || null,
        total_score: roundData.totalScore,
        total_putts: roundData.totalPutts,
        front_nine_score: roundData.frontNineScore,
        back_nine_score: roundData.backNineScore,
        fairways_hit: roundData.fairwaysHit,
        fairways_total: roundData.fairwaysTotal,
        greens_in_reg: roundData.greensInReg,
        greens_total: roundData.greensTotal,
        holes_played: roundData.holesPlayed,
        score_to_par: roundData.scoreToPar,
      })
      .select()
      .single();

    if (roundError) {
      console.error('Error creating round in batch submit:', roundError.message);
      return { data: null, error: roundError.message };
    }

    // Now insert all holes with the round ID
    if (holesData && holesData.length > 0) {
      const holesWithRoundId = holesData.map(h => ({
        round_id: round.id,
        hole_number: h.holeNumber,
        score: h.score,
        putts: h.putts ?? null,
        fairway_hit: h.fairwayHit ?? null,
        gir: h.gir ?? null,
        par: h.par,
        yardage: h.yardage,
        handicap_index: h.handicapIndex,
        penalties: h.penalties ?? 0,
      }));

      const { error: holesError } = await supabase
        .from('round_holes')
        .insert(holesWithRoundId);

      if (holesError) {
        console.error('Error inserting holes in batch submit:', holesError.message);
        // Round was created but holes failed - still return the round
        // The caller may want to retry hole insertion
        return { data: round, error: `Round created but holes failed: ${holesError.message}` };
      }
    }

    // Insert all shots with the round ID
    if (shotsData && shotsData.length > 0) {
      const shotsWithRoundId = shotsData.map(s => ({
        round_id: round.id,
        hole_number: s.holeNumber,
        shot_number: s.shotNumber,
        from_lat: s.fromLat,
        from_lon: s.fromLon,
        from_elevation: s.fromElevation || null,
        to_lat: s.toLat || null,
        to_lon: s.toLon || null,
        to_elevation: s.toElevation || null,
        target_lat: s.targetLat || null,
        target_lon: s.targetLon || null,
        club: s.club,
        lie_type: s.lieType || 'fairway',
        result: s.result || null,
        distance_actual: s.distanceActual || null,
        distance_planned: s.distancePlanned || null,
        distance_to_target: s.distanceToTarget || null,
        distance_offline: s.distanceOffline || null,
        wind_speed: s.windSpeed || null,
        wind_direction: s.windDirection || null,
        temperature_f: s.temperatureF || null,
        effective_distance: s.effectiveDistance || null,
        shot_feel: s.shotFeel || null,
        felt_good: s.feltGood ?? null,
        played_at: s.playedAt || new Date().toISOString(),
      }));

      const { error: shotsError } = await supabase
        .from('round_shots')
        .insert(shotsWithRoundId);

      if (shotsError) {
        console.error('Error inserting shots in batch submit:', shotsError.message);
        // Round and holes created but shots failed - still return the round
        return { data: round, error: `Round created but shots failed: ${shotsError.message}` };
      }

      console.log(`Inserted ${shotsWithRoundId.length} shots for round ${round.id}`);
    }

    console.log('Batch round submission complete:', round.id);
    return { data: round, error: null };
  } catch (err) {
    console.error('Exception in submitCompleteRound:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Fetch a user's round history at a specific course.
 * Returns completed rounds with summary stats for course overview display.
 * @param {string} userId - User ID
 * @param {string} courseId - Course ID
 * @returns {Object} { data: { rounds, stats }, error }
 */
export async function fetchCourseHistory(userId, courseId) {
  const { data: rounds, error } = await supabase
    .from('rounds')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching course history:', error.message);
    return { data: null, error: error.message };
  }

  if (!rounds || rounds.length === 0) {
    return { data: { rounds: [], stats: null }, error: null };
  }

  // Compute aggregate stats
  const scores = rounds.map(r => r.total_score).filter(Boolean);
  const putts = rounds.map(r => r.total_putts).filter(Boolean);
  const firRounds = rounds.filter(r => r.fairways_hit != null && r.fairways_total);
  const girRounds = rounds.filter(r => r.greens_in_reg != null && r.greens_total);

  const stats = {
    roundsPlayed: rounds.length,
    averageScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    bestScore: scores.length > 0 ? Math.min(...scores) : null,
    worstScore: scores.length > 0 ? Math.max(...scores) : null,
    averagePutts: putts.length > 0 ? Math.round((putts.reduce((a, b) => a + b, 0) / putts.length) * 10) / 10 : null,
    firPercent: firRounds.length > 0
      ? Math.round((firRounds.reduce((a, r) => a + r.fairways_hit, 0) / firRounds.reduce((a, r) => a + r.fairways_total, 0)) * 100)
      : null,
    girPercent: girRounds.length > 0
      ? Math.round((girRounds.reduce((a, r) => a + r.greens_in_reg, 0) / girRounds.reduce((a, r) => a + r.greens_total, 0)) * 100)
      : null,
    lastPlayed: rounds[0]?.started_at || null,
    scoreTrend: scores.length >= 2 ? scores.slice(0, 5) : [],
  };

  // Find trouble holes (holes where avg score is worst relative to par)
  // Fetch hole data for recent rounds (up to 5)
  const recentRoundIds = rounds.slice(0, 5).map(r => r.id);
  const { data: holeScores } = await supabase
    .from('round_holes')
    .select('hole_number, score, par')
    .in('round_id', recentRoundIds);

  if (holeScores && holeScores.length > 0) {
    const holeMap = {};
    holeScores.forEach(h => {
      if (!holeMap[h.hole_number]) holeMap[h.hole_number] = { scores: [], par: h.par };
      if (h.score != null) holeMap[h.hole_number].scores.push(h.score);
    });

    const holeAvgs = Object.entries(holeMap).map(([hole, data]) => ({
      hole: parseInt(hole),
      avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      par: data.par,
      avgOverPar: (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) - data.par,
      timesPlayed: data.scores.length,
    }));

    // Trouble holes: worst avg over par (at least played twice)
    stats.troubleHoles = holeAvgs
      .filter(h => h.timesPlayed >= 2 && h.avgOverPar > 0.5)
      .sort((a, b) => b.avgOverPar - a.avgOverPar)
      .slice(0, 3)
      .map(h => ({ hole: h.hole, avgOverPar: Math.round(h.avgOverPar * 10) / 10, par: h.par }));

    // Best holes: best avg under par
    stats.bestHoles = holeAvgs
      .filter(h => h.timesPlayed >= 2 && h.avgOverPar < 0)
      .sort((a, b) => a.avgOverPar - b.avgOverPar)
      .slice(0, 3)
      .map(h => ({ hole: h.hole, avgOverPar: Math.round(h.avgOverPar * 10) / 10, par: h.par }));
  } else {
    stats.troubleHoles = [];
    stats.bestHoles = [];
  }

  return { data: { rounds, stats }, error: null };
}

/**
 * Fetch all shots for a given round.
 * @param {string} roundId - Round ID
 * @returns {Object} { data: Array, error: string|null }
 */
export async function fetchRoundShots(roundId) {
  const { data, error } = await supabase
    .from('round_shots')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number', { ascending: true })
    .order('shot_number', { ascending: true });

  if (error) {
    console.error('Error fetching round shots:', error.message);
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Fetch all shots for a user across all rounds (for analytics).
 * @param {string} userId - User ID
 * @param {number} limit - Max shots to return (default 5000)
 * @returns {Object} { data: Array, error: string|null }
 */
export async function fetchAllUserShots(userId, limit = 5000) {
  const { data, error } = await supabase
    .from('round_shots')
    .select(`
      *,
      round:rounds!inner(user_id, course_id, status)
    `)
    .eq('round.user_id', userId)
    .eq('round.status', 'completed')
    .order('played_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching user shots:', error.message);
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}
