import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { streamHolePlan } from './streamingService';
import { fetchWeather } from './weatherService';
import { calculateShotContext } from './shotCalculations';
import { computeHolePlan } from './holePlanEngine';
import { generateCommentary, generatePlanSummary } from './commentaryGenerator';

const BAG_STORAGE_KEY = '@myGolfBag';

/**
 * Ensure the Supabase session has a fresh access token before calling edge functions.
 * Always forces a refresh to prevent "invalid JWT" errors from expired tokens.
 */
async function ensureFreshSession() {
  try {
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('Session refresh error:', error.message);
    }
    if (!session) {
      console.warn('No session after refresh — user may need to sign in again');
    }
  } catch (e) {
    console.warn('Session refresh failed:', e?.message);
  }
}

// Default club distances (used as fallback if user hasn't set up their bag)
const DEFAULT_CLUB_DISTANCES = {
  driver: 250,
  '3_wood': 230,
  '5_wood': 215,
  '7_wood': 205,
  '3_hybrid': 210,
  '4_hybrid': 200,
  '5_hybrid': 190,
  '6_hybrid': 180,
  '2_iron': 210,
  '3_iron': 205,
  '4_iron': 195,
  '5_iron': 185,
  '6_iron': 175,
  '7_iron': 165,
  '8_iron': 155,
  '9_iron': 145,
  pw: 135,
  gw: 120,
  sw: 100,
  lw: 80,
  '60_wedge': 70,
  w_48: 120,
  w_54: 100,
  w_58: 80,
};

/**
 * Load the user's golf bag from AsyncStorage
 * @returns {Promise<Object>} Club distances object { clubId: distance }
 */
export async function loadUserBag() {
  try {
    const savedBag = await AsyncStorage.getItem(BAG_STORAGE_KEY);
    if (savedBag) {
      const bagData = JSON.parse(savedBag);
      // Convert bag data to club distances format
      const clubDistances = {};
      Object.keys(bagData).forEach((clubId) => {
        const distance = parseInt(bagData[clubId].distance, 10);
        if (!isNaN(distance) && distance > 0) {
          clubDistances[clubId] = distance;
        }
      });
      return clubDistances;
    }
  } catch (error) {
    console.error('Error loading user bag:', error);
  }
  return null;
}

// Fallback weather if API fails
const DEFAULT_WEATHER = {
  temperature: 72,
  windSpeed: 10,
  windDirection: 'WSW',
  humidity: 65,
  conditions: 'sunny',
};

/**
 * Normalize weather data to the flat format expected by the hole plan engine.
 * Handles both nested API format (from fetchWeather) and flat format.
 *
 * API format: { current: { temp, wind: { speed, direction }, humidity } }
 * Flat format: { temperature, windSpeed, windDirection, humidity }
 *
 * @param {Object} weather - Weather data in either format
 * @returns {Object} - Weather in flat format
 */
function normalizeWeather(weather) {
  if (!weather) {
    return null;
  }

  // Check if it's already in flat format
  if (weather.windSpeed !== undefined) {
    return weather;
  }

  // Check if it's in nested API format
  if (weather.current && weather.current.wind) {
    return {
      temperature: weather.current.temp,
      windSpeed: weather.current.wind.speed,
      windDirection: weather.current.wind.direction,
      windBearing: convertDirectionToBearing(weather.current.wind.direction),
      humidity: weather.current.humidity,
      conditions: weather.current.conditionText || 'clear',
      feelsLike: weather.current.feelsLike,
      windGusts: weather.current.wind.gusts,
    };
  }

  // Unknown format, return null to trigger default fetch
  console.warn('[aiCaddyService] Unknown weather format, will fetch fresh');
  return null;
}

/**
 * Convert cardinal direction to bearing degrees
 * @param {string} direction - Cardinal direction (N, NE, etc.)
 * @returns {number} - Bearing in degrees (0-360)
 */
function convertDirectionToBearing(direction) {
  const directions = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
  };
  return directions[direction] ?? 0;
}

/**
 * Compute hole plan locally using rule-based decision engine.
 * No LLM/API call required - instant computation.
 *
 * @param {Object} context - Current hole and player context
 * @param {Object} userClubDistances - User's club distances
 * @param {Object} weather - Weather conditions (optional, will fetch if not provided)
 * @param {Object} caddiePreferences - Optional caddie preferences (bestArea, worstArea, etc.)
 * @returns {Promise<{shotPlan: Object, message: string, error: string|null}>}
 */
