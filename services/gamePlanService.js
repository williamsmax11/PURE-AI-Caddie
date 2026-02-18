/**
 * Game Plan Service
 *
 * Generates a pre-round game plan using real course data, player profile,
 * and round history. Target score uses the USGA formula:
 *
 *   Expected Score = Course Rating + (Handicap Index × Slope Rating / 113)
 *
 * 113 is the USGA "standard" slope — a course with slope 113 plays at
 * exactly your handicap. Higher slope = harder course = more strokes added.
 *
 * When history exists, the prediction blends the formula with actual
 * average scores at that course.
 */

import { fetchCourseHoles } from './courseService';
import { fetchCourseHistory } from './roundService';
import { supabase } from '../config/supabase';

// ============================================================================
// TARGET SCORE
// ============================================================================

/**
 * Calculate expected score from handicap and course/tee data.
 * @param {number|string|null} handicap - Player handicap index (can be text like "15.2")
 * @param {number|null} courseRating - Course rating for the selected tee
 * @param {number|null} slopeRating - Slope rating for the selected tee
 * @returns {number|null} Expected score, or null if data is missing
 */
function calculateExpectedScore(handicap, courseRating, slopeRating) {
  const hcap = parseFloat(handicap);
  if (isNaN(hcap) || !courseRating || !slopeRating) return null;

  // USGA Course Handicap formula
  const courseHandicap = (hcap * slopeRating) / 113;
  return Math.round(courseRating + courseHandicap);
}

/**
 * Blend formula-based prediction with actual scoring history.
 * Weight shifts toward history as more rounds are recorded.
 * @param {number|null} formulaScore - From USGA calculation
 * @param {number|null} avgScore - Historical average at this course
 * @param {number} roundCount - Number of completed rounds at this course
 * @returns {{target: number|null, confidence: string, note: string}}
 */
function blendTargetScore(formulaScore, avgScore, roundCount) {
  if (formulaScore === null && avgScore === null) {
    return { target: null, confidence: 'none', note: 'Add your handicap to get a target score' };
  }

  if (formulaScore === null) {
    // No handicap but have history
    return {
      target: avgScore,
      confidence: roundCount >= 3 ? 'high' : 'medium',
      note: `Based on ${roundCount} round${roundCount !== 1 ? 's' : ''} here`,
    };
  }

  // Always use the pure USGA formula for the target score so it
  // stays consistent with the predicted score shown on course cards.
  // History context (avgScore, roundCount) is still used elsewhere
  // in the game plan (strategies, mental tips) but does not shift
  // the headline number.
  return {
    target: formulaScore,
    confidence: roundCount >= 3 ? 'high' : roundCount > 0 ? 'medium' : 'low',
    note: roundCount > 0
      ? `Based on handicap & course difficulty (${roundCount} round${roundCount !== 1 ? 's' : ''} played here)`
      : 'Based on your handicap and course difficulty',
  };
}

// ============================================================================
// BIRDIE OPPORTUNITIES & DANGER ZONES
// ============================================================================

/**
 * Identify birdie opportunity holes (handicap index 17, 18 = easiest).
 * If there are fewer than 2 with index 17-18, also include 15, 16.
 */
function findBirdieOpportunities(holes, holeHistory) {
  if (!holes || holes.length === 0) return [];

  // Sort by handicap index descending (18 = easiest first)
  const easiest = [...holes]
    .filter(h => h.handicapIndex != null)
    .sort((a, b) => b.handicapIndex - a.handicapIndex);

  // Take holes with handicap 15-18 (easiest 4 holes), limit to 3
  const candidates = easiest.filter(h => h.handicapIndex >= 15).slice(0, 3);

  // If we don't have enough, take the easiest available
  if (candidates.length < 2) {
    const needed = 2 - candidates.length;
    const existing = new Set(candidates.map(c => c.holeNumber));
    const extras = easiest.filter(h => !existing.has(h.holeNumber)).slice(0, needed);
    candidates.push(...extras);
  }

  return candidates.map(hole => {
    const history = holeHistory?.[hole.holeNumber];
    const waterHazards = hole.hazards.filter(h => h.type === 'water').length;
    const bunkers = hole.hazards.filter(h => h.type === 'bunker').length;

    // Build a brief strategy tip
    let tip = '';
    if (hole.par === 5) {
      tip = hole.yardage < 500
        ? 'Reachable in two for eagle/birdie chance'
        : 'Good layup position sets up short approach';
    } else if (hole.par === 3) {
      tip = 'Hit the green and give yourself a birdie putt';
    } else {
      tip = hole.yardage < 350
        ? 'Short hole where accuracy off the tee is key'
        : 'Find the fairway and attack the pin';
    }

    if (waterHazards > 0) tip += '. Watch the water';
    if (bunkers >= 2) tip += '. Avoid greenside bunkers';

    return {
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
      handicapIndex: hole.handicapIndex,
      hazards: { water: waterHazards, bunkers },
      avgScore: history?.avgScore ?? null,
      tip,
    };
  });
}

