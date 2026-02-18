/**
 * License Service
 *
 * Checks user license tier for feature access.
 * Currently all users get full access ('free' tier = everything).
 * Future tiers: 'pro', 'premium'.
 */

import { supabase } from '../config/supabase';

/**
 * Check if a user has access to a specific feature.
 * Returns { hasAccess, tier }.
 */
export async function checkFeatureAccess(userId, feature) {
  const { data, error } = await supabase
    .from('profiles')
    .select('license_tier')
    .eq('id', userId)
    .single();

  if (error || !data) return { hasAccess: false, tier: null };

  // For now, all features are available to all tiers
  return { hasAccess: true, tier: data.license_tier };
}

/**
 * Get the user's current license tier.
 */
export async function getLicenseTier(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('license_tier')
    .eq('id', userId)
    .single();

  return { tier: data?.license_tier || 'free', error };
}
