/**
 * Unit tests for the shot detection state machine.
 * Run with: npm test
 *
 * Tests the pure logic without GPS, React, or the app running.
 */

import { createShotDetector, STATES } from '../services/shotDetectionService';

// --- Test helpers ---

// Pebble Beach Hole 1 coordinates
const HOLE_DATA = {
  teeBox: { latitude: 36.5674, longitude: -121.9500 },
  green: { latitude: 36.5680, longitude: -121.9495 },
  par: 4,
};

// Simple green polygon around the green center
const GREEN_POLYGON = {
  type: 'green',
  coordinates: [
    { latitude: 36.5681, longitude: -121.9496 },
    { latitude: 36.5681, longitude: -121.9494 },
    { latitude: 36.5679, longitude: -121.9494 },
    { latitude: 36.5679, longitude: -121.9496 },
  ],
};

const POLYGONS = [GREEN_POLYGON];

function createTestDetector() {
  const shots = [];
  const stateChanges = [];

  const detector = createShotDetector(
    HOLE_DATA,
    POLYGONS,
    (shot) => shots.push(shot),
    (state, meta) => stateChanges.push({ state, ...meta }),
  );

  return { detector, shots, stateChanges };
}

/**
 * Move a coordinate roughly N yards north.
 * 1 degree latitude ≈ 111,000 meters ≈ 121,391 yards
 */
function moveNorth(coord, yards) {
  const degPerYard = 1 / 121391;
  return {
    latitude: coord.latitude + yards * degPerYard,
    longitude: coord.longitude,
  };
}

function pos(coord, accuracy = 5) {
  return { ...coord, accuracy, timestamp: Date.now() };
}

// Advance time for stationary detection (feed same position multiple times)
function feedStationary(detector, coord, count, intervalMs = 3500) {
  const baseTime = Date.now();
  for (let i = 0; i < count; i++) {
    // Jest uses fake timers, but the detector uses Date.now() internally.
    // We set the timestamp but the detector's internal Date.now() calls
    // need real time to pass. Use jest.advanceTimersByTime instead.
    detector.processPosition(pos(coord));
  }
}

// --- Tests ---