export async function computeLocalHolePlan(context, userClubDistances = null, weather = null, caddiePreferences = null, playerInsights = null) {
  try {
    const { holeInfo, holeGPS, courseHole, playerLocation, userLocation, lieType } = context;

    // Determine starting position
    const position = userLocation || playerLocation || holeGPS?.teeBox;
    if (!position) {
      return {
        shotPlan: null,
        message: null,
        error: 'Unable to determine player position',
      };
    }

    // Normalize weather to flat format expected by engine
    // Weather from HoleViewSatellite is in nested API format { current: { wind: { speed } } }
    // Engine expects flat format { windSpeed, windDirection, temperature }
    let effectiveWeather = normalizeWeather(weather);
    if (!effectiveWeather) {
      effectiveWeather = await getWeatherForShot(position);
    }

    // Log weather for debugging
    console.log('[aiCaddyService] Using weather:', JSON.stringify(effectiveWeather));

    // Use user's club distances or defaults
    const clubDistances = userClubDistances && Object.keys(userClubDistances).length > 0
      ? userClubDistances
      : DEFAULT_CLUB_DISTANCES;

    // Build hole data for the engine
    const holeData = {
      par: holeInfo?.par || 4,
      yardage: holeInfo?.yardage || 400,
      teeBox: holeGPS?.teeBox,
      green: holeGPS?.green,
      greenFront: courseHole?.greenFront || null,
      greenBack: courseHole?.greenBack || null,
      polygons: courseHole?.polygons || [],
    };

    // Build player context for the engine
    const playerContext = {
      position,
      clubDistances,
      handicap: caddiePreferences?.handicap || 15,
      lieType: lieType || 'fairway',
      // Player strength/weakness for shot scoring
      bestArea: caddiePreferences?.bestArea || null,
      worstArea: caddiePreferences?.worstArea || null,
      missPattern: caddiePreferences?.missPattern || null,
      distanceControl: caddiePreferences?.distanceControl || null,
    };

    // Compute the plan using rule-based engine (instant, no API)
    // Pass player insights for personalized recommendations when available
    const plan = computeHolePlan(holeData, playerContext, effectiveWeather, null, playerInsights);

    if (plan.error) {
      return {
        shotPlan: null,
        message: null,
        error: plan.error,
      };
    }

    // Generate natural language commentary from templates (no LLM)
    const commentary = generateCommentary(plan, holeData, playerInsights);

    // Format the plan to match the expected structure from the old LLM response
    // Add defensive checks to prevent undefined values causing render errors
    const formattedPlan = {
      shots: (plan.shots || []).map((shot, index) => ({
        shotNumber: shot.shotNumber || (index + 1),
        club: shot.club || 'Club',
        distance: shot.distance || 0, // Raw GPS distance (matches marker on map)
        effectiveDistance: shot.effectiveDistance || shot.distance || 0, // "Plays like" distance
        adjustments: shot.adjustments || null, // Wind/temp breakdown for UI
        landingZone: shot.landingZone || { latitude: 0, longitude: 0, description: '' },
        target: shot.target || '',
        reasoning: shot.reasoning || '',
        nextShotDistance: shot.nextShotDistance || (index < plan.shots.length - 1 ? plan.shots[index + 1]?.distance : 0) || 0,
        warnings: (shot.avoidZones || [])
          .filter(z => z && z.type)
          .map(z => `Watch ${z.type || 'hazard'} ${z.direction || ''}`.trim()),
        avoidZones: shot.avoidZones || [],
        confidence: shot.confidence || 'medium',
      })),
      overallStrategy: `${plan.strategy || 'smart'} play - ${plan.riskAssessment?.bailout || 'play smart'}`,
      keyConsiderations: [
        plan.riskAssessment?.mainThreat,
        plan.riskAssessment?.bailout,
      ].filter(Boolean),
      mindset: plan.strategy || 'smart',
      targetScore: plan.targetScore <= holeData.par - 1 ? 'birdie' : plan.targetScore === holeData.par ? 'par' : 'bogey',
      riskAssessment: plan.riskAssessment || null,
      rawTargetScore: plan.targetScore || null,
    };

    return {
      shotPlan: formattedPlan,
      message: commentary,
      summary: generatePlanSummary(plan),
      error: null,
      // Include raw plan data for debugging/advanced use
      _rawPlan: plan,
    };
  } catch (err) {
    console.error('[aiCaddyService] Local plan computation error:', err);
    return {
      shotPlan: null,
      message: null,
      error: `Plan computation failed: ${err.message}`,
    };
  }
}

/**
 * Fetch real weather and convert to the format expected by the edge function
 * @param {Object} position - { latitude, longitude }
 * @returns {Promise<Object>} Weather in edge function format
 */
