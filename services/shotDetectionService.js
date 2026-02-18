/**
 * Shot Detection Service
 *
 * Movement state machine that consumes GPS position updates
 * and emits shot detection events. Detects when a player has
 * taken a shot based on movement patterns:
 *   - Tee shot: player departs the tee box
 *   - Mid-hole: player stops at ball, then moves away (took a shot)
 *   - Green arrival: player enters green polygon (approach shot)
 *   - Putts: handled via UI counter (GPS too imprecise)
 */

import { calculateDistance, determineLieType } from '../utils/geoUtils';

// --- Tunable thresholds ---
const CONFIG = {
  TEE_DEPARTURE_DISTANCE: 20,  // yards from tee to register tee shot
  SHOT_MIN_DISTANCE: 30,       // yards minimum between consecutive shots
  MOVEMENT_THRESHOLD: 10,      // yards movement to exit STATIONARY
  STATIONARY_TIME: 15000,      // ms must be still to count as stopped
  STATIONARY_RADIUS: 8,        // yards - readings within this = "still"
  MIN_ACCURACY: 20,            // meters - ignore worse readings
  POSITION_BUFFER_SIZE: 5,     // rolling buffer for smoothing
};

// State machine states
export const STATES = {
  IDLE: 'IDLE',
  AT_TEE: 'AT_TEE',
  MOVING: 'MOVING',
  STATIONARY: 'STATIONARY',
  ON_GREEN: 'ON_GREEN',
  HOLE_COMPLETE: 'HOLE_COMPLETE',
};

/**
 * Compute the median of an array of numbers.
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Create a shot detector for a single hole.
 *
 * @param {object}   holeData        - { teeBox, green, par }
 * @param {array}    polygons        - course polygons for this hole
 * @param {function} onShotDetected  - callback({ shotNumber, position, lieType, distanceFromPrevious, detectionMethod })
 * @param {function} onStateChange   - callback(newState, metadata)
 * @returns {object} detector API
 */