/**
 * Identify danger zone holes:
 * - Handicap index 1, 2 (hardest holes)
 * - Holes with lots of hazards
 * - Holes where the player historically scores poorly
 */
function findDangerZones(holes, holeHistory) {
  if (!holes || holes.length === 0) return [];

  // Score each hole for "danger"
  const scored = holes
    .filter(h => h.handicapIndex != null)
    .map(hole => {
      let dangerScore = 0;
      const history = holeHistory?.[hole.holeNumber];

      // Hardest holes by handicap (index 1 = hardest)
      if (hole.handicapIndex <= 2) dangerScore += 3;
      else if (hole.handicapIndex <= 4) dangerScore += 1;

      // Lots of hazards
      const waterCount = hole.hazards.filter(h => h.type === 'water').length;
      const bunkerCount = hole.hazards.filter(h => h.type === 'bunker').length;
      const obCount = hole.hazards.filter(h => h.type === 'out_of_bounds').length;
      dangerScore += waterCount * 2 + Math.min(bunkerCount, 3) + obCount * 2;

      // Player historically scores poorly here
      if (history && history.avgOverPar > 0.5) dangerScore += 2;
      if (history && history.avgOverPar > 1.5) dangerScore += 2;

      return { ...hole, dangerScore, history, waterCount, bunkerCount, obCount };
    })
    .sort((a, b) => b.dangerScore - a.dangerScore);

  // Take top 3 danger holes
  return scored.slice(0, 3).map(hole => {
    // Build warning text
    const warnings = [];
    if (hole.handicapIndex <= 2) warnings.push(`#${hole.handicapIndex} hardest hole on the course`);
    if (hole.waterCount > 0) warnings.push(`${hole.waterCount} water hazard${hole.waterCount > 1 ? 's' : ''}`);
    if (hole.obCount > 0) warnings.push('Out of bounds in play');
    if (hole.bunkerCount >= 3) warnings.push(`${hole.bunkerCount} bunkers`);
    if (hole.history?.avgOverPar > 1) warnings.push(`You avg +${hole.history.avgOverPar.toFixed(1)} here`);

    // Build strategy
    let strategy = '';
    if (hole.waterCount > 0 || hole.obCount > 0) {
      strategy = 'Play away from trouble, take your medicine';
    } else if (hole.handicapIndex <= 2) {
      strategy = 'Bogey is a good score here. Focus on avoiding big numbers';
    } else {
      strategy = 'Stay patient and play smart';
    }

    return {
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
      handicapIndex: hole.handicapIndex,
      warning: warnings.join('. ') || 'Tough hole',
      strategy,
      avgScore: hole.history?.avgScore ?? null,
    };
  });
}

// ============================================================================
// PAR STRATEGY
// ============================================================================

/**
 * Build par strategy from actual hole data.
 */
