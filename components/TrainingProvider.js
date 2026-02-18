/**
 * TrainingProvider - React Context for training/onboarding state
 *
 * Wraps the app and provides training state to all screens.
 * Each screen uses the useTraining(screenName) hook for integration.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  TRAINING_SEQUENCES,
  SCREEN_TRAINING_MAP,
} from '../training/trainingDefinitions';
import {
  loadTrainingState,
  markTrainingComplete,
  resetTraining as resetTrainingPersist,
  resetAllTrainings as resetAllTrainingsPersist,
} from '../training/trainingService';

const TrainingContext = createContext(null);

export function TrainingProvider({ children }) {
  const [completedTrainings, setCompletedTrainings] = useState({});
  const [activeTraining, setActiveTraining] = useState(null); // { sequenceId, currentStep }
  const [isLoaded, setIsLoaded] = useState(false);
  const activeTrainingRef = useRef(null);

  // Load persisted completion state on mount
  useEffect(() => {
    loadTrainingState().then(state => {
      setCompletedTrainings(state);
      setIsLoaded(true);
    });
  }, []);

  // Keep ref in sync
  useEffect(() => {
    activeTrainingRef.current = activeTraining;
  }, [activeTraining]);

  /**
   * Trigger training for a screen. Only shows if not already completed.
   * Called by each screen's useEffect after content loads.
   */
  const triggerTraining = useCallback((screenName) => {
    if (!isLoaded) return;

    const sequenceId = SCREEN_TRAINING_MAP[screenName];
    if (!sequenceId) return;

    // Already completed
    if (completedTrainings[sequenceId]) return;

    // Already showing this or another training
    if (activeTrainingRef.current) return;

    const sequence = TRAINING_SEQUENCES[sequenceId];
    if (!sequence || !sequence.steps || sequence.steps.length === 0) return;

    setActiveTraining({ sequenceId, currentStep: 0 });
  }, [isLoaded, completedTrainings]);

  /**
   * Advance to the next step, or complete if on last step.
   */
  const advanceStep = useCallback(() => {
    if (!activeTraining) return;

    const sequence = TRAINING_SEQUENCES[activeTraining.sequenceId];
    if (!sequence) return;

    const nextStep = activeTraining.currentStep + 1;
    if (nextStep >= sequence.steps.length) {
      // Last step - mark complete
      const id = activeTraining.sequenceId;
      setActiveTraining(null);
      setCompletedTrainings(prev => ({ ...prev, [id]: true }));
      markTrainingComplete(id);
    } else {
      setActiveTraining(prev => ({ ...prev, currentStep: nextStep }));
    }
  }, [activeTraining]);

  /**
   * Skip the entire training and mark it complete.
   */
  const skipTraining = useCallback(() => {
    if (!activeTraining) return;

    const id = activeTraining.sequenceId;
    setActiveTraining(null);
    setCompletedTrainings(prev => ({ ...prev, [id]: true }));
    markTrainingComplete(id);
  }, [activeTraining]);

  /**
   * Reset a specific training for replay (called from Settings).
   */
  const resetTraining = useCallback(async (trainingId) => {
    await resetTrainingPersist(trainingId);
    setCompletedTrainings(prev => {
      const next = { ...prev };
      delete next[trainingId];
      return next;
    });
  }, []);

  /**
   * Reset all trainings for replay (called from Settings).
   */
  const resetAllTrainings = useCallback(async () => {
    await resetAllTrainingsPersist();
    setCompletedTrainings({});
  }, []);

  const value = {
    completedTrainings,
    activeTraining,
    isLoaded,
    triggerTraining,
    advanceStep,
    skipTraining,
    resetTraining,
    resetAllTrainings,
  };

  return (
    <TrainingContext.Provider value={value}>
      {children}
    </TrainingContext.Provider>
  );
}

/**
 * Hook for screens to integrate training.
 *
 * Usage:
 *   const { trainingOverlayProps, triggerTraining } = useTraining('home');
 *
 *   useEffect(() => {
 *     const timer = setTimeout(() => triggerTraining(), 800);
 *     return () => clearTimeout(timer);
 *   }, []);
 *
 *   return (
 *     <View>
 *       {... screen content ...}
 *       <TrainingOverlay {...trainingOverlayProps} />
 *     </View>
 *   );
 */
export function useTraining(screenName) {
  const context = useContext(TrainingContext);

  if (!context) {
    // If used outside provider, return no-op defaults
    return {
      trainingOverlayProps: { visible: false, steps: [], currentStep: 0, totalSteps: 0, onNext: () => {}, onSkip: () => {} },
      triggerTraining: () => {},
      resetTraining: () => {},
      resetAllTrainings: () => {},
    };
  }

  const {
    activeTraining,
    advanceStep,
    skipTraining,
    triggerTraining: triggerRaw,
    resetTraining,
    resetAllTrainings,
  } = context;

  // Build overlay props for this screen
  const sequenceId = SCREEN_TRAINING_MAP[screenName];
  const isActive = activeTraining && activeTraining.sequenceId === sequenceId;
  const sequence = sequenceId ? TRAINING_SEQUENCES[sequenceId] : null;

  const trainingOverlayProps = {
    visible: isActive,
    steps: sequence ? sequence.steps : [],
    currentStep: isActive ? activeTraining.currentStep : 0,
    totalSteps: sequence ? sequence.steps.length : 0,
    onNext: advanceStep,
    onSkip: skipTraining,
  };

  const triggerTraining = useCallback(() => {
    triggerRaw(screenName);
  }, [triggerRaw, screenName]);

  return { trainingOverlayProps, triggerTraining, resetTraining, resetAllTrainings };
}

export default TrainingProvider;