async function getWeatherForShot(position) {
  if (!position || !position.latitude || !position.longitude) {
    console.warn('[aiCaddyService] No position for weather, using defaults');
    return DEFAULT_WEATHER;
  }

  try {
    const weatherData = await fetchWeather(position.latitude, position.longitude);

    // Convert from weatherService format to edge function format
    return {
      temperature: weatherData.current.temp,
      windSpeed: weatherData.current.wind.speed,
      windDirection: weatherData.current.wind.direction,
      humidity: weatherData.current.humidity,
      conditions: weatherData.current.conditionText,
      // Include extra data for future calculations
      feelsLike: weatherData.current.feelsLike,
      windGusts: weatherData.current.wind.gusts,
    };
  } catch (error) {
    console.warn('[aiCaddyService] Weather fetch failed, using defaults:', error.message);
    return DEFAULT_WEATHER;
  }
}

/**
 * Get conversational advice from Pure
 * @param {Object} context - Current hole and player context
 * @param {string} userMessage - User's question/message
 * @param {Array} conversationHistory - Previous messages in the chat
 * @param {Object} userClubDistances - Optional user's club distances from their bag
 * @param {Object} caddiePreferences - Optional caddie preferences (responseDepth, bestArea, worstArea, etc.)
 * @returns {Promise<{message: string|null, shotPlan: Object|null, error: string|null}>}
 */
export async function getCaddyAdvice(context, userMessage, conversationHistory = [], userClubDistances = null, caddiePreferences = null) {
  // Fetch real weather for current position
  const currentPosition = context.userLocation || context.playerLocation || context.holeGPS?.teeBox;
  const weather = await getWeatherForShot(currentPosition);

  const payload = buildRequestPayload('chat', context, userMessage, conversationHistory, userClubDistances, caddiePreferences, weather);

  try {
    await ensureFreshSession();
    const response = await supabase.functions.invoke('pure', {
      body: payload,
    });

    const { data, error } = response;

    if (error) {
      console.error('Pure service error:', error);
      let errorMessage = error.message || String(error);
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          console.error('Edge function response body:', JSON.stringify(body, null, 2));
          errorMessage = body?.error || body?.message || errorMessage;
        }
      } catch (e) {
        // Couldn't parse error context
      }
      return {
        message: null,
        shotPlan: null,
        error: `Failed to get advice: ${errorMessage}`,
      };
    }

    if (!data || !data.success) {
      return {
        message: data?.message || null,
        shotPlan: null,
        error: data?.error || 'Something went wrong.',
      };
    }

    return {
      message: data.message,
      shotPlan: data.shotPlan || null,
      error: null,
    };
  } catch (err) {
    console.error('Pure request failed:', err?.message || err);
    return {
      message: null,
      shotPlan: null,
      error: `Connection error: ${err?.message || 'Please check your network.'}`,
    };
  }
}

/**
 * Plan the entire hole with shot-by-shot recommendations
 * @param {Object} context - Current hole and player context
 * @param {Object} userClubDistances - Optional user's club distances from their bag
 * @param {Object} caddiePreferences - Optional caddie preferences (responseDepth, bestArea, worstArea, etc.)
 * @returns {Promise<{shotPlan: Object|null, message: string|null, error: string|null}>}
 */
export async function planHole(context, userClubDistances = null, caddiePreferences = null) {
  // Fetch real weather for current position
  const currentPosition = context.userLocation || context.playerLocation || context.holeGPS?.teeBox;
  const weather = await getWeatherForShot(currentPosition);

  const payload = buildRequestPayload('plan', context, null, [], userClubDistances, caddiePreferences, weather);

  try {
    await ensureFreshSession();
    const response = await supabase.functions.invoke('pure', {
      body: payload,
    });

    const { data, error } = response;

    if (error) {
      console.error('Pure planning error:', error);
      // Supabase FunctionsHttpError wraps the response body - try to extract it
      let errorMessage = error.message || String(error);
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          console.error('Edge function response body:', JSON.stringify(body, null, 2));
          errorMessage = body?.error || body?.message || errorMessage;
        }
      } catch (e) {
        // Couldn't parse error context
      }
      return {
        shotPlan: null,
        message: null,
        error: `Failed to plan hole: ${errorMessage}`,
      };
    }

    if (!data || !data.success) {
      console.error('Pure plan unsuccessful:', JSON.stringify(data, null, 2));
      return {
        shotPlan: null,
        message: data?.message || null,
        error: data?.error || 'Something went wrong.',
      };
    }

    return {
      shotPlan: data.shotPlan,
      message: data.message,
      error: null,
    };
  } catch (err) {
    console.error('Pure plan request failed:', err?.message || err);
    return {
      shotPlan: null,
      message: null,
      error: `Connection error: ${err?.message || 'Please check your network.'}`,
    };
  }
}