function buildParStrategy(holes) {
  if (!holes || holes.length === 0) {
    return { par3s: null, par4s: null, par5s: null };
  }

  const par3s = holes.filter(h => h.par === 3);
  const par4s = holes.filter(h => h.par === 4);
  const par5s = holes.filter(h => h.par === 5);

  const avgYardage = (arr) => arr.length > 0
    ? Math.round(arr.reduce((sum, h) => sum + (h.yardage || 0), 0) / arr.length)
    : 0;

  return {
    par3s: par3s.length > 0 ? {
      count: par3s.length,
      avgYardage: avgYardage(par3s),
      strategy: par3s.length > 0
        ? `${par3s.length} par 3s averaging ${avgYardage(par3s)} yards. Focus on hitting greens and take enough club.`
        : null,
    } : null,
    par4s: par4s.length > 0 ? {
      count: par4s.length,
      avgYardage: avgYardage(par4s),
      strategy: `${par4s.length} par 4s averaging ${avgYardage(par4s)} yards. Fairway accuracy is key on these holes.`,
    } : null,
    par5s: par5s.length > 0 ? {
      count: par5s.length,
      avgYardage: avgYardage(par5s),
      strategy: par5s.length > 0
        ? `${par5s.length} par 5s averaging ${avgYardage(par5s)} yards. Smart layups lead to easy pars or better.`
        : null,
    } : null,
  };
}

// ============================================================================
// KEY STRATEGIES
// ============================================================================

/**
 * Generate basic key strategies based on available data.
 * These are rule-based for now — eventually will be LLM-powered.
 */
function generateKeyStrategies(holes, targetScore, coursePar, holeHistory) {
  const strategies = [];

  // Strategy based on target vs par
  if (targetScore !== null && coursePar) {
    const overPar = targetScore - coursePar;
    if (overPar <= 0) {
      strategies.push('You can shoot par or better today. Attack birdie holes and play smart on the rest');
    } else if (overPar <= 9) {
      strategies.push(`Target is +${overPar}, so you have ${overPar} bogeys to give. Use them on the hardest holes`);
    } else {
      strategies.push('Focus on avoiding big numbers. Bogey is your friend on tough holes');
    }
  }

  // Strategy based on hole data
  if (holes && holes.length > 0) {
    const par5s = holes.filter(h => h.par === 5);
    const shortPar4s = holes.filter(h => h.par === 4 && h.yardage < 350);

    if (par5s.length > 0) {
      strategies.push(`${par5s.length} par 5s are your scoring holes. Make sure to capitalize`);
    }
    if (shortPar4s.length > 0) {
      strategies.push(`${shortPar4s.length} short par 4${shortPar4s.length > 1 ? 's' : ''}, so consider an iron off the tee for accuracy`);
    }
  }

  // Strategy based on history
  if (holeHistory) {
    const worstHoles = Object.values(holeHistory)
      .filter(h => h.avgOverPar > 1.5)
      .length;
    if (worstHoles > 0) {
      strategies.push(`You have ${worstHoles} trouble hole${worstHoles > 1 ? 's' : ''}. Have a plan before you get there`);
    }
  }

  // Default strategies if we don't have enough
  if (strategies.length < 2) {
    strategies.push('Commit to each shot. Indecision leads to bad swings');
  }
  if (strategies.length < 3) {
    strategies.push('Two-putt is always a good putt. Lag it close and move on');
  }

  return strategies.slice(0, 4);
}

// ============================================================================
// MENTAL TIPS
// ============================================================================

/**
 * Generate basic mental tips. Rule-based for now, LLM-powered later.
 */
function generateMentalTips(targetScore, coursePar, roundCount) {
  const tips = [
    { icon: '🧘', text: 'Stay patient. It\'s a long round, one shot at a time' },
    { icon: '🎯', text: 'Commit fully to every shot before you swing' },
  ];

  if (roundCount === 0) {
    tips.push({ icon: '👀', text: 'First time here, so enjoy the course and learn the layout' });
  } else {
    tips.push({ icon: '💪', text: 'Bad holes happen. Bounce back with a solid next shot' });
  }

  if (targetScore !== null && coursePar) {
    const overPar = targetScore - coursePar;
    if (overPar > 10) {
      tips.push({ icon: '⏱️', text: 'Don\'t chase pars. Play your game and the score will come' });
    } else {
      tips.push({ icon: '⏱️', text: 'Trust your routine and your tempo' });
    }
  } else {
    tips.push({ icon: '⏱️', text: 'Trust your pre-shot routine every time' });
  }

  return tips;
}