describe('Shot Detection State Machine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('starts in IDLE state', () => {
    const { detector } = createTestDetector();
    expect(detector.getCurrentState()).toBe(STATES.IDLE);
  });

  test('transitions to AT_TEE on startHole()', () => {
    const { detector, stateChanges } = createTestDetector();
    detector.startHole();
    expect(detector.getCurrentState()).toBe(STATES.AT_TEE);
    expect(stateChanges[stateChanges.length - 1].state).toBe(STATES.AT_TEE);
  });

  test('detects tee shot when player moves 20+ yards from tee', () => {
    const { detector, shots, stateChanges } = createTestDetector();
    detector.startHole();

    // Feed positions at tee (no movement)
    for (let i = 0; i < 5; i++) {
      detector.processPosition(pos(HOLE_DATA.teeBox));
    }
    expect(shots.length).toBe(0);
    expect(detector.getCurrentState()).toBe(STATES.AT_TEE);

    // Move 25 yards from tee
    const movedPos = moveNorth(HOLE_DATA.teeBox, 25);
    // Feed enough positions to fill the buffer
    for (let i = 0; i < 5; i++) {
      detector.processPosition(pos(movedPos));
    }

    expect(shots.length).toBe(1);
    expect(shots[0].shotNumber).toBe(1);
    expect(shots[0].detectionMethod).toBe('auto');
    expect(detector.getCurrentState()).toBe(STATES.MOVING);
  });

  test('does NOT detect tee shot if movement is less than 20 yards', () => {
    const { detector, shots } = createTestDetector();
    detector.startHole();

    // Move only 10 yards
    const smallMove = moveNorth(HOLE_DATA.teeBox, 10);
    for (let i = 0; i < 5; i++) {
      detector.processPosition(pos(smallMove));
    }

    expect(shots.length).toBe(0);
    expect(detector.getCurrentState()).toBe(STATES.AT_TEE);
  });

  test('detects mid-hole shot: stop for 15s then move away', () => {
    const { detector, shots } = createTestDetector();
    detector.startHole();

    // Trigger tee shot first
    const fairwayPos = moveNorth(HOLE_DATA.teeBox, 200);
    for (let i = 0; i < 6; i++) {
      detector.processPosition(pos(fairwayPos));
    }
    expect(detector.getCurrentState()).toBe(STATES.MOVING);
    const teeShots = shots.length;

    // Stop at fairway position for 15+ seconds
    // The state machine checks Date.now() internally, so we need to
    // advance real time between readings
    for (let i = 0; i < 6; i++) {
      detector.processPosition(pos(fairwayPos));
      jest.advanceTimersByTime(3500); // 3.5s per reading, 6 readings = 21s
    }
    expect(detector.getCurrentState()).toBe(STATES.STATIONARY);

    // Now move away 15 yards (above MOVEMENT_THRESHOLD of 10)
    const afterShot = moveNorth(fairwayPos, 40);
    for (let i = 0; i < 5; i++) {
      detector.processPosition(pos(afterShot));
    }

    // Should have recorded the fairway shot
    expect(shots.length).toBe(teeShots + 1);
    expect(detector.getCurrentState()).toBe(STATES.MOVING);
  });

  test('ignores GPS readings with poor accuracy', () => {
    const { detector, shots } = createTestDetector();
    detector.startHole();

    // Feed positions with bad accuracy (> 20m) — should be ignored
    const movedPos = moveNorth(HOLE_DATA.teeBox, 30);
    for (let i = 0; i < 10; i++) {
      detector.processPosition(pos(movedPos, 25)); // 25m accuracy = bad
    }

    expect(shots.length).toBe(0);
    expect(detector.getCurrentState()).toBe(STATES.AT_TEE);
  });

  test('detects green arrival and transitions to ON_GREEN', () => {
    const { detector, stateChanges } = createTestDetector();
    detector.startHole();

    // Trigger tee shot
    const midway = moveNorth(HOLE_DATA.teeBox, 200);
    for (let i = 0; i < 6; i++) {
      detector.processPosition(pos(midway));
    }

    // Move onto the green (inside green polygon)
    const onGreen = { latitude: 36.5680, longitude: -121.9495 };
    for (let i = 0; i < 5; i++) {
      detector.processPosition(pos(onGreen));
    }

    expect(detector.getCurrentState()).toBe(STATES.ON_GREEN);
    const greenTransition = stateChanges.find(s => s.state === STATES.ON_GREEN);
    expect(greenTransition).toBeTruthy();
  });

  test('manual shot override works via addManualShot()', () => {
    const { detector, shots } = createTestDetector();
    detector.startHole();

    const manualPos = moveNorth(HOLE_DATA.teeBox, 100);
    detector.addManualShot(manualPos);

    expect(shots.length).toBe(1);
    expect(shots[0].detectionMethod).toBe('manual');
    expect(shots[0].shotNumber).toBe(1);
  });

  test('getDetectedShots returns copy of all shots', () => {
    const { detector } = createTestDetector();
    detector.startHole();

    detector.addManualShot(moveNorth(HOLE_DATA.teeBox, 100));
    detector.addManualShot(moveNorth(HOLE_DATA.teeBox, 200));

    const allShots = detector.getDetectedShots();
    expect(allShots.length).toBe(2);
    expect(allShots[0].shotNumber).toBe(1);
    expect(allShots[1].shotNumber).toBe(2);
  });

  test('completeHole transitions to HOLE_COMPLETE', () => {
    const { detector } = createTestDetector();
    detector.startHole();
    detector.completeHole();
    expect(detector.getCurrentState()).toBe(STATES.HOLE_COMPLETE);
  });

  test('destroy resets to IDLE', () => {
    const { detector } = createTestDetector();
    detector.startHole();
    detector.addManualShot(HOLE_DATA.teeBox);
    detector.destroy();
    expect(detector.getCurrentState()).toBe(STATES.IDLE);
    expect(detector.getDetectedShots().length).toBe(0);
  });
});
