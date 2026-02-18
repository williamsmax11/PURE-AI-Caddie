/**
 * Shared geo/spatial utility functions for the Pure app.
 * Used by HoleViewSatellite, holeService, shotDetectionService, etc.
 */

/**
 * Calculate distance between two GPS coordinates in yards (Haversine formula)
 */
export function calculateDistance(coord1, coord2) {
  const R = 6371e3; // Earth radius in meters
  const lat1Rad = (coord1.latitude * Math.PI) / 180;
  const lat2Rad = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const meters = R * c;
  return Math.round(meters * 1.09361); // Convert to yards
}

/**
 * Calculate bearing (heading) from start to end coordinate in degrees (0-360)
 */
export function calculateBearing(start, end) {
  const startLat = start.latitude * Math.PI / 180;
  const startLng = start.longitude * Math.PI / 180;
  const endLat = end.latitude * Math.PI / 180;
  const endLng = end.longitude * Math.PI / 180;

  const dLng = endLng - startLng;

  const y = Math.sin(dLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) -
            Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || !polygon.coordinates || polygon.coordinates.length < 3) {
    return false;
  }

  const { latitude: y, longitude: x } = point;
  const coords = polygon.coordinates;
  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const yi = coords[i].latitude;
    const xi = coords[i].longitude;
    const yj = coords[j].latitude;
    const xj = coords[j].longitude;

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculate the front and back distances of a hazard polygon from the tee box.
 * Front = closest point to tee (how far to stay short)
 * Back = furthest point from tee (how far to carry over)
 * Also returns the center point for label placement.
 */
export function calculateHazardDistances(hazardPolygon, teeBox) {
  if (!hazardPolygon || !hazardPolygon.coordinates || hazardPolygon.coordinates.length < 3 || !teeBox) {
    return null;
  }

  let minDist = Infinity;
  let maxDist = -Infinity;
  let frontPoint = null;
  let backPoint = null;
  let sumLat = 0;
  let sumLon = 0;

  for (const coord of hazardPolygon.coordinates) {
    const dist = calculateDistance(teeBox, coord);
    sumLat += coord.latitude;
    sumLon += coord.longitude;

    if (dist < minDist) {
      minDist = dist;
      frontPoint = coord;
    }
    if (dist > maxDist) {
      maxDist = dist;
      backPoint = coord;
    }
  }

  const centerPoint = {
    latitude: sumLat / hazardPolygon.coordinates.length,
    longitude: sumLon / hazardPolygon.coordinates.length,
  };

  return {
    frontDistance: minDist,
    backDistance: maxDist,
    frontPoint,
    backPoint,
    centerPoint,
  };
}

/**
 * Determine lie type based on position and course polygons
 */
export function determineLieType(position, polygons) {
  if (!position || !polygons || polygons.length === 0) {
    return 'fairway';
  }

  for (const polygon of polygons) {
    if (isPointInPolygon(position, polygon)) {
      switch (polygon.type) {
        case 'green':
          return 'green';
        case 'bunker':
          return 'bunker';
        case 'water':
          return 'water';
        case 'fairway':
          return 'fairway';
        case 'fringe':
          return 'fringe';
        default:
          break;
      }
    }
  }

  return 'rough';
}
