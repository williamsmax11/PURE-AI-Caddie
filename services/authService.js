/**
 * Auth Service
 *
 * Handles user authentication and profile management via Supabase Auth.
 */

import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../config/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Sign up a new user with email and password.
 * The DB trigger auto-creates a profiles row.
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
}

/**
 * Sign in an existing user.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

/**
 * Sign in with Google via Supabase OAuth.
 * Opens a browser for Google consent, then sets the Supabase session.
 */
export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) return { data: null, error };
  if (!data?.url) return { data: null, error: { message: 'No OAuth URL returned' } };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return { data: null, error: null }; // User cancelled
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);

  if (errorCode) {
    return { data: null, error: { message: params.error_description || 'OAuth error' } };
  }

  const { access_token, refresh_token } = params;

  if (!access_token || !refresh_token) {
    return { data: null, error: { message: 'Missing tokens from Google sign-in' } };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  return { data: sessionData, error: sessionError };
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Get current session (for restoring auth state on app start).
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session, error };
}

/**
 * Get the current user's profile from the profiles table.
 */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

/**
 * Update the user's profile (onboarding data, etc.).
 */
export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

/**
 * Listen for auth state changes (token refresh, sign out, etc.).
 * Returns the subscription object (call subscription.unsubscribe() to stop).
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(event, session);
    }
  );
  return subscription;
}