/**
 * Stream a hole plan with progressive callbacks.
 * Shows shots one at a time as the AI generates them.
 * @param {Object} context - Current hole and player context
 * @param {Object} userClubDistances - Optional user's club distances
 * @param {Object} caddiePreferences - Optional caddie preferences (responseDepth, bestArea, worstArea, etc.)
 * @param {Object} callbacks - { onText, onShot, onPlanMeta, onDone, onError }
 * @returns {Promise<Function>} abort - Call to cancel the stream
 */
export async function planHoleStreaming(context, userClubDistances, caddiePreferences, callbacks) {
  console.log('[aiCaddy] 1. planHoleStreaming started');
  // Fetch real weather for current position
  const currentPosition = context.userLocation || context.playerLocation || context.holeGPS?.teeBox;
  console.log('[aiCaddy] 1b. Fetching weather for position');
  const weather = await getWeatherForShot(currentPosition);
  console.log('[aiCaddy] 2. Weather fetched');

  const payload = buildRequestPayload('plan', context, null, [], userClubDistances, caddiePreferences, weather);
  console.log('[aiCaddy] 3. Payload built, calling streamHolePlan. Payload size:', JSON.stringify(payload).length);
  return streamHolePlan(payload, callbacks);
}

/**
 * Build the request payload for the Edge Function
 * @param {string} mode - 'chat' or 'plan'
 * @param {Object} context - Hole and player context
 * @param {string} userMessage - User's message (for chat mode)
 * @param {Array} conversationHistory - Previous messages
 * @param {Object} userClubDistances - Club distances
 * @param {Object} caddiePreferences - Caddie preferences
 * @param {Object} weather - Weather data (from getWeatherForShot)
 */
function buildRequestPayload(mode, context, userMessage, conversationHistory, userClubDistances = null, caddiePreferences = null, weather = null) {
  const { holeInfo, holeGPS, courseHole, playerLocation, userLocation, lieType } = context;

  // Use user-placed marker location if available, otherwise use player GPS, fallback to tee box
  const currentPosition = userLocation || playerLocation || holeGPS?.teeBox || { latitude: 0, longitude: 0 };

  // Calculate distances
  const distanceToGreen = holeGPS
    ? calculateDistance(currentPosition, holeGPS.green)
    : holeInfo.yardage;

  const distanceFromTee = holeGPS
    ? calculateDistance(holeGPS.teeBox, currentPosition)
    : 0;

  // Use user's club distances if available, otherwise use defaults
  const clubDistances = userClubDistances && Object.keys(userClubDistances).length > 0
    ? userClubDistances
    : DEFAULT_CLUB_DISTANCES;

  // Pre-calculate shot context (wind, temp, hazards, club selection, fairway targets)
  const effectiveWeather = weather || DEFAULT_WEATHER;
  const preCalculated = calculateShotContext({
    player: {
      currentPosition,
      distanceToGreen,
      lieType: lieType || 'fairway',
    },
    weather: effectiveWeather,
    clubDistances,
    hazards: courseHole?.polygons || [],
    targetPosition: holeGPS?.green || { latitude: 0, longitude: 0 },
    // Elevation data - will be null until device GPS provides it
    playerElevation: currentPosition?.elevation || null,
    targetElevation: holeGPS?.green?.elevation || null,
    courseElevation: null, // TODO: Add to course metadata
    teeBox: holeGPS?.teeBox || { latitude: 0, longitude: 0 },
  });

  return {
    mode,
    userMessage,
    hole: {
      number: holeInfo.holeNumber,
      par: holeInfo.par,
      yardage: holeInfo.yardage,
      handicap: holeInfo.handicap,
    },
    player: {
      currentPosition,
      distanceToGreen,
      distanceFromTee,
      lieType: lieType || 'fairway',
    },
    geography: {
      teeBox: holeGPS?.teeBox || { latitude: 0, longitude: 0 },
      green: holeGPS?.green || { latitude: 0, longitude: 0 },
      greenFront: courseHole?.greenFront || null,
      greenBack: courseHole?.greenBack || null,
      polygons: courseHole?.polygons || [],
    },
    clubDistances,
    weather: effectiveWeather,
    conversationHistory: conversationHistory.map((msg) => ({
      role: msg.sender === 'caddy' ? 'assistant' : 'user',
      content: msg.text,
    })),
    // Caddie preferences for response customization
    caddiePreferences: caddiePreferences || null,
    // Pre-calculated adjustments (wind, temp, hazards, club selection)
    preCalculated,
  };
}

/**
 * Calculate distance between two GPS coordinates in yards (Haversine formula)
 */
function calculateDistance(coord1, coord2) {
  if (!coord1 || !coord2) return 0;

  const R = 6371e3; // Earth radius in meters
  const lat1Rad = (coord1.latitude * Math.PI) / 180;
  const lat2Rad = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const meters = R * c;
  return Math.round(meters * 1.09361); // Convert to yards
}
