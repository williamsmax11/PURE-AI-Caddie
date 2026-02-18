/**
 * Weather Service
 *
 * Fetches real weather data from Open-Meteo API.
 * 100% FREE - No API key required!
 *
 * Open-Meteo: https://open-meteo.com/
 * - No registration needed
 * - 10,000 calls/day
 * - Accurate weather data
 * - Hourly forecasts
 */

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

/**
 * Map WMO weather codes to emoji icons
 * https://open-meteo.com/en/docs#weathervariables
 */
const weatherCodeToEmoji = (code) => {
  if (code === 0) return '☀️'; // Clear sky
  if (code === 1) return '🌤️'; // Mainly clear
  if (code === 2) return '⛅'; // Partly cloudy
  if (code === 3) return '🌥️'; // Overcast
  if (code >= 45 && code <= 48) return '🌫️'; // Fog
  if (code >= 51 && code <= 55) return '🌧️'; // Drizzle
  if (code >= 56 && code <= 57) return '🌧️'; // Freezing drizzle
  if (code >= 61 && code <= 65) return '🌧️'; // Rain
  if (code >= 66 && code <= 67) return '🌧️'; // Freezing rain
  if (code >= 71 && code <= 77) return '🌨️'; // Snow
  if (code >= 80 && code <= 82) return '🌧️'; // Rain showers
  if (code >= 85 && code <= 86) return '🌨️'; // Snow showers
  if (code >= 95 && code <= 99) return '⛈️'; // Thunderstorm
  return '☀️';
};

/**
 * Map WMO weather codes to text descriptions
 */
const weatherCodeToText = (code) => {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Clear';
};

/**
 * Convert wind degrees to cardinal direction
 */
const degreesToDirection = (degrees) => {
  if (degrees === null || degrees === undefined) return 'N';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

/**
 * Convert Celsius to Fahrenheit
 */
const celsiusToFahrenheit = (celsius) => Math.round((celsius * 9/5) + 32);

/**
 * Convert km/h to mph
 */
const kmhToMph = (kmh) => Math.round(kmh * 0.621371);

/**
 * Format hour from ISO timestamp
 */
const formatHour = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
};

/**
 * Fetch current weather for a location using Open-Meteo (FREE, no API key!)
 * @param {number} latitude - Course latitude
 * @param {number} longitude - Course longitude
 * @returns {Promise<object>} Weather data in app format
 */