export function createShotDetector(holeData, polygons, onShotDetected, onStateChange) {
  let state = STATES.IDLE;
  let shotNumber = 0;
  let detectedShots = [];

  // Position tracking
  let positionBuffer = [];          // rolling buffer of recent positions
  let smoothedPosition = null;      // median-smoothed current position
  let lastShotPosition = null;      // where the last shot was taken
  let stationaryAnchor = null;      // position when we first stopped
  let stationaryStartTime = null;   // when we first stopped
  let isConfirmedStationary = false; // passed the time threshold

  function setState(newState, metadata = {}) {
    const prevState = state;
    state = newState;
    onStateChange(newState, { previousState: prevState, ...metadata });
  }

  function recordShot(position, detectionMethod = 'auto') {
    shotNumber++;
    const lieType = determineLieType(position, polygons);
    const distanceFromPrevious = lastShotPosition
      ? calculateDistance(lastShotPosition, position)
      : 0;

    const shot = {
      shotNumber,
      position: { ...position },
      timestamp: new Date(),
      lieType,
      distanceFromPrevious,
      detectionMethod,
    };

    detectedShots.push(shot);
    lastShotPosition = { ...position };
    onShotDetected(shot);
  }

  /**
   * Smooth GPS by taking the median of the last N readings.
   */
  function updateSmoothedPosition(pos) {
    positionBuffer.push(pos);
    if (positionBuffer.length > CONFIG.POSITION_BUFFER_SIZE) {
      positionBuffer.shift();
    }

    smoothedPosition = {
      latitude: median(positionBuffer.map(p => p.latitude)),
      longitude: median(positionBuffer.map(p => p.longitude)),
    };

    return smoothedPosition;
  }

  /**
   * Check if the current position is on the green polygon.
   */
  function isOnGreen(position) {
    const lie = determineLieType(position, polygons);
    return lie === 'green';
  }

  /**
   * Feed a GPS position update into the state machine.
   */
  function processPosition(rawPosition) {
    // Reject poor-accuracy readings
    if (rawPosition.accuracy && rawPosition.accuracy > CONFIG.MIN_ACCURACY) {
      return;
    }

    const position = updateSmoothedPosition(rawPosition);

    switch (state) {
      case STATES.IDLE:
        // Do nothing until startHole() is called
        break;

      case STATES.AT_TEE: {
        const distFromTee = calculateDistance(holeData.teeBox, position);
        if (distFromTee >= CONFIG.TEE_DEPARTURE_DISTANCE) {
          // Player has left the tee — tee shot taken
          recordShot({ ...holeData.teeBox }, 'auto');
          setState(STATES.MOVING);
        }
        break;
      }

      case STATES.MOVING: {
        // Check if player has entered the green
        if (isOnGreen(position)) {
          // Record approach shot at last known stationary position
          // (or tee if we never stopped)
          const approachPos = stationaryAnchor || lastShotPosition || holeData.teeBox;
          const distFromLastShot = lastShotPosition
            ? calculateDistance(lastShotPosition, approachPos)
            : CONFIG.SHOT_MIN_DISTANCE; // ensure it passes threshold

          if (distFromLastShot >= CONFIG.SHOT_MIN_DISTANCE && approachPos !== lastShotPosition) {
            recordShot(approachPos, 'auto');
          }
          setState(STATES.ON_GREEN, { position });
          break;
        }

        // Check if player has stopped
        if (!stationaryAnchor) {
          // First reading after movement — set anchor
          stationaryAnchor = { ...position };
          stationaryStartTime = Date.now();
          isConfirmedStationary = false;
        } else {
          const distFromAnchor = calculateDistance(stationaryAnchor, position);

          if (distFromAnchor <= CONFIG.STATIONARY_RADIUS) {
            // Still near anchor — check time
            const elapsed = Date.now() - stationaryStartTime;
            if (elapsed >= CONFIG.STATIONARY_TIME && !isConfirmedStationary) {
              isConfirmedStationary = true;
              setState(STATES.STATIONARY, { position: stationaryAnchor });
            }
          } else {
            // Moved away from anchor — reset
            stationaryAnchor = { ...position };
            stationaryStartTime = Date.now();
            isConfirmedStationary = false;
          }
        }
        break;
      }

      case STATES.STATIONARY: {
        // Check if player entered green while stationary (chip from fringe)
        if (isOnGreen(position)) {
          recordShot(stationaryAnchor, 'auto');
          setState(STATES.ON_GREEN, { position });
          break;
        }

        const distFromAnchor = calculateDistance(stationaryAnchor, position);

        if (distFromAnchor >= CONFIG.MOVEMENT_THRESHOLD) {
          // Player moved away — they took a shot from the stationary position
          const distFromLastShot = lastShotPosition
            ? calculateDistance(lastShotPosition, stationaryAnchor)
            : CONFIG.SHOT_MIN_DISTANCE;

          if (distFromLastShot >= CONFIG.SHOT_MIN_DISTANCE) {
            recordShot(stationaryAnchor, 'auto');
          }

          // Reset stationary tracking and go back to MOVING
          stationaryAnchor = null;
          stationaryStartTime = null;
          isConfirmedStationary = false;
          setState(STATES.MOVING);
        }
        break;
      }

      case STATES.ON_GREEN:
        // Putts are handled via the UI counter — no GPS detection
        break;

      case STATES.HOLE_COMPLETE:
        // Waiting for next hole
        break;
    }
  }

  /**
   * Start tracking a hole. Resets state to AT_TEE.
   */
  function startHole() {
    shotNumber = 0;
    detectedShots = [];
    positionBuffer = [];
    smoothedPosition = null;
    lastShotPosition = null;
    stationaryAnchor = null;
    stationaryStartTime = null;
    isConfirmedStationary = false;
    setState(STATES.AT_TEE);
  }

  /**
   * Mark hole as complete (after score entry).
   */
  function completeHole() {
    setState(STATES.HOLE_COMPLETE);
  }

  /**
   * Add a manually placed shot (user tapped the map).
   */
  function addManualShot(position) {
    recordShot(position, 'manual');
    // If we were MOVING or STATIONARY, stay in that state
    // If we were AT_TEE, transition to MOVING
    if (state === STATES.AT_TEE) {
      setState(STATES.MOVING);
    }
    // If on green via manual tap, transition
    if (isOnGreen(position) && state !== STATES.ON_GREEN) {
      setState(STATES.ON_GREEN, { position });
    }
  }

  /**
   * Get all auto/manually detected shots so far.
   */
  function getDetectedShots() {
    return [...detectedShots];
  }

  /**
   * Get current state machine state.
   */
  function getCurrentState() {
    return state;
  }

  /**
   * Get the smoothed GPS position.
   */
  function getSmoothedPosition() {
    return smoothedPosition;
  }

  /**
   * Reset and clean up.
   */
  function destroy() {
    state = STATES.IDLE;
    detectedShots = [];
    positionBuffer = [];
  }

  return {
    processPosition,
    startHole,
    completeHole,
    addManualShot,
    getDetectedShots,
    getCurrentState,
    getSmoothedPosition,
    destroy,
  };
}
