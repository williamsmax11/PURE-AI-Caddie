/**
 * GPS Location Tracking Service
 *
 * Wraps expo-location to provide start/stop GPS tracking
 * for automatic shot detection during a round.
 * Foreground-only tracking with settings tuned for golf course use.
 */

import * as Location from 'expo-location';

let subscription = null;

/**
 * Request foreground location permission.
 * Returns true if granted, false otherwise.
 */
export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Start watching the device position.
 *
 * @param {function} onLocationUpdate - Called with { latitude, longitude, altitude, accuracy, timestamp }
 * @returns {boolean} true if tracking started successfully
 */
export async function startTracking(onLocationUpdate) {
  if (subscription) {
    return true; // Already tracking
  }

  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    return false;
  }

  subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 5,   // meters - catches cart movement within ~1 sec
      timeInterval: 3000,    // ms - ensures readings even when stationary
    },
    (location) => {
      // Altitude is in meters from device GPS, convert to feet
      const altitudeMeters = location.coords.altitude;
      const altitudeFeet = altitudeMeters !== null ? Math.round(altitudeMeters * 3.28084) : null;

      onLocationUpdate({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: altitudeFeet,  // Elevation in feet (null if unavailable)
        altitudeAccuracy: location.coords.altitudeAccuracy, // Accuracy in meters
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      });
    }
  );

  return true;
}

/**
 * Stop watching position and clean up subscription.
 */
export function stopTracking() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}

/**
 * Check if GPS tracking is currently active.
 */
export function isTracking() {
  return subscription !== null;
}
