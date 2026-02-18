/**
 * Handicap Service
 *
 * Recalculates a user's handicap from their round history,
 * updates profiles.handicap, and logs to handicap_history.
 *
 * Called after each completed round. Non-blocking — failures
 * are logged but do not affect the round completion flow.
 */

import { supabase } from '../config/supabase';
import { calculateHandicap } from '../utils/handicapUtils';
import { fetchRoundHistory } from './roundService';

/**
 * Recalculate and persist the user's handicap.
 *
 * Flow:
 *   1. Fetch up to 20 most recent completed rounds
 *   2. Calculate handicap from qualifying rounds
 *   3. If 3+ qualifying rounds exist:
 *      a. Write calculated handicap to profiles.handicap
 *      b. Insert a row into handicap_history
 *   4. Return the result for optional UI use
 *
 * @param {string} userId - The user's auth ID
 * @returns {Promise<{ data: { handicap: number|null, roundCount: number, method: string }|null, error: string|null }>}
 */
export async function recalculateHandicap(userId) {
  try {
    const { data: rounds, error: fetchError } = await fetchRoundHistory(userId, 20);

    if (fetchError) {
      console.error('[HandicapService] Error fetching rounds:', fetchError);
      return { data: null, error: fetchError };
    }

    if (!rounds || rounds.length === 0) {
      return { data: { handicap: null, roundCount: 0, method: 'none' }, error: null };
    }

    const { handicap, roundCount, differentialAvg } = calculateHandicap(rounds);

    if (handicap === null) {
      console.log(`[HandicapService] Only ${roundCount} qualifying rounds, need 3+. Keeping existing handicap.`);
      return { data: { handicap: null, roundCount, method: 'insufficient_rounds' }, error: null };
    }

    // Write to profiles.handicap (as text to match existing column type)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ handicap: String(handicap) })
      .eq('id', userId);

    if (updateError) {
      console.error('[HandicapService] Error updating profile handicap:', updateError.message);
      return { data: null, error: updateError.message };
    }

    // Insert into handicap_history
    const { error: historyError } = await supabase
      .from('handicap_history')
      .insert({
        user_id: userId,
        handicap_value: handicap,
        method: 'calculated',
        round_count: roundCount,
        differential_avg: differentialAvg,
        calculated_at: new Date().toISOString(),
      });

    if (historyError) {
      // Log but don't fail — the profile update already succeeded
      console.warn('[HandicapService] Error inserting handicap history:', historyError.message);
    }

    console.log(`[HandicapService] Handicap updated: ${handicap} (from ${roundCount} rounds)`);

    return {
      data: { handicap, roundCount, method: 'calculated' },
      error: null,
    };
  } catch (err) {
    console.error('[HandicapService] Exception:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Fetch the user's handicap history for charting trends.
 *
 * @param {string} userId - The user's auth ID
 * @param {number} limit - Max records to return (default 50)
 * @returns {Promise<{ data: Array, error: string|null }>}
 */
export async function fetchHandicapHistory(userId, limit = 50) {
  const { data, error } = await supabase
    .from('handicap_history')
    .select('handicap_value, method, round_count, calculated_at')
    .eq('user_id', userId)
    .order('calculated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[HandicapService] Error fetching history:', error.message);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

/**
 * Log an onboarding handicap estimate to handicap_history.
 * Called once after onboarding completes to establish a baseline entry.
 *
 * @param {string} userId - The user's auth ID
 * @param {number} handicapValue - The estimated handicap from onboarding
 */
export async function logOnboardingHandicap(userId, handicapValue) {
  const { error } = await supabase
    .from('handicap_history')
    .insert({
      user_id: userId,
      handicap_value: handicapValue,
      method: 'onboarding_estimate',
      round_count: 0,
      differential_avg: null,
      calculated_at: new Date().toISOString(),
    });

  if (error) {
    console.warn('[HandicapService] Error logging onboarding handicap:', error.message);
  }
}