export async function fetchWeather(latitude, longitude) {
  try {
    // Build URL with all parameters we need
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      current: [
        'temperature_2m',
        'apparent_temperature',
        'relative_humidity_2m',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
      ].join(','),
      hourly: [
        'temperature_2m',
        'precipitation_probability',
        'weather_code',
        'wind_speed_10m',
      ].join(','),
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      precipitation_unit: 'inch',
      forecast_days: '1',
      timezone: 'auto',
    });

    const response = await fetch(`${BASE_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    // Get current hour index for forecast
    const now = new Date();
    const currentHour = now.getHours();

    // Build forecast for next 4 hours
    const forecast = [];
    for (let i = 0; i < 4; i++) {
      const hourIndex = currentHour + i + 1;
      if (hourIndex < 24 && data.hourly) {
        forecast.push({
          time: formatHour(data.hourly.time[hourIndex]),
          icon: weatherCodeToEmoji(data.hourly.weather_code[hourIndex]),
          temp: Math.round(data.hourly.temperature_2m[hourIndex]),
          wind: Math.round(data.hourly.wind_speed_10m[hourIndex]),
          precip: data.hourly.precipitation_probability[hourIndex] || 0,
        });
      }
    }

    // Transform to app format
    const weather = {
      current: {
        temp: Math.round(data.current.temperature_2m),
        feelsLike: Math.round(data.current.apparent_temperature),
        condition: weatherCodeToEmoji(data.current.weather_code),
        conditionText: weatherCodeToText(data.current.weather_code),
        wind: {
          speed: Math.round(data.current.wind_speed_10m),
          direction: degreesToDirection(data.current.wind_direction_10m),
          gusts: data.current.wind_gusts_10m ? Math.round(data.current.wind_gusts_10m) : null,
        },
        humidity: data.current.relative_humidity_2m,
        precipitation: Math.round((data.current.precipitation || 0) * 100), // Convert to percentage-like
      },
      forecast,
      lastUpdated: new Date().toISOString(),
      source: 'Open-Meteo (Live)',
    };

    return weather;
  } catch (error) {
    console.error('[WeatherService] Error fetching weather:', error);
    return null;
  }
}

/**
 * Get mock weather data (fallback on error)
 */
export function getMockWeather() {
  const now = new Date();
  const hours = [1, 2, 3, 4].map(h => {
    const d = new Date(now.getTime() + h * 3600000);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  });

  return {
    current: {
      temp: 64,
      feelsLike: 62,
      condition: '☀️',
      conditionText: 'Sunny',
      wind: {
        speed: 12,
        direction: 'WSW',
        gusts: 18,
      },
      humidity: 68,
      precipitation: 0,
    },
    forecast: [
      { time: hours[0], icon: '☀️', temp: 65, wind: 10, precip: 0 },
      { time: hours[1], icon: '⛅', temp: 66, wind: 14, precip: 10 },
      { time: hours[2], icon: '⛅', temp: 67, wind: 16, precip: 15 },
      { time: hours[3], icon: '🌥️', temp: 67, wind: 15, precip: 20 },
    ],
    lastUpdated: now.toISOString(),
    source: 'Demo Data (offline)',
  };
}

/**
 * Get mock course conditions (placeholder for future crowdsourced data)
 */
export function getCourseConditions() {
  return {
    greens: { condition: 'Firm', detail: 'rolling 11.5 stimp' },
    fairways: { condition: 'Firm', detail: 'good roll' },
    rough: { condition: 'Thick', detail: 'wet from weekend' },
    bunkers: { condition: 'Firm sand', detail: '' },
    lastUpdated: '2 hours ago',
    source: 'From player reports',
  };
}

// ============================================================================
// ELEVATION API
// ============================================================================

// Cache for elevation data to avoid repeated API calls
const elevationCache = new Map();

/**
 * Fetch elevation for a single coordinate using Open-Meteo Elevation API
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<number|null>} Elevation in feet, or null if unavailable
 */
export async function fetchElevation(latitude, longitude) {
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;

  // Check cache first
  if (elevationCache.has(cacheKey)) {
    return elevationCache.get(cacheKey);
  }

  try {
    const response = await fetch(
      `${ELEVATION_URL}?latitude=${latitude}&longitude=${longitude}`
    );

    if (!response.ok) {
      console.warn('[WeatherService] Elevation API error:', response.status);
      return null;
    }

    const data = await response.json();
    const elevationMeters = data.elevation?.[0];

    if (elevationMeters === null || elevationMeters === undefined) {
      return null;
    }

    // Convert meters to feet
    const elevationFeet = Math.round(elevationMeters * 3.28084);

    // Cache the result
    elevationCache.set(cacheKey, elevationFeet);

    return elevationFeet;
  } catch (error) {
    console.warn('[WeatherService] Error fetching elevation:', error.message);
    return null;
  }
}

/**
 * Fetch elevation for multiple coordinates in a single API call
 * More efficient than calling fetchElevation multiple times
 * @param {Array<{latitude: number, longitude: number}>} coordinates
 * @returns {Promise<Array<number|null>>} Array of elevations in feet
 */
export async function fetchElevations(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return [];
  }

  // Check which coordinates need fetching
  const results = new Array(coordinates.length).fill(null);
  const toFetch = [];
  const fetchIndices = [];

  coordinates.forEach((coord, index) => {
    const cacheKey = `${coord.latitude.toFixed(5)},${coord.longitude.toFixed(5)}`;
    if (elevationCache.has(cacheKey)) {
      results[index] = elevationCache.get(cacheKey);
    } else {
      toFetch.push(coord);
      fetchIndices.push(index);
    }
  });

  // If everything was cached, return early
  if (toFetch.length === 0) {
    return results;
  }

  try {
    const latitudes = toFetch.map(c => c.latitude).join(',');
    const longitudes = toFetch.map(c => c.longitude).join(',');

    const response = await fetch(
      `${ELEVATION_URL}?latitude=${latitudes}&longitude=${longitudes}`
    );

    if (!response.ok) {
      console.warn('[WeatherService] Elevation API error:', response.status);
      return results;
    }

    const data = await response.json();
    const elevations = data.elevation || [];

    // Process results and cache them
    elevations.forEach((elevMeters, i) => {
      if (elevMeters !== null && elevMeters !== undefined) {
        const elevFeet = Math.round(elevMeters * 3.28084);
        const coord = toFetch[i];
        const cacheKey = `${coord.latitude.toFixed(5)},${coord.longitude.toFixed(5)}`;

        elevationCache.set(cacheKey, elevFeet);
        results[fetchIndices[i]] = elevFeet;
      }
    });

    return results;
  } catch (error) {
    console.warn('[WeatherService] Error fetching elevations:', error.message);
    return results;
  }
}

/**
 * Get elevation change between two points
 * Positive = uphill, Negative = downhill
 * @param {Object} from - { latitude, longitude, altitude? }
 * @param {Object} to - { latitude, longitude, altitude? }
 * @returns {Promise<{elevationChange: number|null, fromElevation: number|null, toElevation: number|null}>}
 */
export async function getElevationChange(from, to) {
  // Use existing altitude if available, otherwise fetch
  let fromElevation = from.altitude ?? from.elevation ?? null;
  let toElevation = to.altitude ?? to.elevation ?? null;

  // Fetch any missing elevations
  const needsFetch = [];
  if (fromElevation === null) needsFetch.push(from);
  if (toElevation === null) needsFetch.push(to);

  if (needsFetch.length > 0) {
    const fetched = await fetchElevations(needsFetch);
    let fetchIndex = 0;

    if (fromElevation === null) {
      fromElevation = fetched[fetchIndex++];
    }
    if (toElevation === null) {
      toElevation = fetched[fetchIndex];
    }
  }

  const elevationChange = (fromElevation !== null && toElevation !== null)
    ? toElevation - fromElevation
    : null;

  return {
    elevationChange,
    fromElevation,
    toElevation,
  };
}
