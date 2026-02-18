/**
 * Training persistence service
 * Tracks which training sequences a user has completed using AsyncStorage.
 * Follows the same patterns as roundCacheService.js.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRAINING_SEQUENCES, TRAINING_VERSION } from './trainingDefinitions';

const STORAGE_KEY = '@Pure:trainingCompletion';
const VERSION_KEY = '@Pure:trainingVersion';

/**
 * Load all training completion data from AsyncStorage.
 * @returns {Object} e.g. { home_intro: true, hole_view_intro: true }
 */
export async function loadTrainingState() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.warn('[TrainingService] Failed to load training state:', e);
    return {};
  }
}

/**
 * Mark a specific training sequence as completed.
 */
export async function markTrainingComplete(trainingId) {
  try {
    const current = await loadTrainingState();
    current[trainingId] = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('[TrainingService] Failed to save training completion:', e);
  }
}

/**
 * Check if a specific training has been completed.
 */
export async function hasSeenTraining(trainingId) {
  const state = await loadTrainingState();
  return !!state[trainingId];
}

/**
 * Reset a single training so it will show again next time.
 */
export async function resetTraining(trainingId) {
  try {
    const current = await loadTrainingState();
    delete current[trainingId];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('[TrainingService] Failed to reset training:', e);
  }
}

/**
 * Reset ALL trainings. Used for "Replay All Tutorials" in Settings.
 */
export async function resetAllTrainings() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[TrainingService] Failed to reset all trainings:', e);
  }
}

/**
 * Get all training sequences with their completion status.
 * Used by Settings screen for the replay list.
 */
export async function getAllTrainingsWithStatus() {
  const state = await loadTrainingState();
  return Object.values(TRAINING_SEQUENCES).map(t => ({
    id: t.id,
    screen: t.screen,
    title: t.steps[0]?.title || t.id,
    completed: !!state[t.id],
    stepCount: t.steps.length,
  }));
}

/**
 * Check for trainings added in newer app versions.
 * Returns array of training IDs that are new since last seen version.
 */
export async function getNewVersionTrainings() {
  try {
    const lastVersion = await AsyncStorage.getItem(VERSION_KEY);
    if (lastVersion === TRAINING_VERSION) return [];

    const state = await loadTrainingState();
    const newTrainings = Object.values(TRAINING_SEQUENCES)
      .filter(t => t.version > (lastVersion || '0.0.0') && !state[t.id])
      .map(t => t.id);

    await AsyncStorage.setItem(VERSION_KEY, TRAINING_VERSION);
    return newTrainings;
  } catch (e) {
    console.warn('[TrainingService] Failed to check version trainings:', e);
    return [];
  }
}