// ============================================================================
// MAIN: GENERATE GAME PLAN
// ============================================================================

/**
 * Generate a complete game plan from real data.
 * @param {Object} params
 * @param {Object} params.course - Course object with id, name
 * @param {Object} params.selectedTee - Tee box with id, rating, slope, parTotal, yardage, color
 * @param {string|null} params.userId - User's auth ID
 * @param {Object|null} params.userProfile - Profile with handicap, bestArea, worstArea, etc.
 * @returns {Promise<{gamePlan: Object, loading: false, error: string|null}>}
 */
export async function generateGamePlan({ course, selectedTee, userId, userProfile }) {
  try {
    // Fetch hole data and history in parallel
    const [holesResult, historyResult] = await Promise.all([
      fetchCourseHoles(course.id, selectedTee?.id),
      userId ? fetchCourseHistory(userId, course.id) : Promise.resolve({ data: { rounds: [], stats: null } }),
    ]);

    const holes = holesResult.data || [];
    const history = historyResult.data || { rounds: [], stats: null };
    const stats = history.stats;

    // Build hole-level history lookup
    const holeHistory = {};
    if (stats?.troubleHoles) {
      stats.troubleHoles.forEach(h => {
        holeHistory[h.hole] = { ...(holeHistory[h.hole] || {}), avgOverPar: h.avgOverPar, par: h.par };
      });
    }
    if (stats?.bestHoles) {
      stats.bestHoles.forEach(h => {
        holeHistory[h.hole] = { ...(holeHistory[h.hole] || {}), avgOverPar: h.avgOverPar, par: h.par };
      });
    }

    // Also fetch per-hole avg scores from round_holes if we have rounds
    if (userId && history.rounds.length > 0) {
      const recentRoundIds = history.rounds.slice(0, 10).map(r => r.id);
      const { data: holeScores } = await supabase
        .from('round_holes')
        .select('hole_number, score, par')
        .in('round_id', recentRoundIds);

      if (holeScores) {
        const byHole = {};
        holeScores.forEach(h => {
          if (!byHole[h.hole_number]) byHole[h.hole_number] = { scores: [], par: h.par };
          if (h.score != null) byHole[h.hole_number].scores.push(h.score);
        });
        Object.entries(byHole).forEach(([num, data]) => {
          const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
          holeHistory[num] = {
            ...holeHistory[num],
            avgScore: Math.round(avg * 10) / 10,
            avgOverPar: Math.round((avg - data.par) * 10) / 10,
            timesPlayed: data.scores.length,
          };
        });
      }
    }

    // Target score
    const formulaScore = calculateExpectedScore(
      userProfile?.handicap,
      selectedTee?.rating,
      selectedTee?.slope
    );
    const courseAvgScore = stats?.averageScore ?? null;
    const roundCount = stats?.roundsPlayed ?? 0;
    const targetScoreResult = blendTargetScore(formulaScore, courseAvgScore, roundCount);

    // Course par
    const coursePar = selectedTee?.parTotal
      || (holes.length > 0 ? holes.reduce((sum, h) => sum + (h.par || 0), 0) : null);

    // Build game plan sections
    const birdieOpportunities = findBirdieOpportunities(holes, holeHistory);
    const dangerZones = findDangerZones(holes, holeHistory);
    const parStrategy = buildParStrategy(holes);
    const keyStrategies = generateKeyStrategies(holes, targetScoreResult.target, coursePar, holeHistory);
    const mentalTips = generateMentalTips(targetScoreResult.target, coursePar, roundCount);

    return {
      gamePlan: {
        targetScore: targetScoreResult,
        coursePar,
        keyStrategies,
        birdieOpportunities,
        dangerZones,
        parStrategy,
        mentalTips,
        holesLoaded: holes.length,
        roundsAtCourse: roundCount,
      },
      loading: false,
      error: null,
    };
  } catch (err) {
    console.error('[GamePlanService] Error generating game plan:', err);
    return {
      gamePlan: null,
      loading: false,
      error: `Failed to generate game plan: ${err.message}`,
    };
  }
}
