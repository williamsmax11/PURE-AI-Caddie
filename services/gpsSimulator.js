/**
 * GPS Simulator for testing shot detection without being on a course.
 *
 * Generates a realistic sequence of GPS positions that walk through
 * a golf hole: tee → fairway → stop at ball → approach → green.
 * Feeds positions into the same callback as the real locationService.
 *
 * Only used in __DEV__ mode.
 */

let simulationTimer = null;
let positionIndex = 0;
let waypoints = [];

/**
 * Interpolate N points between two coordinates.
 */
function interpolate(start, end, steps) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      latitude: start.latitude + (end.latitude - start.latitude) * t,
      longitude: start.longitude + (end.longitude - start.longitude) * t,
    });
  }
  return points;
}

/**
 * Add small random GPS jitter to a coordinate (±~1 meter).
 */
function addNoise(coord) {
  const noise = 0.00001; // ~1 meter
  return {
    latitude: coord.latitude + (Math.random() - 0.5) * 2 * noise,
    longitude: coord.longitude + (Math.random() - 0.5) * 2 * noise,
  };
}

/**
 * Build waypoints for a simulated round of a single hole.
 * Uses the actual hole's tee and green coordinates.
 *
 * @param {object} holeData - { teeBox: {lat,lng}, green: {lat,lng}, par }
 * @returns {array} Array of { position, delayMs } objects
 */
function buildWaypoints(holeData) {
  const { teeBox, green } = holeData;
  const points = [];

  // Fairway landing zone: ~60% of the way from tee to green
  const fairwayLanding = {
    latitude: teeBox.latitude + (green.latitude - teeBox.latitude) * 0.6,
    longitude: teeBox.longitude + (green.longitude - teeBox.longitude) * 0.6,
  };

  // Approach position: ~85% of the way (near green but not on it)
  const approachPos = {
    latitude: teeBox.latitude + (green.latitude - teeBox.latitude) * 0.85,
    longitude: teeBox.longitude + (green.longitude - teeBox.longitude) * 0.85,
  };

  // Phase 1: Standing at tee (5 readings, 3s apart = 15s)
  for (let i = 0; i < 5; i++) {
    points.push({ position: addNoise(teeBox), delayMs: 3000 });
  }

  // Phase 2: Walk/drive to fairway landing (10 readings, moving)
  const teeToFairway = interpolate(teeBox, fairwayLanding, 10);
  for (const pos of teeToFairway) {
    points.push({ position: addNoise(pos), delayMs: 2000 });
  }

  // Phase 3: Stopped at ball in fairway (6 readings, 3s apart = 18s)
  for (let i = 0; i < 6; i++) {
    points.push({ position: addNoise(fairwayLanding), delayMs: 3000 });
  }

  // Phase 4: Walk toward green / approach area (8 readings, moving)
  const fairwayToApproach = interpolate(fairwayLanding, approachPos, 8);
  for (const pos of fairwayToApproach) {
    points.push({ position: addNoise(pos), delayMs: 2000 });
  }

  // Phase 5: Stopped near green (6 readings, 3s apart = 18s)
  for (let i = 0; i < 6; i++) {
    points.push({ position: addNoise(approachPos), delayMs: 3000 });
  }

  // Phase 6: Walk onto green (3 readings)
  const approachToGreen = interpolate(approachPos, green, 3);
  for (const pos of approachToGreen) {
    points.push({ position: addNoise(pos), delayMs: 2000 });
  }

  // Phase 7: On the green, stationary (4 readings)
  for (let i = 0; i < 4; i++) {
    points.push({ position: addNoise(green), delayMs: 3000 });
  }

  return points;
}

/**
 * Start simulating GPS movement through a hole.
 *
 * @param {function} onLocationUpdate - Same callback as locationService
 * @param {object}   holeData         - { teeBox, green, par }
 */
export function startSimulation(onLocationUpdate, holeData) {
  if (simulationTimer) {
    stopSimulation();
  }

  waypoints = buildWaypoints(holeData);
  positionIndex = 0;

  function tick() {
    if (positionIndex >= waypoints.length) {
      // Simulation complete — stay at last position
      stopSimulation();
      return;
    }

    const wp = waypoints[positionIndex];
    onLocationUpdate({
      latitude: wp.position.latitude,
      longitude: wp.position.longitude,
      accuracy: 5 + Math.random() * 5, // 5-10 meter accuracy
      timestamp: Date.now(),
    });

    positionIndex++;

    if (positionIndex < waypoints.length) {
      simulationTimer = setTimeout(tick, waypoints[positionIndex].delayMs);
    }
  }

  // Start first tick immediately
  tick();
}

/**
 * Stop the simulation.
 */
export function stopSimulation() {
  if (simulationTimer) {
    clearTimeout(simulationTimer);
    simulationTimer = null;
  }
  positionIndex = 0;
  waypoints = [];
}

/**
 * Check if simulation is currently running.
 */
export function isSimulating() {
  return simulationTimer !== null;
}
