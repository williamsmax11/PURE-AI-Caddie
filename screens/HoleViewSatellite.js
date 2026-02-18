/**
 * Hole View with Satellite Imagery
 *
 * This component shows an interactive satellite view of the golf hole
 * Similar to 18 Birdies, The Grint, and other golf apps
 *
 * SETUP REQUIRED:
 * 1. npm install react-native-maps (or: npx expo install react-native-maps)
 * 2. Add Google Maps API key to app.json (Android) - iOS uses Apple Maps (free)
 * 3. Add hole GPS coordinates to your course data
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Modal,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  Animated,
  PanResponder,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import MapView, { Marker, Polyline, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Button, EffectiveDistanceDisplay, DraggableShotMarker } from '../components';
import ShotDetailPanel from '../components/ShotDetailPanel';
import ShotEntryPanel from '../components/ShotEntryPanel';
import { useTraining } from '../components/TrainingProvider';
import TrainingOverlay from '../components/TrainingOverlay';
import { calculateShotContext } from '../services/shotCalculations';
import { getElevationChange } from '../services/weatherService';
import theme from '../theme';
import { fetchHolesByCourse } from '../services/holeService';
import { loadUserBag, computeLocalHolePlan } from '../services/aiCaddyService';
import { calculateDistance, calculateBearing, determineLieType, calculateHazardDistances } from '../utils/geoUtils';
import { startTracking, stopTracking } from '../services/locationService';
// Shot detection - tracks player movement to auto-detect shots
import { createShotDetector, STATES } from '../services/shotDetectionService';
import { startSimulation, stopSimulation } from '../services/gpsSimulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveShotToCache, getNextShotNumber, updateShotLanding } from '../services/roundCacheService';
import { loadPlayerInsights } from '../services/playerInsightsService';
import * as Speech from 'expo-speech';
import { fetchWeather } from '../services/weatherService';
import {
  preComputeClubReaches,
  preComputeHazardCentroids,
  computeFullShotUpdate,
} from '../services/dragShotCalculator';
import { DEFAULT_SCORING_CONFIG } from '../services/scoringConfig';
import { generateBezierArc, easeOutCubic, calculateArcHeight, generateTrailColors } from '../utils/shotPathAnimation';
import { generateCaddieReminders } from '../utils/caddieReminders';

const { width } = Dimensions.get('window');

/**
 * Derive the next shot's lie type from the current shot's result.
 */
function deriveLieFromResult(result) {
  switch (result) {
    case 'fairway': return 'fairway';
    case 'green':
    case 'fringe': return 'green';
    case 'rough_left':
    case 'rough_right': return 'rough';
    case 'bunker': return 'bunker';
    case 'water':
    case 'ob': return 'other';
    default: return 'fairway';
  }
}

export default function HoleViewSatellite({
  course,
  selectedTee,
  currentHole = 1,
  onEndRound,
  onNextHole,
  onPauseRound,
  resumeScores = [],
}) {
  // Build initial holeScores from resumeScores (cached data from previous session)
  const initialHoleScores = () => {
    const scores = {};
    (resumeScores || []).forEach(s => {
      if (s.hole && s.score != null) {
        scores[s.hole] = s.score;
      }
    });
    return scores;
  };

  const [holesData, setHolesData] = useState({});
  const [isLoadingHoles, setIsLoadingHoles] = useState(true);
  const [score, setScore] = useState(null);
  const [holeScores, setHoleScores] = useState(initialHoleScores); // { 1: 4, 2: 3, ... } hole number -> score
  const [showSatellite, setShowSatellite] = useState(true);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showFullScorecard, setShowFullScorecard] = useState(false);
  const [showRoundSettings, setShowRoundSettings] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [showHazardDistances, setShowHazardDistances] = useState(true);
  const [showPolygons, setShowPolygons] = useState(true);
  const layerAnims = React.useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const [putts, setPutts] = useState(null);
  const [fairwayHit, setFairwayHit] = useState(null);
  const [girHit, setGirHit] = useState(null);
  const [penalties, setPenalties] = useState(0);
  const [showCaddyTip, setShowCaddyTip] = useState(true);
  const [viewingHole, setViewingHole] = useState(currentHole);
  const [userLocation, setUserLocation] = useState(null);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [selectedShotInfo, setSelectedShotInfo] = useState(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [aiSuggestedShots, setAiSuggestedShots] = useState([]);
  const [aiPlanData, setAiPlanData] = useState(null); // Full shot plan (strategy, green notes, etc.)
  const [aiPlanMessage, setAiPlanMessage] = useState(null); // Caddy's conversational text
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamAbortRef] = useState({ current: null });
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [speechQueue] = useState({ current: [], speaking: false });
  const [userClubDistances, setUserClubDistances] = useState(null);
  const [caddiePreferences, setCaddiePreferences] = useState(null);
  const [playerInsights, setPlayerInsights] = useState(null);
  const [lieType, setLieType] = useState('tee'); // 'tee', 'fairway', 'rough', 'bunker', 'fringe', 'green'
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [gpsPosition, setGpsPosition] = useState(null);
  const [shotContext, setShotContext] = useState(null); // Pre-calculated adjustments for effective distance
  const [locationError, setLocationError] = useState(null);
  const [weather, setWeather] = useState(null);
  const [currentMapHeading, setCurrentMapHeading] = useState(0); // Track actual camera heading for wind arrow
  const [isSimActive, setIsSimActive] = useState(false);
  const [shotDetectorState, setShotDetectorState] = useState(STATES.IDLE);
  const [detectedShots, setDetectedShots] = useState([]);
  // Shot logging state machine: 'idle' | 'preshot' | 'tracking' | 'result'
  const [shotPhase, setShotPhase] = useState('idle');
  const [currentShotNumber, setCurrentShotNumber] = useState(1);
  const [holeShotsLogged, setHoleShotsLogged] = useState(0);
  const [trackingFromPosition, setTrackingFromPosition] = useState(null);
  const [trackingDistance, setTrackingDistance] = useState(0);
  const [preShotData, setPreShotData] = useState(null);
  const [nextLieType, setNextLieType] = useState('tee');
  // Draggable target state
  const [editedShots, setEditedShots] = useState(null);
  const [shotColors, setShotColors] = useState([]);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [isUserEdited, setIsUserEdited] = useState(false);
  // Shot path animation state
  const [isAnimatingPath, setIsAnimatingPath] = useState(false);
  const [animatingSegment, setAnimatingSegment] = useState(-1);
  const [animRevealedPoints, setAnimRevealedPoints] = useState([]);
  const [animTrailColors, setAnimTrailColors] = useState([]);
  const [animBallPosition, setAnimBallPosition] = useState(null);
  const [animCompletedSegments, setAnimCompletedSegments] = useState([]);
  const hasAnimatedForHoleRef = React.useRef({});
  const animationFrameRef = React.useRef(null);
  const animCancelledRef = React.useRef(false);
  const ballGlowAnim = React.useRef(new Animated.Value(0)).current;
  const [mapRenderKick, setMapRenderKick] = useState(0); // Forces a second render cycle for react-native-maps

  const shotDetectorRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const scrollViewRef = React.useRef(null);
  const markerTappedRef = React.useRef(false); // Prevents map press when tapping a marker

  // Training overlay for first-time users
  const { trainingOverlayProps, triggerTraining } = useTraining('holeView');

  // PanResponder for immediate marker dragging (no long-press delay)
  const markerPanResponder = React.useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: async (evt) => {
        if (mapRef.current) {
          const point = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          const coordinate = await mapRef.current.coordinateForPoint(point);
          if (coordinate) {
            setUserLocation(coordinate);
          }
        }
      },
    }), []);

  // ============================================================================
  // DRAGGABLE TARGET: derived state, pre-computation, and event handlers
  // ============================================================================

  // Display shots: use edited version if user has dragged, otherwise engine output
  const displayShots = editedShots || aiSuggestedShots;

  // Pre-compute sorted club reaches for fast binary-search during drag
  const preComputedClubReaches = useMemo(() => {
    if (!userClubDistances || !holesData) return [];
    const hole = holesData[viewingHole];
    if (!hole?.teeBox || !hole?.green) return [];
    const holeBearing = calculateBearing(hole.teeBox, hole.green);
    const weatherForCalc = weather?.current ? {
      windSpeed: weather.current.wind?.speed || 0,
      windDirection: weather.current.wind?.direction || 'N',
      temperature: weather.current.temp || 72,
    } : null;
    return preComputeClubReaches(userClubDistances, weatherForCalc, holeBearing);
  }, [userClubDistances, weather, viewingHole, holesData]);

  // Flat weather object for drag calculations (passed to DraggableShotMarker)
  const weatherForDrag = useMemo(() => {
    if (!weather?.current) return null;
    return {
      windSpeed: weather.current.wind?.speed || 0,
      windDirection: weather.current.wind?.direction || 'N',
      temperature: weather.current.temp || 72,
    };
  }, [weather]);

  // Pre-compute hazard centroids for fast proximity checks during drag
  const hazardCentroids = useMemo(() => {
    if (!holesData) return [];
    const hole = holesData[viewingHole];
    if (!hole?.polygons) return [];
    return preComputeHazardCentroids(hole.polygons);
  }, [holesData, viewingHole]);

  // Initialize shot colors when engine generates a plan
  useEffect(() => {
    if (!aiSuggestedShots || aiSuggestedShots.length === 0) {
      setShotColors([]);
      return;
    }
    // Engine recommendations default to green
    setShotColors(aiSuggestedShots.map(() => 'green'));
  }, [aiSuggestedShots]);

  // Trigger training overlay on first visit (after hole data loads)
  useEffect(() => {
    if (!isLoadingHoles && holesData[viewingHole]) {
      const timer = setTimeout(() => triggerTraining(), 1200);
      return () => clearTimeout(timer);
    }
  }, [isLoadingHoles]);

  // Drag start: initialize editedShots on first drag
  const handleShotDragStart = useCallback((shotIndex) => {
    setDraggingIndex(shotIndex);
    if (!editedShots) {
      setEditedShots(JSON.parse(JSON.stringify(aiSuggestedShots)));
    }
  }, [editedShots, aiSuggestedShots]);

  // Drag move: Tier 1 update — position, distance, club
  const handleShotDragMove = useCallback((shotIndex, newCoordinate, dragUpdate) => {
    setEditedShots(prev => {
      if (!prev) return prev;
      const updated = [...prev];
      updated[shotIndex] = {
        ...updated[shotIndex],
        landingZone: newCoordinate,
        distance: dragUpdate.distance,
        club: dragUpdate.displayName,
        effectiveDistance: dragUpdate.effectiveDistance || dragUpdate.distance,
      };

      // Update next shot's distance (if exists) since previous position changed
      if (shotIndex + 1 < updated.length && updated[shotIndex + 1]?.landingZone) {
        const nextDistance = Math.round(
          calculateDistance(newCoordinate, updated[shotIndex + 1].landingZone)
        );
        updated[shotIndex + 1] = {
          ...updated[shotIndex + 1],
          distance: nextDistance,
        };
      }

      return updated;
    });

    // Update color from Tier 2 if provided
    if (dragUpdate.color) {
      setShotColors(prev => {
        const updated = [...prev];
        updated[shotIndex] = dragUpdate.color;
        return updated;
      });
    }
  }, []);

  // Drag end: Tier 3 — full scoring and chain recalculation
  // Uses functional setEditedShots to avoid stale closure issues
  const handleShotDragEnd = useCallback((shotIndex, finalCoordinate) => {
    // Defer state updates to let the native drag-end transition complete.
    // Updating React state while the native Marker is still finishing its drag
    // animation causes the custom view bitmap to fail to re-render.
    setTimeout(() => {
      setDraggingIndex(null);
      setIsUserEdited(true);

      const hole = holesData?.[viewingHole];
      if (!hole) return;

      const holeData = {
        par: hole.par,
        teeBox: hole.teeBox,
        green: hole.green,
        polygons: hole.polygons || [],
      };

      const playerContext = {
        clubDistances: userClubDistances,
        handicap: 15,
        bestArea: caddiePreferences?.bestArea || null,
        worstArea: caddiePreferences?.worstArea || null,
      };

      const weatherForCalc = weather?.current ? {
        windSpeed: weather.current.wind?.speed || 0,
        windDirection: weather.current.wind?.direction || 'N',
        temperature: weather.current.temp || 72,
      } : null;

      // Use functional updater to get latest editedShots (avoids stale closure).
      // Capture computed colors via closure variable (updater runs synchronously).
      let computedColors = null;
      setEditedShots(prev => {
        if (!prev) return prev;

        // Ensure dragged shot has the exact final coordinate from native drag event
        const withFinalPos = [...prev];
        withFinalPos[shotIndex] = {
          ...withFinalPos[shotIndex],
          landingZone: finalCoordinate,
        };

        try {
          const { updatedShots, colors } = computeFullShotUpdate(
            withFinalPos,
            shotIndex,
            holeData,
            playerContext,
            weatherForCalc,
            DEFAULT_SCORING_CONFIG,
            preComputedClubReaches
          );
          computedColors = colors;
          return updatedShots;
        } catch (e) {
          console.warn('[DragEnd] Full computation failed:', e.message);
          return withFinalPos;
        }
      });

      // Set colors outside the functional updater (React anti-pattern to call setState inside updater)
      if (computedColors) {
        setShotColors(computedColors);
      }
    }, 100);
  }, [holesData, viewingHole, weather, userClubDistances, caddiePreferences, preComputedClubReaches]);

  // Reset plan to original engine recommendation
  const handleResetPlan = useCallback(() => {
    setEditedShots(null);
    setIsUserEdited(false);
    setShotColors(aiSuggestedShots ? aiSuggestedShots.map(() => 'green') : []);
    setDraggingIndex(null);
  }, [aiSuggestedShots]);

  // Polyline color helper
  const getPolylineColor = (color) => {
    switch (color) {
      case 'red': return '#f87171';
      case 'yellow': return '#fbbf24';
      default: return '#34d399';
    }
  };

  // Convert wind direction (e.g., "WSW") to rotation degrees for arrow
  // Wind direction indicates where wind is coming FROM, arrow points where it's GOING
  const getWindRotation = (direction) => {
    const directionMap = {
      'N': 180, 'NNE': 202.5, 'NE': 225, 'ENE': 247.5,
      'E': 270, 'ESE': 292.5, 'SE': 315, 'SSE': 337.5,
      'S': 0, 'SSW': 22.5, 'SW': 45, 'WSW': 67.5,
      'W': 90, 'WNW': 112.5, 'NW': 135, 'NNW': 157.5,
    };
    return directionMap[direction] || 0;
  };

  // Calculate midpoint between two coordinates (for placing distance labels on lines)
  const getMidpoint = (coord1, coord2) => {
    if (!coord1 || !coord2) return null;
    return {
      latitude: (coord1.latitude + coord2.latitude) / 2,
      longitude: (coord1.longitude + coord2.longitude) / 2,
    };
  };

  // State for segment-specific shot contexts (tee-to-spot and spot-to-green)
  const [teeToSpotContext, setTeeToSpotContext] = useState(null);
  const [spotToGreenContext, setSpotToGreenContext] = useState(null);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      animCancelledRef.current = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Fetch holes from Supabase when component mounts
  useEffect(() => {
    if (course?.id) {
      loadHoles();
    }
  }, [course?.id]);

  // Load persisted TTS setting
  useEffect(() => {
    AsyncStorage.getItem('@appSettings').then(data => {
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.ttsEnabled !== undefined) setTtsEnabled(parsed.ttsEnabled);
      }
    });
  }, []);

  // Load user's club distances from their bag
  useEffect(() => {
    const loadBag = async () => {
      const clubDistances = await loadUserBag();
      if (clubDistances) {
        setUserClubDistances(clubDistances);
      }
    };
    loadBag();
  }, []);

  // Load player insights (measured stats + tendencies) once at round start
  useEffect(() => {
    const loadInsights = async () => {
      try {
        const { supabase } = require('../config/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const insights = await loadPlayerInsights(session.user.id);
          if (insights && !insights.error) {
            setPlayerInsights(insights);
          }
        }
      } catch (err) {
        console.warn('[HoleView] Failed to load player insights:', err);
      }
    };
    loadInsights();
  }, []);

  // Load user's caddie preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const userProfileData = await AsyncStorage.getItem('userProfile');
        if (userProfileData) {
          const profile = JSON.parse(userProfileData);
          setCaddiePreferences({
            responseDepth: profile.responseDepth || 'detailed',
            bestArea: profile.bestArea || null,
            worstArea: profile.worstArea || null,
            planningStyle: profile.planningStyle || null,
            missPattern: profile.missPattern || null,
            distanceControl: profile.distanceControl || null,
            handicap: profile.handicap || 15,
          });
        }
      } catch (error) {
        console.error('Error loading caddie preferences:', error);
      }
    };
    loadPreferences();
  }, []);

  // Fetch weather data for the course location
  useEffect(() => {
    const loadWeather = async () => {
      const hole = holesData[viewingHole];
      if (!hole?.teeBox) return;
      try {
        const weatherData = await fetchWeather(
          hole.teeBox.latitude,
          hole.teeBox.longitude
        );
        setWeather(weatherData);
      } catch (error) {
        console.error('Error fetching weather:', error);
      }
    };
    loadWeather();
  }, [holesData, viewingHole]);

  // Calculate shot context (wind/temp/elevation adjustments) when position or weather changes
  useEffect(() => {
    const computeShotContext = async () => {
      const hole = holesData[viewingHole];
      if (!hole) return;

      // Determine current position (GPS > tee box) — always use real player position
      const currentPosition = gpsPosition || hole.teeBox;
      if (!currentPosition) return;

      // Calculate distance to green
      const distanceToGreen = calculateDistance(currentPosition, hole.green);

      // Get elevation change if not already available
      let playerElevation = currentPosition.altitude || currentPosition.elevation || null;
      let targetElevation = hole.green?.elevation || null;

      // Try to fetch elevation if missing
      if (playerElevation === null || targetElevation === null) {
        try {
          const elevData = await getElevationChange(currentPosition, hole.green);
          if (playerElevation === null) playerElevation = elevData.fromElevation;
          if (targetElevation === null) targetElevation = elevData.toElevation;
        } catch (e) {
          // Elevation fetch failed, continue without it
        }
      }

      // Convert weather to the format expected by calculateShotContext
      const weatherForCalc = weather ? {
        temperature: weather.current?.temp || 72,
        windSpeed: weather.current?.wind?.speed || 0,
        windDirection: weather.current?.wind?.direction || 'N',
        humidity: weather.current?.humidity || 50,
        conditions: weather.current?.conditionText || 'Clear',
      } : null;

      // Calculate shot context
      const context = calculateShotContext({
        player: {
          currentPosition,
          distanceToGreen,
          lieType: lieType || 'fairway',
        },
        weather: weatherForCalc,
        clubDistances: userClubDistances || {},
        hazards: hole.polygons || [],
        targetPosition: hole.green,
        playerElevation,
        targetElevation,
        courseElevation: null, // TODO: Add to course metadata
      });

      setShotContext(context);
    };

    computeShotContext();
  }, [holesData, viewingHole, gpsPosition, weather, userClubDistances, lieType]);

  // Calculate segment-specific shot contexts when user places a marker
  useEffect(() => {
    const computeSegmentContexts = async () => {
      const hole = holesData[viewingHole];
      if (!hole || !userLocation) {
        setTeeToSpotContext(null);
        setSpotToGreenContext(null);
        return;
      }

      // Convert weather to the format expected by calculateShotContext
      const weatherForCalc = weather ? {
        temperature: weather.current?.temp || 72,
        windSpeed: weather.current?.wind?.speed || 0,
        windDirection: weather.current?.wind?.direction || 'N',
        humidity: weather.current?.humidity || 50,
        conditions: weather.current?.conditionText || 'Clear',
      } : null;

      // --- Tee to Spot Context ---
      const teeToSpotDistance = calculateDistance(hole.teeBox, userLocation);
      let teeElevation = hole.teeBox?.elevation || null;
      let spotElevation = userLocation?.altitude || userLocation?.elevation || null;

      // Fetch elevation if missing
      if (teeElevation === null || spotElevation === null) {
        try {
          const elevData = await getElevationChange(hole.teeBox, userLocation);
          if (teeElevation === null) teeElevation = elevData.fromElevation;
          if (spotElevation === null) spotElevation = elevData.toElevation;
        } catch (e) { /* continue without */ }
      }

      const teeContext = calculateShotContext({
        player: {
          currentPosition: hole.teeBox,
          distanceToGreen: teeToSpotDistance, // Distance to the selected spot
          lieType: 'tee',
        },
        weather: weatherForCalc,
        clubDistances: userClubDistances || {},
        hazards: hole.polygons || [],
        targetPosition: userLocation,
        playerElevation: teeElevation,
        targetElevation: spotElevation,
        courseElevation: null,
      });

      // DEBUG: Detailed comparison log for plays-like alignment
      const teeShotBearing = calculateBearing(hole.teeBox, userLocation);
      console.log(`[TAP-TEE] ===== Tee to Tap Point =====`);
      console.log(`[TAP-TEE] baseDistance: ${teeToSpotDistance}`);
      console.log(`[TAP-TEE] effectiveDistance (plays like): ${teeContext.effectiveDistance}`);
      console.log(`[TAP-TEE] shotBearing: ${teeShotBearing}`);
      console.log(`[TAP-TEE] playerElevation (tee): ${teeElevation}`);
      console.log(`[TAP-TEE] targetElevation (spot): ${spotElevation}`);
      console.log(`[TAP-TEE] tapLocation lat/lng: ${userLocation.latitude}, ${userLocation.longitude}`);
      console.log(`[TAP-TEE] teeBox lat/lng: ${hole.teeBox.latitude}, ${hole.teeBox.longitude}`);
      console.log(`[TAP-TEE] weather: wind=${weatherForCalc?.windSpeed} mph ${weatherForCalc?.windDirection}, temp=${weatherForCalc?.temperature}°F, courseElev=null`);
      console.log(`[TAP-TEE] adjustments: wind=${teeContext.adjustments?.wind?.distanceEffect}, temp=${teeContext.adjustments?.temperature?.distanceEffect}, elev=${teeContext.adjustments?.elevation?.slopeEffect}`);
      console.log(`[TAP-TEE] ===================================`);

      setTeeToSpotContext(teeContext);

      // --- Spot to Green Context ---
      const spotToGreenDistance = calculateDistance(userLocation, hole.green);
      let greenElevation = hole.green?.elevation || null;

      // Fetch green elevation if missing
      if (greenElevation === null) {
        try {
          const elevData = await getElevationChange(userLocation, hole.green);
          greenElevation = elevData.toElevation;
        } catch (e) { /* continue without */ }
      }

      const spotContext = calculateShotContext({
        player: {
          currentPosition: userLocation,
          distanceToGreen: spotToGreenDistance,
          lieType: 'fairway', // Assume fairway for the approach
        },
        weather: weatherForCalc,
        clubDistances: userClubDistances || {},
        hazards: hole.polygons || [],
        targetPosition: hole.green,
        playerElevation: spotElevation,
        targetElevation: greenElevation,
        courseElevation: null,
      });

      // DEBUG: Detailed comparison log for plays-like alignment
      const spotShotBearing = calculateBearing(userLocation, hole.green);
      console.log(`[TAP-GREEN] ===== Tap Point to Green =====`);
      console.log(`[TAP-GREEN] baseDistance: ${spotToGreenDistance}`);
      console.log(`[TAP-GREEN] effectiveDistance (plays like): ${spotContext.effectiveDistance}`);
      console.log(`[TAP-GREEN] shotBearing: ${spotShotBearing}`);
      console.log(`[TAP-GREEN] playerElevation (spot): ${spotElevation}`);
      console.log(`[TAP-GREEN] targetElevation (green): ${greenElevation}`);
      console.log(`[TAP-GREEN] tapLocation lat/lng: ${userLocation.latitude}, ${userLocation.longitude}`);
      console.log(`[TAP-GREEN] green lat/lng: ${hole.green.latitude}, ${hole.green.longitude}`);
      console.log(`[TAP-GREEN] weather: wind=${weatherForCalc?.windSpeed} mph ${weatherForCalc?.windDirection}, temp=${weatherForCalc?.temperature}°F, courseElev=null`);
      console.log(`[TAP-GREEN] adjustments: wind=${spotContext.adjustments?.wind?.distanceEffect}, temp=${spotContext.adjustments?.temperature?.distanceEffect}, elev=${spotContext.adjustments?.elevation?.slopeEffect}`);
      console.log(`[TAP-GREEN] ===================================`);

      setSpotToGreenContext(spotContext);
    };

    computeSegmentContexts();
  }, [holesData, viewingHole, userLocation, weather, userClubDistances]);

  // GPS tracking with shot detection
  useEffect(() => {
    if (!isTrackingActive || !courseHole) return;

    let mounted = true;

    // Create shot detector for this hole
    const detector = createShotDetector(
      {
        teeBox: courseHole.teeBox,
        green: courseHole.green,
        par: courseHole.par,
      },
      courseHole.polygons || [],
      // onShotDetected callback
      (shot) => {
        if (!mounted) return;
        setDetectedShots(prev => [...prev, shot]);
        setLieType(shot.lieType || 'fairway');
      },
      // onStateChange callback
      (newState, metadata) => {
        if (!mounted) return;
        setShotDetectorState(newState);
        // When we reach the green, update lie type
        if (newState === STATES.ON_GREEN) {
          setLieType('green');
        }
      }
    );

    shotDetectorRef.current = detector;
    detector.startHole();
    setShotDetectorState(STATES.AT_TEE);
    setDetectedShots([]);

    const positionHandler = (pos) => {
      if (!mounted) return;
      setGpsPosition(pos);
      // Feed position to shot detector
      if (shotDetectorRef.current) {
        shotDetectorRef.current.processPosition(pos);
      }
    };

    if (isSimActive && __DEV__) {
      startSimulation(positionHandler, {
        teeBox: courseHole.teeBox,
        green: courseHole.green,
        par: courseHole.par,
      });
    } else {
      const initTracking = async () => {
        const started = await startTracking(positionHandler);
        if (!started && mounted) {
          setLocationError('Location permission denied');
          setIsTrackingActive(false);
        }
      };
      initTracking();
    }

    return () => {
      mounted = false;
      stopTracking();
      stopSimulation();
      if (shotDetectorRef.current) {
        shotDetectorRef.current.destroy();
        shotDetectorRef.current = null;
      }
    };
  }, [viewingHole, courseHole, isTrackingActive, isSimActive]);

  const loadHoles = async () => {
    setIsLoadingHoles(true);
    const { data, error } = await fetchHolesByCourse(course.id, selectedTee?.id || null);
    if (!error) {
      setHolesData(data);
    }
    setIsLoadingHoles(false);
  };

  // Get hole data for the hole being viewed
  const courseHole = holesData[viewingHole] || null;

  // These are only safe to access after the !courseHole guard below,
  // but hooks/handlers can't be placed after an early return.
  // So we compute them conditionally here.
  const playerLocation = isTrackingActive && gpsPosition
    ? gpsPosition
    : courseHole
      ? { latitude: courseHole.teeBox.latitude, longitude: courseHole.teeBox.longitude }
      : { latitude: 0, longitude: 0 };

  const holeInfo = courseHole ? {
    holeNumber: viewingHole,
    par: courseHole.par,
    yardage: courseHole.yardage,
    handicap: courseHole.handicap,
    description: courseHole.description,
    aiTip: courseHole.aiTip,
  } : { holeNumber: viewingHole, par: 0, yardage: 0, handicap: 0, description: '', aiTip: '' };

  const holeGPS = courseHole ? {
    teeBox: courseHole.teeBox,
    green: courseHole.green,
    hazards: courseHole.hazards,
  } : null;

  // Handle hole navigation
  const handleHoleChange = (newHole) => {
    if (newHole >= 1 && newHole <= 18) {
      setViewingHole(newHole);
      // Clear user marker and AI suggestion when changing holes
      setUserLocation(null);
      setShowAISuggestions(false);
      setSelectedShotInfo(null);
      setAiSuggestedShots([]);
      setAiPlanData(null);
      setAiPlanMessage(null);
      setIsStreaming(false);
      // Clear drag edit state
      setEditedShots(null);
      setShotColors([]);
      setDraggingIndex(null);
      setIsUserEdited(false);
      // Clear animation state for the old hole
      delete hasAnimatedForHoleRef.current[viewingHole];
      clearAnimationState();
      if (streamAbortRef.current) {
        streamAbortRef.current();
        streamAbortRef.current = null;
      }

      // Animate map to show both tee and green with proper heading
      const newHoleData = holesData[newHole];
      if (mapRef.current && newHoleData) {
        const newHeading = calculateBearing(newHoleData.teeBox, newHoleData.green);
        const newCenterLat = (newHoleData.teeBox.latitude + newHoleData.green.latitude) / 2;
        const newCenterLng = (newHoleData.teeBox.longitude + newHoleData.green.longitude) / 2;

        mapRef.current.animateCamera({
          center: {
            latitude: newCenterLat,
            longitude: newCenterLng,
          },
          pitch: 0,
          heading: newHeading,
          altitude: 500,
          zoom: 17.2,
        }, { duration: 1000 });
      }
    }
  };

  // Update viewingHole when currentHole changes (after entering score)
  React.useEffect(() => {
    setViewingHole(currentHole);
    // Clear user location and AI suggestion when changing holes
    setUserLocation(null);
    setShowAISuggestions(false);
    setSelectedShotInfo(null);
    setAiSuggestedShots([]);
    setAiPlanData(null);
    setAiPlanMessage(null);
    setIsStreaming(false);
    // Clear animation state
    clearAnimationState();
    // Abort any active stream
    if (streamAbortRef.current) {
      streamAbortRef.current();
      streamAbortRef.current = null;
    }
    stopSpeech();
    // Reset lie type to tee for new hole
    setLieType('tee');
    // Reset shot detection for new hole
    setShotDetectorState(STATES.AT_TEE);
    setDetectedShots([]);
    // Reset shot logging for new hole
    setShotPhase('idle');
    setCurrentShotNumber(1);
    setHoleShotsLogged(0);
    setTrackingFromPosition(null);
    setTrackingDistance(0);
    setPreShotData(null);
    setNextLieType('tee');
  }, [currentHole]);

  // Note: Map re-centering when plan overlay is shown/hidden is handled by
  // the mapPadding prop change - no need for a separate camera animation
  // which was causing native bridge overload and crashes.

  // Auto-detect lie type when user places marker
  React.useEffect(() => {
    if (!userLocation) {
      // No marker placed, assume on tee
      setLieType('tee');
      return;
    }

    if (courseHole && courseHole.polygons) {
      const detectedLie = determineLieType(userLocation, courseHole.polygons);
      setLieType(detectedLie);
    }
  }, [userLocation, courseHole]);

  // Handle map press to place user marker
  const handleMapPress = (event) => {
    // Skip if a marker was just tapped (prevents placing user marker when tapping shot details)
    if (markerTappedRef.current) {
      markerTappedRef.current = false;
      return;
    }
    Keyboard.dismiss();
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setUserLocation({ latitude, longitude });
  };

  // TTS: queue text and speak sequentially
  const speakText = (text) => {
    if (!ttsEnabled) return;
    speechQueue.current.push(text);
    if (!speechQueue.speaking) {
      processQueue();
    }
  };

  const processQueue = () => {
    if (speechQueue.current.length === 0) {
      speechQueue.speaking = false;
      return;
    }
    speechQueue.speaking = true;
    const next = speechQueue.current.shift();
    Speech.speak(next, {
      rate: 1.0,
      onDone: () => processQueue(),
      onError: () => processQueue(),
      onStopped: () => {
        speechQueue.current = [];
        speechQueue.speaking = false;
      },
    });
  };

  const stopSpeech = () => {
    Speech.stop();
    speechQueue.current = [];
    speechQueue.speaking = false;
  };

  // Plan hole using local rule-based engine (no LLM required)
  const handlePlanHole = async () => {
    try {
      console.log('[PlanHole] 1. Function started');
      if (showAISuggestions) {
        // Hide the plan, keep cached data
        setShowAISuggestions(false);
        stopSpeech();
        // Cancel animation if running
        clearAnimationState();
        return;
      }

      // If we already have a cached plan for this hole, just show it again
      if (aiSuggestedShots && aiSuggestedShots.length > 0 && aiPlanData) {
        setShowAISuggestions(true);
        return;
      }

      // Show plan container immediately
      console.log('[PlanHole] 2. Computing local plan');
      setShowAISuggestions(true);
      setIsPlanLoading(true);
      setAiSuggestedShots([]);
      setAiPlanData(null);
      setAiPlanMessage(null);
      stopSpeech();
      // Clear any previous drag edits for fresh plan
      setEditedShots(null);
      setShotColors([]);
      setDraggingIndex(null);
      setIsUserEdited(false);

      const context = {
        holeInfo,
        holeGPS,
        courseHole,
        playerLocation,
        userLocation,
        lieType,
      };

      // Compute plan locally using rule-based engine (instant, no API call)
      // Pass player insights for personalized club distances and dispersion
      console.log('[PlanHole] 3. Calling computeLocalHolePlan');
      const result = await computeLocalHolePlan(context, userClubDistances, weather, caddiePreferences, playerInsights);
      console.log('[PlanHole] 4. Local plan computed');

      if (result.error) {
        setIsPlanLoading(false);
        Alert.alert('Plan Hole Error', result.error);
        return;
      }

      // Set the plan data
      if (result.shotPlan && result.shotPlan.shots) {
        // Process shots - add defensive checks but keep effective distance from engine
        const processedShots = result.shotPlan.shots.map((shot) => ({
          ...shot,
          // Ensure all required fields have safe defaults
          shotNumber: shot.shotNumber || 1,
          club: shot.club || 'Club',
          distance: shot.distance || 0, // Raw GPS distance (matches marker on map)
          effectiveDistance: shot.effectiveDistance || shot.distance || 0, // "Plays like" distance
          adjustments: shot.adjustments || null, // Wind/temp breakdown
          target: shot.target || '',
          reasoning: shot.reasoning || '',
          landingZone: shot.landingZone || { latitude: 0, longitude: 0, description: '' },
          warnings: Array.isArray(shot.warnings) ? shot.warnings.filter(w => typeof w === 'string') : [],
          nextShotDistance: shot.nextShotDistance || 0,
          confidence: shot.confidence || 'medium',
        }));

        // DEBUG: Log all plan shots for comparison with tap marker
        console.log(`[PLAN-SUMMARY] ===== HOLE PLAN RESULT =====`);
        processedShots.forEach((shot) => {
          console.log(`[PLAN-SUMMARY] Shot ${shot.shotNumber}: ${shot.club}`);
          console.log(`[PLAN-SUMMARY]   distance (raw): ${shot.distance}`);
          console.log(`[PLAN-SUMMARY]   effectiveDistance (plays like): ${shot.effectiveDistance}`);
          console.log(`[PLAN-SUMMARY]   landingZone: ${shot.landingZone?.latitude}, ${shot.landingZone?.longitude}`);
          console.log(`[PLAN-SUMMARY]   adjustments: ${JSON.stringify(shot.adjustments)}`);
        });
        console.log(`[PLAN-SUMMARY] ===========================`);

        setAiSuggestedShots(processedShots);

        // Trigger animated path visualization (first time only for this hole)
        if (!hasAnimatedForHoleRef.current[viewingHole]) {
          hasAnimatedForHoleRef.current[viewingHole] = true;
          setTimeout(() => {
            animateShotPath(processedShots, holeGPS.teeBox, holeGPS.green);
          }, 100);
        }

        // Speak the plan summary
        if (result.message) {
          speakText(result.message);
        }

        // Speak each shot with "plays like" info if there's a meaningful adjustment
        processedShots.forEach((shot) => {
          const hasAdjustment = Math.abs((shot.effectiveDistance || 0) - (shot.distance || 0)) >= 3;
          const playsLikeText = hasAdjustment ? `, plays like ${shot.effectiveDistance}` : '';
          speakText(`Shot ${shot.shotNumber}: ${shot.club}, ${shot.distance} yards${playsLikeText}.`);
        });
      }

      // Set plan metadata
      setAiPlanData({
        overallStrategy: result.shotPlan?.overallStrategy,
        keyConsiderations: result.shotPlan?.keyConsiderations,
        mindset: result.shotPlan?.mindset,
        targetScore: result.shotPlan?.targetScore,
        riskAssessment: result.shotPlan?.riskAssessment,
        rawTargetScore: result.shotPlan?.rawTargetScore,
      });

      // Set the commentary message
      setAiPlanMessage(result.message);

      setIsPlanLoading(false);
      console.log('[PlanHole] 5. Plan displayed successfully');

    } catch (error) {
      console.error('[PlanHole] ERROR:', error);
      setIsPlanLoading(false);
      Alert.alert('Plan Hole Error', error?.message || 'An unexpected error occurred');
    }
  };

  // Helper to clear all animation state
  const clearAnimationState = useCallback(() => {
    animCancelledRef.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsAnimatingPath(false);
    setAnimatingSegment(-1);
    setAnimRevealedPoints([]);
    setAnimTrailColors([]);
    setAnimBallPosition(null);
    setAnimCompletedSegments([]);
  }, []);

  /**
   * Orchestrate the full shot path animation sequence.
   * Called once per hole when the plan is computed for the first time.
   */
  const animateShotPath = useCallback(async (shots, teeBox, greenPos) => {
    if (!shots || shots.length === 0 || !teeBox) return;

    animCancelledRef.current = false;
    setIsAnimatingPath(true);
    setAnimCompletedSegments([]);

    // Step 1: Reset camera to show hole (same logic as hole navigation)
    if (mapRef.current && greenPos) {
      const heading = calculateBearing(teeBox, greenPos);
      const centerLat = (teeBox.latitude + greenPos.latitude) / 2;
      const centerLng = (teeBox.longitude + greenPos.longitude) / 2;

      mapRef.current.animateCamera({
        center: { latitude: centerLat, longitude: centerLng },
        pitch: 0,
        heading,
        altitude: 500,
        zoom: 17.2,
      }, { duration: 1000 });
      // Wait for camera animation to settle
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    if (animCancelledRef.current) return;

    // Step 2: Start ball glow pulse loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ballGlowAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(ballGlowAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: false,
        }),
      ])
    );
    pulseLoop.start();

    // Step 3: Animate each shot segment sequentially
    const shotColor = '#34d399';
    const POINTS_PER_ARC = 50;

    for (let i = 0; i < shots.length; i++) {
      if (animCancelledRef.current) break;

      const shot = shots[i];
      const startCoord = i === 0 ? teeBox : shots[i - 1].landingZone;
      const endCoord = shot.landingZone;

      if (!startCoord?.latitude || !endCoord?.latitude) continue;

      const arcHeight = calculateArcHeight(shot.distance || 150, shot.club);
      const arcPoints = generateBezierArc(startCoord, endCoord, POINTS_PER_ARC, arcHeight, 'left');

      setAnimatingSegment(i);
      setAnimBallPosition(startCoord);

      // Animate the progressive reveal with requestAnimationFrame
      await new Promise((resolve) => {
        const DURATION_MS = 1800;
        const startTime = performance.now();

        const animate = (currentTime) => {
          if (animCancelledRef.current) {
            resolve();
            return;
          }

          const elapsed = currentTime - startTime;
          const linearProgress = Math.min(elapsed / DURATION_MS, 1);
          const easedProgress = easeOutCubic(linearProgress);
          const revealCount = Math.max(2, Math.round(easedProgress * arcPoints.length));
          const revealedCoords = arcPoints.slice(0, revealCount);
          const trailColors = generateTrailColors(arcPoints.length, revealCount, shotColor, 18);

          setAnimRevealedPoints(revealedCoords);
          setAnimTrailColors(trailColors);
          setAnimBallPosition(revealedCoords[revealedCoords.length - 1]);

          if (linearProgress < 1) {
            animationFrameRef.current = requestAnimationFrame(animate);
          } else {
            resolve();
          }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
      });

      if (animCancelledRef.current) break;

      // Store completed segment as faded trail
      setAnimCompletedSegments(prev => [
        ...prev,
        { coordinates: arcPoints, color: 'rgba(52, 211, 153, 0.3)' },
      ]);

      // Clear current segment
      setAnimRevealedPoints([]);
      setAnimTrailColors([]);

      // Pause between shots (except after last)
      if (i < shots.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }

    // Step 4: Animation complete - clean up and show static markers
    pulseLoop.stop();
    ballGlowAnim.setValue(0);
    setIsAnimatingPath(false);
    setAnimatingSegment(-1);
    setAnimRevealedPoints([]);
    setAnimTrailColors([]);
    setAnimBallPosition(null);
    setAnimCompletedSegments([]);
    animationFrameRef.current = null;
    // Force a second render cycle so react-native-maps picks up the new markers
    setTimeout(() => setMapRenderKick(k => k + 1), 50);
  }, [ballGlowAnim]);

  // Calculate distance for a specific shot
  const getShotDistance = (shotIndex) => {
    if (!courseHole.aiSuggestedShots || !holeGPS) return 0;
    const shot = courseHole.aiSuggestedShots[shotIndex];
    if (!shot) return 0;

    // Distance is from previous shot (or tee for first shot) to current shot
    if (shotIndex === 0) {
      return calculateDistance(holeGPS.teeBox, shot);
    } else {
      const prevShot = courseHole.aiSuggestedShots[shotIndex - 1];
      return calculateDistance(prevShot, shot);
    }
  };

  // ============================================================================
  // SHOT LOGGING
  // ============================================================================

  // Open the pre-shot panel
  const handleOpenPreShot = useCallback(async () => {
    const nextNum = await getNextShotNumber(viewingHole);
    setCurrentShotNumber(nextNum);
    setShotPhase('preshot');
  }, [viewingHole]);

  // Player selected club/lie/feel and tapped "Start Tracking"
  const handleStartTracking = useCallback((data) => {
    setPreShotData(data);
    // Capture current GPS as the "from" position
    const fromPos = gpsPosition || userLocation || holeGPS?.teeBox || null;
    setTrackingFromPosition(fromPos);
    setTrackingDistance(0);
    setShotPhase('tracking');
  }, [gpsPosition, userLocation, holeGPS]);

  // Player tapped "Stop Tracking" — capture landing and open result panel
  const handleStopTracking = useCallback(async () => {
    const landingPos = gpsPosition || userLocation || null;

    // If shot > 1, update previous shot's landing with current position
    if (currentShotNumber > 1 && landingPos) {
      const dist = trackingFromPosition
        ? calculateDistance(trackingFromPosition, landingPos)
        : null;
      await updateShotLanding(
        viewingHole,
        currentShotNumber - 1,
        landingPos,
        dist,
        null, // distanceToTarget computed later
        null  // distanceOffline computed later
      );
    }

    setShotPhase('result');
  }, [gpsPosition, userLocation, currentShotNumber, trackingFromPosition, viewingHole]);

  // Player selected a result and tapped "Save Shot"
  const handleSaveResult = useCallback(async (resultData) => {
    const fromPos = trackingFromPosition;
    const toPos = gpsPosition || userLocation || null;
    const distActual = fromPos && toPos ? calculateDistance(fromPos, toPos) : null;

    const shotData = {
      holeNumber: viewingHole,
      shotNumber: currentShotNumber,
      from: fromPos ? {
        latitude: fromPos.latitude,
        longitude: fromPos.longitude,
        elevation: fromPos.elevation || fromPos.altitude || null,
      } : null,
      to: toPos ? {
        latitude: toPos.latitude,
        longitude: toPos.longitude,
        elevation: toPos.elevation || toPos.altitude || null,
      } : null,
      target: getCurrentShotTarget() ? {
        latitude: getCurrentShotTarget().latitude,
        longitude: getCurrentShotTarget().longitude,
      } : null,
      club: preShotData?.club || null,
      lieType: preShotData?.lieType || 'fairway',
      result: resultData.result,
      shotFeel: preShotData?.shotFeel || null,
      feltGood: preShotData?.feltGood ?? null,
      distanceActual: distActual,
      distancePlanned: displayShots?.[currentShotNumber - 1]?.distance || null,
      distanceToTarget: null,
      distanceOffline: null,
      windSpeed: weather?.wind_mph || null,
      windDirection: weather?.wind_direction || null,
      temperatureF: weather?.temp_f || null,
      effectiveDistance: displayShots?.[currentShotNumber - 1]?.effectiveDistance || null,
    };

    await saveShotToCache(shotData);

    // Derive lie for next shot from result
    const derivedLie = deriveLieFromResult(resultData.result);
    setNextLieType(derivedLie);

    // Update UI state
    setHoleShotsLogged(prev => prev + 1);
    setCurrentShotNumber(currentShotNumber + 1);
    setTrackingFromPosition(null);
    setTrackingDistance(0);
    setPreShotData(null);
    setShotPhase('idle');

    console.log(`[ShotLog] Logged shot ${currentShotNumber} on hole ${viewingHole}: ${preShotData?.club} → ${resultData.result}`);
  }, [viewingHole, currentShotNumber, trackingFromPosition, gpsPosition, userLocation, preShotData, weather, displayShots]);

  // Cancel from either preshot or result panel
  const handleShotEntryCancel = useCallback(() => {
    if (shotPhase === 'result') {
      // Go back to tracking instead of fully canceling
      setShotPhase('tracking');
    } else {
      setShotPhase('idle');
      setPreShotData(null);
    }
  }, [shotPhase]);

  // Live distance tracking during walking phase
  useEffect(() => {
    if (shotPhase !== 'tracking' || !trackingFromPosition || !gpsPosition) return;
    const dist = calculateDistance(trackingFromPosition, gpsPosition);
    setTrackingDistance(dist);
  }, [shotPhase, gpsPosition, trackingFromPosition]);

  // Get the recommended club for the current shot context
  const getRecommendedClubForShot = useCallback(() => {
    if (!displayShots || displayShots.length === 0) return null;
    // Map shot number to the AI-suggested shot (shot numbers are 1-based)
    const aiShot = displayShots[currentShotNumber - 1];
    if (!aiShot) return null;
    // Convert display name back to club id (e.g., "7 Iron" → "7_iron")
    const clubName = aiShot.club || '';
    const normalized = clubName.toLowerCase()
      .replace(/\s+/g, '_')
      .replace('pitching_wedge', 'pw')
      .replace('gap_wedge', 'gw')
      .replace('sand_wedge', 'sw')
      .replace('lob_wedge', 'lw')
      .replace(/°_wedge$/, '');
    // Try to match with a wedge degree pattern
    const degreeMatch = clubName.match(/^(\d+)°/);
    if (degreeMatch) return `w_${degreeMatch[1]}`;
    return normalized;
  }, [displayShots, currentShotNumber]);

  // Get the target position for the current AI-recommended shot
  const getCurrentShotTarget = useCallback(() => {
    if (!displayShots || displayShots.length === 0) return null;
    const aiShot = displayShots[currentShotNumber - 1];
    if (!aiShot?.landingZone) return null;
    return {
      latitude: aiShot.landingZone.latitude,
      longitude: aiShot.landingZone.longitude,
    };
  }, [displayShots, currentShotNumber]);

  const handleScoreSelect = (selectedScore) => {
    setScore(selectedScore);
  };

  const handleNextHole = () => {
    if (score !== null) {
      setHoleScores(prev => ({ ...prev, [currentHole]: score }));
    }

    const holeData = {
      score,
      putts,
      fairway_hit: holeInfo.par <= 3 ? 'na' : fairwayHit,
      gir: girHit,
      par: holeInfo.par,
      yardage: holeInfo.yardage,
      handicap_index: holeInfo.handicap,
      penalties,
    };

    if (currentHole < 18) {
      onNextHole(holeData);
    } else {
      onEndRound(holeData);
    }

    // Reset per-hole stats
    setScore(null);
    setPutts(null);
    setFairwayHit(null);
    setGirHit(null);
    setPenalties(0);
  };

  // Compute round score relative to par
  const getRoundScore = () => {
    const allScores = { ...holeScores };
    if (score !== null) {
      allScores[currentHole] = score;
    }
    let totalOverPar = 0;
    Object.entries(allScores).forEach(([holeNum, holeScore]) => {
      const hole = holesData[parseInt(holeNum)];
      if (hole) {
        totalOverPar += holeScore - hole.par;
      }
    });
    return totalOverPar;
  };

  const roundScore = getRoundScore();
  const roundScoreDisplay = roundScore === 0 ? 'E' : (roundScore > 0 ? `+${roundScore}` : `${roundScore}`);

  // Projected round score if target is hit
  const projectedRoundScore = useMemo(() => {
    if (!aiPlanData?.targetScore) return null;
    const targetOffset = aiPlanData.targetScore === 'birdie' ? -1
      : aiPlanData.targetScore === 'bogey' ? 1 : 0;
    const projected = roundScore + targetOffset;
    return projected === 0 ? 'E' : (projected > 0 ? `+${projected}` : `${projected}`);
  }, [aiPlanData?.targetScore, roundScore]);

  // Caddie reminders (rule-based, no LLM)
  const caddieReminderList = useMemo(() => {
    if (!aiPlanData || !aiSuggestedShots || aiSuggestedShots.length === 0) return [];
    const prevHoleData = viewingHole > 1 && holesData[viewingHole - 1] ? holesData[viewingHole - 1] : null;
    const prevScore = viewingHole > 1 && holeScores[viewingHole - 1] != null && prevHoleData
      ? holeScores[viewingHole - 1] - prevHoleData.par : null;
    return generateCaddieReminders({
      shots: aiSuggestedShots,
      riskAssessment: aiPlanData.riskAssessment,
      weather: weather?.current ? {
        windSpeed: weather.current.wind?.speed || 0,
        windDirection: weather.current.wind?.direction || 'N',
        temperature: weather.current.temp || 72,
      } : null,
      holeData: { par: holeInfo.par, yardage: holeInfo.yardage, handicap: holeInfo.handicap },
      strategy: aiPlanData.mindset,
      playerInsights,
      caddiePreferences,
      previousHoleScore: prevScore,
    });
  }, [aiPlanData, aiSuggestedShots, weather, holeInfo, viewingHole, holesData, holeScores, playerInsights, caddiePreferences]);

  const getScoreButtons = () => {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  };

  const getScoreLabel = (scoreValue) => {
    const diff = scoreValue - holeInfo.par;
    if (diff <= -3) return 'Albatross';
    if (diff === -2) return 'Eagle';
    if (diff === -1) return 'Birdie';
    if (diff === 0) return 'Par';
    if (diff === 1) return 'Bogey';
    if (diff === 2) return 'Double';
    if (diff === 3) return 'Triple';
    if (diff >= 4) return `+${diff}`;
    return '';
  };

  const getScoreDiff = (scoreValue) => {
    const diff = scoreValue - holeInfo.par;
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  // Calculate the heading so tee is at bottom and green at top
  const mapHeading = holeGPS ? calculateBearing(holeGPS.teeBox, holeGPS.green) : 0;

  // Sync currentMapHeading when switching holes
  useEffect(() => {
    setCurrentMapHeading(mapHeading);
  }, [mapHeading]);

  // Handle map rotation by user
  const handleRegionChange = (region, details) => {
    // Get the camera heading from the map when user rotates
    if (mapRef.current) {
      mapRef.current.getCamera().then((camera) => {
        if (camera?.heading !== undefined) {
          setCurrentMapHeading(camera.heading);
        }
      });
    }
  };

  // Calculate center point between tee and green
  const centerLatitude = holeGPS ? (holeGPS.teeBox.latitude + holeGPS.green.latitude) / 2 : holeGPS?.teeBox.latitude || 0;
  const centerLongitude = holeGPS ? (holeGPS.teeBox.longitude + holeGPS.green.longitude) / 2 : holeGPS?.teeBox.longitude || 0;

  const distanceToGreen = holeGPS ? calculateDistance(holeGPS.teeBox, holeGPS.green) : holeInfo.yardage;

  // Calculate distance from player's GPS location to green
  const distanceFromPlayerToGreen = holeGPS ? calculateDistance(playerLocation, holeGPS.green) : null;

  // Calculate distances when user places a marker
  const distanceFromTee = userLocation && holeGPS ? calculateDistance(holeGPS.teeBox, userLocation) : null;
  const distanceToGreenFromUser = userLocation && holeGPS ? calculateDistance(userLocation, holeGPS.green) : null;

  // Loading state while fetching holes from database
  if (isLoadingHoles) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        <Text style={{ color: '#fff', marginTop: theme.spacing.md }}>Loading hole data...</Text>
      </View>
    );
  }

  // No data for this hole yet
  if (!courseHole) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: theme.spacing.xl }]}>
        <StatusBar style="light" />
        <Text style={{ color: '#fff', fontSize: 48, marginBottom: theme.spacing.md }}>{'⛳'}</Text>
        <Text style={{ color: '#fff', fontSize: 18, fontFamily: theme.fonts.bold, marginBottom: theme.spacing.sm }}>
          Hole {viewingHole} data not available
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: theme.spacing.xl }}>
          GPS data for this hole hasn't been added yet
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {viewingHole > 1 && (
            <Button title="Previous Hole" onPress={() => handleHoleChange(viewingHole - 1)} variant="secondary" />
          )}
          {viewingHole < 18 && (
            <Button title="Next Hole" onPress={() => handleHoleChange(viewingHole + 1)} variant="secondary" />
          )}
        </View>
        <TouchableOpacity onPress={onEndRound} style={{ marginTop: theme.spacing.lg }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>End Round</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Full Screen Satellite Map */}
      <MapView
        ref={mapRef}
        style={styles.fullScreenMap}
        mapType="satellite"
        provider={PROVIDER_GOOGLE}
        camera={{
          center: {
            latitude: centerLatitude,
            longitude: centerLongitude,
          },
          pitch: 0,
          heading: mapHeading,
          altitude: 500,
          zoom: 17.2,
        }}
        mapPadding={{
          top: 0,
          right: showAISuggestions ? Math.round(Dimensions.get('window').width * 0.55) : 0,
          bottom: 0,
          left: 0,
        }}
        pitchEnabled={false}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        onRegionChange={handleRegionChange}
        onPress={handleMapPress}
        onTouchStart={() => Keyboard.dismiss()}
      >
        {/* Course polygons (fairways, greens, bunkers, water, etc.) */}
        {showPolygons && courseHole.polygons && courseHole.polygons
          .filter(poly => {
            // Hide hazard-type polygons when hazard layer is toggled off
            if (!showHazardDistances && (poly.type === 'bunker' || poly.type === 'water' || poly.type === 'hazard')) {
              return false;
            }
            return true;
          })
          .map((poly, index) => {
          let fillColor, strokeColor;

          switch (poly.type) {
            case 'fairway':
              fillColor = 'rgba(34, 197, 94, 0.3)';
              strokeColor = '#22c55e';
              break;
            case 'green':
              fillColor = 'rgba(21, 128, 61, 0.4)';
              strokeColor = '#16a34a';
              break;
            case 'bunker':
              fillColor = 'rgba(244, 208, 63, 0.5)';
              strokeColor = '#f4d03f';
              break;
            case 'water':
              fillColor = 'rgba(59, 130, 246, 0.4)';
              strokeColor = '#3b82f6';
              break;
            case 'out_of_bounds':
              fillColor = 'rgba(239, 68, 68, 0.4)';
              strokeColor = '#dc2626';
              break;
            case 'trees':
              fillColor = 'rgba(22, 101, 52, 0.4)';
              strokeColor = '#166534';
              break;
            case 'hazard':
              fillColor = 'rgba(245, 158, 11, 0.4)';
              strokeColor = '#f59e0b';
              break;
            default:
              fillColor = 'rgba(239, 68, 68, 0.4)';
              strokeColor = '#dc2626';
          }

          return (
            <Polygon
              key={`poly-${index}`}
              coordinates={poly.coordinates}
              fillColor={fillColor}
              strokeColor={strokeColor}
              strokeWidth={2}
            />
          );
        })}

        {/* Hazard Distance Labels (bunkers and water) - Front and Back */}
        {showHazardDistances && courseHole.polygons && holeGPS?.teeBox && courseHole.polygons
          .filter(poly => poly.type === 'bunker' || poly.type === 'water')
          .map((poly) => {
            const hazardInfo = calculateHazardDistances(poly, holeGPS.teeBox);
            if (!hazardInfo) return null;

            const lineColor = poly.type === 'bunker' ? '#f4d03f' : '#3b82f6';

            // Use a stable key based on polygon coordinates to help React identify markers correctly
            const polyKey = `${poly.label}-${poly.coordinates?.[0]?.latitude?.toFixed(4)}-${poly.coordinates?.[0]?.longitude?.toFixed(4)}`;

            return (
              <React.Fragment key={`hazard-dist-${polyKey}`}>
                {/* Front distance - at closest point to tee */}
                <Marker
                  coordinate={hazardInfo.frontPoint}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={1}
                >
                  <View style={styles.hazardDistanceRow}>
                    <View style={[styles.hazardDistanceLine, { backgroundColor: lineColor }]} />
                    <Text style={styles.hazardDistanceText}>
                      {hazardInfo.frontDistance}
                    </Text>
                    <View style={[styles.hazardDistanceLine, { backgroundColor: lineColor }]} />
                  </View>
                </Marker>

                {/* Back distance - at furthest point from tee */}
                <Marker
                  coordinate={hazardInfo.backPoint}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={1}
                >
                  <View style={styles.hazardDistanceRow}>
                    <View style={[styles.hazardDistanceLine, { backgroundColor: lineColor }]} />
                    <Text style={styles.hazardDistanceText}>
                      {hazardInfo.backDistance}
                    </Text>
                    <View style={[styles.hazardDistanceLine, { backgroundColor: lineColor }]} />
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}

        {/* Tee Box Marker */}
        <Marker
          coordinate={holeGPS.teeBox}
          title="Tee Box"
          description={`${distanceFromPlayerToGreen ?? holeInfo.yardage} yards to green`}
        >
          <View style={styles.teeMarker}>
            <View style={styles.teeIconTop} />
            <View style={styles.teeIconBottom} />
          </View>
        </Marker>

        {/* Green Marker */}
        <Marker
          coordinate={holeGPS.green}
          title="Green"
        >
          <View style={styles.greenMarker}>
            <View style={styles.flagPole} />
            <View style={styles.flagTriangle} />
          </View>
        </Marker>

        {/* Player's GPS Location (live or static fallback) */}
        <Marker
          coordinate={isTrackingActive && gpsPosition ? gpsPosition : playerLocation}
          title="My Location"
          description={isTrackingActive ? "Live GPS position" : "Tee box position"}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.playerLocationMarker}>
            {isTrackingActive && gpsPosition && <View style={styles.playerLocationPulse} />}
            <View style={styles.playerLocationDot} />
          </View>
        </Marker>

        {/* User's Location Marker - Tap anywhere on map to reposition */}
        {userLocation && (
          <>
            <Marker
              coordinate={userLocation}
              title="Drag to reposition"
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.userMarker} {...markerPanResponder.panHandlers}>
                <View style={styles.userMarkerOuterCircle}>
                  <View style={styles.userMarkerInnerCircle}>
                    <View style={styles.userMarkerDot} />
                  </View>
                </View>
              </View>
            </Marker>

            {/* Line from tee to user location */}
            <Polyline
              coordinates={[holeGPS.teeBox, userLocation]}
              strokeColor="#10b981"
              strokeWidth={2}
              lineDashPattern={[3, 3]}
            />

            {/* Line from user location to green */}
            <Polyline
              coordinates={[userLocation, holeGPS.green]}
              strokeColor="#3b82f6"
              strokeWidth={2}
              lineDashPattern={[3, 3]}
            />

            {/* Distance label on tee-to-spot line */}
            {teeToSpotContext && getMidpoint(holeGPS.teeBox, userLocation) && (
              <Marker
                coordinate={getMidpoint(holeGPS.teeBox, userLocation)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.lineDistanceLabel}>
                  <Text style={styles.lineDistanceActual}>
                    {Math.round(teeToSpotContext.baseDistance)} yds
                  </Text>
                  <Text style={styles.lineDistanceEffective}>
                    Playing {Math.round(teeToSpotContext.effectiveDistance)}
                  </Text>
                </View>
              </Marker>
            )}

            {/* Distance label on spot-to-green line */}
            {spotToGreenContext && getMidpoint(userLocation, holeGPS.green) && (
              <Marker
                coordinate={getMidpoint(userLocation, holeGPS.green)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.lineDistanceLabel}>
                  <Text style={styles.lineDistanceActual}>
                    {Math.round(spotToGreenContext.baseDistance)} yds
                  </Text>
                  <Text style={styles.lineDistanceEffective}>
                    Playing {Math.round(spotToGreenContext.effectiveDistance)}
                  </Text>
                </View>
              </Marker>
            )}
          </>
        )}

        {/* Animated shot path: completed segment trails */}
        {isAnimatingPath && animCompletedSegments.map((segment, idx) => (
          <Polyline
            key={`anim-complete-${idx}`}
            coordinates={segment.coordinates}
            strokeColor={segment.color}
            strokeWidth={2}
            lineCap="round"
            zIndex={240}
          />
        ))}

        {/* Animated shot path: active trail polyline */}
        {isAnimatingPath && animRevealedPoints.length >= 2 && (
          <Polyline
            coordinates={animRevealedPoints}
            strokeColors={animTrailColors}
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
            zIndex={250}
          />
        )}

        {/* Animated shot path: ball dot */}
        {isAnimatingPath && animBallPosition && (
          <Marker
            coordinate={animBallPosition}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={300}
            tracksViewChanges={true}
          >
            <Animated.View style={{
              width: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Animated.View style={{
                position: 'absolute',
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: 'rgba(52, 211, 153, 0.3)',
                opacity: ballGlowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.6],
                }),
                transform: [{
                  scale: ballGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.4],
                  }),
                }],
              }} />
              <View style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#ffffff',
                borderWidth: 1.5,
                borderColor: '#34d399',
                shadowColor: '#34d399',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 4,
                elevation: 8,
              }} />
            </Animated.View>
          </Marker>
        )}

        {/* AI Suggested Shot Markers - Draggable with real-time updates */}
        {showAISuggestions && !isStreaming && !isAnimatingPath && displayShots && displayShots
          .filter(shot => shot?.landingZone?.latitude && shot?.landingZone?.longitude)
          .map((shot, index, filteredShots) => (
          <React.Fragment key={`shot-${shot.shotNumber}`}>
            <DraggableShotMarker
              shot={shot}
              shotIndex={index}
              isSelected={selectedShotInfo === index}
              color={shotColors[index] || 'green'}
              isDragging={draggingIndex === index}
              previousPosition={index === 0 ? holeGPS.teeBox : filteredShots[index - 1]?.landingZone}
              greenPosition={holeGPS.green}
              preComputedClubReaches={preComputedClubReaches}
              weather={weatherForDrag}
              hazardCentroids={hazardCentroids}
              polygons={holesData?.[viewingHole]?.polygons || []}
              isApproach={index === filteredShots.length - 1}
              onDragStart={handleShotDragStart}
              onDragMove={handleShotDragMove}
              onDragEnd={handleShotDragEnd}
              onPress={(idx) => {
                markerTappedRef.current = true;
                setSelectedShotInfo(selectedShotInfo === idx ? null : idx);
              }}
            />

            {/* Line from previous shot to this shot */}
            {index === 0 ? (
              <Polyline
                coordinates={[holeGPS.teeBox, shot.landingZone]}
                strokeColor={getPolylineColor(shotColors[index])}
                strokeWidth={2.5}
                lineDashPattern={[6, 4]}
              />
            ) : filteredShots[index - 1]?.landingZone ? (
              <Polyline
                coordinates={[filteredShots[index - 1].landingZone, shot.landingZone]}
                strokeColor={getPolylineColor(shotColors[index])}
                strokeWidth={2.5}
                lineDashPattern={[6, 4]}
              />
            ) : null}
          </React.Fragment>
        ))}

        {/* Tee-to-green line removed per user request */}
      </MapView>

      {/* Floating Layers Button - Bottom Right, above wind indicator */}
      {(() => {
        const layerOptions = [
          { key: 'hazards', active: showHazardDistances, onPress: () => setShowHazardDistances(prev => !prev),
            renderIcon: (isActive) => (
              <View style={styles.hazardMiniIcon}>
                <View style={[styles.hazardMiniLine, isActive && styles.hazardMiniLineActive]} />
                <Text style={[styles.hazardMiniText, isActive && styles.hazardMiniTextActive]}>yds</Text>
                <View style={[styles.hazardMiniLine, isActive && styles.hazardMiniLineActive]} />
              </View>
            ),
          },
          { key: 'overlays', active: showPolygons, onPress: () => setShowPolygons(prev => !prev),
            renderIcon: (isActive) => (
              <View style={[styles.overlayMiniIcon, isActive && styles.overlayMiniIconActive]}>
                <View style={[styles.overlayMiniInner, isActive && styles.overlayMiniInnerActive]} />
              </View>
            ),
          },
          { key: 'gps', active: isTrackingActive, onPress: () => setIsTrackingActive(prev => !prev),
            renderIcon: () => <Text style={styles.fanToolIcon}>📍</Text>,
          },
        ];
        const RADIUS = 75;
        const totalItems = layerOptions.length;

        return (
          <View style={styles.floatingLayersContainer} pointerEvents="box-none">
            {/* Animated fan-out layer option buttons */}
            {layerOptions.map((option, index) => {
              const angle = totalItems > 1
                ? (index / (totalItems - 1)) * (Math.PI / 2)
                : 0;
              const targetX = RADIUS * Math.sin(angle);
              const targetY = -RADIUS * Math.cos(angle);
              const anim = layerAnims[index];

              return (
                <Animated.View
                  key={option.key}
                  pointerEvents={toolsMenuOpen ? 'auto' : 'none'}
                  style={[
                    styles.fanItemWrapper,
                    {
                      opacity: anim,
                      transform: [
                        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, targetX] }) },
                        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, targetY] }) },
                        { scale: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.8, 1] }) },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.fanToolButton,
                      option.active && styles.fanToolButtonActive,
                    ]}
                    onPress={option.onPress}
                    activeOpacity={0.7}
                  >
                    {option.renderIcon(option.active)}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}

            {/* Main Layers Button - on top */}
            <TouchableOpacity
              style={[styles.floatingLayersButton, toolsMenuOpen && styles.floatingLayersButtonActive]}
              onPress={() => {
                const opening = !toolsMenuOpen;
                setToolsMenuOpen(opening);

                const visibleAnims = layerAnims.slice(0, layerOptions.length);
                const animations = visibleAnims.map(anim =>
                  Animated.spring(anim, {
                    toValue: opening ? 1 : 0,
                    useNativeDriver: true,
                    friction: 6,
                    tension: 120,
                  })
                );

                // Reset any unused animation slots
                layerAnims.slice(layerOptions.length).forEach(anim => anim.setValue(0));

                if (opening) {
                  Animated.stagger(60, animations).start();
                } else {
                  Animated.stagger(40, [...animations].reverse()).start();
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.floatingLayersIcon, toolsMenuOpen && styles.floatingLayersIconActive]}>{toolsMenuOpen ? '✕' : '◎'}</Text>
              <Text style={[styles.floatingLayersText, toolsMenuOpen && styles.floatingLayersTextActive]}>Layers</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Wind Indicator Overlay - rotates with map heading */}
      {weather?.current?.wind && (
        <View style={styles.windIndicator}>
          <View style={styles.windArrowContainer}>
            <Text
              style={[
                styles.windArrow,
                { transform: [{ rotate: `${getWindRotation(weather.current.wind.direction) - currentMapHeading}deg` }] },
              ]}
            >
              ↑
            </Text>
          </View>
          <Text style={styles.windSpeed}>{weather.current.wind.speed}</Text>
          <Text style={styles.windUnit}>mph</Text>
        </View>
      )}

      {/* Round Settings Button */}
      <TouchableOpacity
        style={styles.roundSettingsButton}
        onPress={() => setShowRoundSettings(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.roundSettingsIcon}>⚙</Text>
      </TouchableOpacity>

      {/* Top Header Overlay */}
      <SafeAreaView style={styles.topOverlay}>
        <View style={styles.headerOverlay}>
          <TouchableOpacity onPress={onPauseRound} style={styles.endRoundButton}>
            <Text style={styles.endRoundText}>✕</Text>
          </TouchableOpacity>

          {/* PGA-Style Scorecard */}
          <View style={styles.pgaScorecard}>
            {/* Top row: Hole number, shot tracker, round score */}
            <View style={styles.pgaTopRow}>
              {/* Left: Hole number with nav arrows */}
              <View style={styles.pgaHoleNumberRow}>
                <TouchableOpacity
                  onPress={() => handleHoleChange(viewingHole - 1)}
                  disabled={viewingHole === 1}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.pgaNavArrow, viewingHole === 1 && { opacity: 0.3 }]}>◀</Text>
                </TouchableOpacity>
                <Text style={styles.pgaHoleNumber}>{holeInfo.holeNumber}</Text>
                <TouchableOpacity
                  onPress={() => handleHoleChange(viewingHole + 1)}
                  disabled={viewingHole === 18}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.pgaNavArrow, viewingHole === 18 && { opacity: 0.3 }]}>▶</Text>
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.pgaDivider} />

              {/* Center: Par number tracker - tap to open score entry */}
              <TouchableOpacity
                style={styles.pgaShotTracker}
                onPress={() => setShowScoreModal(true)}
                activeOpacity={0.7}
              >
                {(() => {
                  const recordedScore = holeScores[viewingHole];
                  const displayCount = Math.max(recordedScore || 0, holeInfo.par);
                  const scoreToPar = recordedScore ? recordedScore - holeInfo.par : null;

                  return Array.from({ length: displayCount }, (_, i) => i + 1).map((num) => {
                    const isScoreNumber = recordedScore && num === recordedScore;
                    const isCurrentShot = !recordedScore && num === 1;

                    // Determine score indicator type for the final number
                    let scoreIndicator = null;
                    if (isScoreNumber) {
                      if (scoreToPar <= -2) scoreIndicator = 'eagle';
                      else if (scoreToPar === -1) scoreIndicator = 'birdie';
                      else if (scoreToPar === 0) scoreIndicator = 'par';
                      else if (scoreToPar === 1) scoreIndicator = 'bogey';
                      else scoreIndicator = 'doubleBogey';
                    }

                    return (
                      <View key={num} style={styles.pgaShotItem}>
                        {/* Eagle: double circle */}
                        {scoreIndicator === 'eagle' && (
                          <View style={styles.pgaEagleOuter}>
                            <View style={styles.pgaEagleInner}>
                              <Text style={[styles.pgaShotNumber, styles.pgaShotNumberActive]}>
                                {num}
                              </Text>
                            </View>
                          </View>
                        )}
                        {/* Birdie: single circle */}
                        {scoreIndicator === 'birdie' && (
                          <View style={styles.pgaBirdieCircle}>
                            <Text style={[styles.pgaShotNumber, styles.pgaShotNumberActive]}>
                              {num}
                            </Text>
                          </View>
                        )}
                        {/* Bogey: single square */}
                        {scoreIndicator === 'bogey' && (
                          <View style={styles.pgaBogeySquare}>
                            <Text style={[styles.pgaShotNumber, styles.pgaShotNumberActive]}>
                              {num}
                            </Text>
                          </View>
                        )}
                        {/* Double bogey or worse: double square */}
                        {scoreIndicator === 'doubleBogey' && (
                          <View style={styles.pgaDoubleBogeyOuter}>
                            <View style={styles.pgaDoubleBogeyInner}>
                              <Text style={[styles.pgaShotNumber, styles.pgaShotNumberActive]}>
                                {num}
                              </Text>
                            </View>
                          </View>
                        )}
                        {/* Par or no score: just number with underline */}
                        {(scoreIndicator === 'par' || scoreIndicator === null) && (
                          <>
                            <Text style={[
                              styles.pgaShotNumber,
                              (isCurrentShot || isScoreNumber) && styles.pgaShotNumberActive,
                            ]}>
                              {num}
                            </Text>
                            {(isCurrentShot || isScoreNumber) && <View style={styles.pgaShotUnderline} />}
                          </>
                        )}
                      </View>
                    );
                  });
                })()}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.pgaDivider} />

              {/* Right: Round score - tap to open full scorecard */}
              <TouchableOpacity
                style={styles.pgaRoundScore}
                onPress={() => setShowFullScorecard(true)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.pgaRoundScoreText,
                  roundScore > 0 && styles.pgaScoreOver,
                  roundScore < 0 && styles.pgaScoreUnder,
                  roundScore === 0 && styles.pgaScoreEven,
                ]}>
                  {roundScoreDisplay}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bottom row: Par, Yardage, HCP spanning full width */}
            <View style={styles.pgaBottomRow}>
              <Text style={styles.pgaHoleDetails}>
                Par {holeInfo.par}    {holeInfo.yardage} yds    HCP {holeInfo.handicap}
              </Text>
            </View>
          </View>
        </View>

        {/* Distance Row - below the scorecard */}
        <View style={styles.toolsAndDistanceRow}>
          {/* Clear Pin Button - Left side, only when user has placed a target */}
          {userLocation ? (
            <TouchableOpacity
              style={styles.clearPinButton}
              onPress={() => setUserLocation(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.clearPinIcon}>✕</Text>
              <Text style={styles.clearPinText}>Clear Pin</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          {/* Distance Card - Always shows GPS position, segment distances are on polylines */}
          <View style={styles.distanceCard}>
            <View style={styles.gpsDistanceRow}>
              <Text style={styles.gpsLabel}>📍 Your Position</Text>
            </View>
            {/* Show effective distance with breakdown */}
            <EffectiveDistanceDisplay
              actualDistance={distanceFromPlayerToGreen}
              preCalculated={shotContext}
            />
            <Text style={styles.distanceLabel}>yards to green</Text>
            <View style={styles.dividerThin} />
          </View>
        </View>

        {/* Plan Hole section */}
        <View style={styles.distanceOverlay}>

          {/* Unified Hole Plan Card — shown when plan is active */}
          {showAISuggestions && (
            <View style={styles.holePlanCard}>
              {/* Header row: title + close icon */}
              <View style={styles.holePlanHeader}>
                <Text style={styles.holePlanTitle}>Hole {viewingHole} Plan</Text>
                <TouchableOpacity onPress={handlePlanHole} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="eye-off-outline" size={16} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              {/* Streaming state */}
              {isStreaming && (
                <View style={styles.holePlanStreamingRow}>
                  <ActivityIndicator size="small" color="#60a5fa" />
                  <Text style={styles.holePlanStreamingText}>Planning...</Text>
                </View>
              )}

              {/* Mindset + Target side-by-side */}
              {!isStreaming && (aiPlanData?.mindset || aiPlanData?.targetScore) && (
                <View style={styles.holePlanBadgeRow}>
                  {aiPlanData?.mindset && (
                    <View style={[
                      styles.holePlanBadge,
                      aiPlanData.mindset === 'aggressive' && { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.6)' },
                      aiPlanData.mindset === 'conservative' && { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: 'rgba(59, 130, 246, 0.6)' },
                      aiPlanData.mindset === 'smart-aggressive' && { backgroundColor: 'rgba(251, 191, 36, 0.2)', borderColor: 'rgba(251, 191, 36, 0.6)' },
                    ]}>
                      <Text style={[
                        styles.holePlanBadgeText,
                        aiPlanData.mindset === 'aggressive' && { color: '#fca5a5' },
                        aiPlanData.mindset === 'conservative' && { color: '#93c5fd' },
                        aiPlanData.mindset === 'smart-aggressive' && { color: '#fde68a' },
                      ]}>
                        {aiPlanData.mindset === 'aggressive' ? '🔥' : aiPlanData.mindset === 'conservative' ? '🛡️' : '🎯'}{' '}
                        {aiPlanData.mindset.charAt(0).toUpperCase() + aiPlanData.mindset.slice(1)}
                      </Text>
                    </View>
                  )}
                  {aiPlanData?.targetScore && (
                    <View style={[styles.holePlanBadge, { backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: 'rgba(34, 197, 94, 0.6)' }]}>
                      <Text style={[styles.holePlanBadgeText, { color: '#6ee7b7' }]}>
                        🏁 {aiPlanData.targetScore.charAt(0).toUpperCase() + aiPlanData.targetScore.slice(1)}
                      </Text>
                      {projectedRoundScore != null && (
                        <Text style={[
                          styles.holePlanProjectedScore,
                          projectedRoundScore.startsWith('-') && { color: '#6ee7b7' },
                          projectedRoundScore.startsWith('+') && { color: '#fca5a5' },
                        ]}>
                          Round: {projectedRoundScore}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Caddie reminders */}
              {!isStreaming && caddieReminderList.length > 0 && (
                <View style={styles.holePlanReminders}>
                  {caddieReminderList.map((reminder, idx) => (
                    <Text key={idx} style={styles.holePlanReminderText}>
                      • {reminder}
                    </Text>
                  ))}
                </View>
              )}

              {/* Drag hint + Reset row */}
              {!isStreaming && displayShots.length > 0 && (
                <View style={styles.holePlanFooterRow}>
                  <Text style={styles.holePlanHintText}>Drag markers to adjust</Text>
                  {isUserEdited && (
                    <TouchableOpacity onPress={handleResetPlan}>
                      <Text style={styles.holePlanResetText}>↺ Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Plan Hole button — shown when plan is NOT active */}
          {!showAISuggestions && (
            <View style={styles.planHoleContainer}>
              <TouchableOpacity
                style={[styles.planHoleButton, isPlanLoading && styles.planHoleButtonDisabled]}
                onPress={handlePlanHole}
                disabled={isPlanLoading}
              >
                <Text style={styles.planHoleButtonText}>
                  {isPlanLoading ? '⏳ Planning...' : '🎯 Plan Hole'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Shot Detection Status Indicator - hidden for now */}
          {false && (
            <View style={styles.shotDetectionIndicator}>
              <View style={[
                styles.shotDetectionDot,
                shotDetectorState === STATES.AT_TEE && { backgroundColor: '#3b82f6' },
                shotDetectorState === STATES.MOVING && { backgroundColor: '#f59e0b' },
                shotDetectorState === STATES.STATIONARY && { backgroundColor: '#ef4444' },
                shotDetectorState === STATES.ON_GREEN && { backgroundColor: '#10b981' },
              ]} />
              <Text style={styles.shotDetectionText}>
                {shotDetectorState === STATES.AT_TEE && 'At Tee'}
                {shotDetectorState === STATES.MOVING && 'Moving'}
                {shotDetectorState === STATES.STATIONARY && 'Stopped'}
                {shotDetectorState === STATES.ON_GREEN && 'On Green'}
                {shotDetectorState === STATES.IDLE && 'Waiting...'}
                {shotDetectorState === STATES.HOLE_COMPLETE && 'Complete'}
              </Text>
              {detectedShots.length > 0 && (
                <Text style={styles.shotDetectionCount}>
                  {detectedShots.length} shot{detectedShots.length !== 1 ? 's' : ''} detected
                </Text>
              )}
            </View>
          )}

        </View>
      </SafeAreaView>

      {/* Shot Detail Panel - slides up when a shot marker is tapped */}
      <ShotDetailPanel
        shot={displayShots[selectedShotInfo]}
        visible={showAISuggestions && !isStreaming && selectedShotInfo !== null && !!displayShots[selectedShotInfo]}
        onClose={() => setSelectedShotInfo(null)}
        playerInsights={playerInsights}
      />

      {/* Bottom Overlays */}
      <SafeAreaView style={styles.bottomOverlay}>
        {/* Log Shot Button — idle phase (bottom-right) */}
        {shotPhase === 'idle' && viewingHole === currentHole && (
          <TouchableOpacity
            style={styles.logShotButton}
            onPress={handleOpenPreShot}
            activeOpacity={0.8}
          >
            <Ionicons name="golf" size={18} color="#fff" />
            <Text style={styles.logShotButtonText}>Log Shot {currentShotNumber}</Text>
          </TouchableOpacity>
        )}

        {/* Stop Tracking Button — tracking phase (bottom-right, red/orange) */}
        {shotPhase === 'tracking' && viewingHole === currentHole && (
          <TouchableOpacity
            style={styles.trackingButton}
            onPress={handleStopTracking}
            activeOpacity={0.8}
          >
            <Ionicons name="stop-circle" size={18} color="#fff" />
            <Text style={styles.trackingButtonText}>
              Stop · {trackingDistance} yds
            </Text>
          </TouchableOpacity>
        )}

        {/* Location error banner */}
        {locationError && (
          <View style={styles.locationErrorBanner}>
            <Text style={styles.locationErrorText}>{locationError}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Shot Entry Panel — pre-shot mode */}
      <ShotEntryPanel
        visible={shotPhase === 'preshot'}
        mode="preshot"
        holeNumber={viewingHole}
        shotNumber={currentShotNumber}
        userClubs={userClubDistances}
        recommendedClub={getRecommendedClubForShot()}
        defaultLie={nextLieType}
        onStartTracking={handleStartTracking}
        onSaveResult={handleSaveResult}
        onCancel={handleShotEntryCancel}
      />

      {/* Shot Entry Panel — result mode */}
      <ShotEntryPanel
        visible={shotPhase === 'result'}
        mode="result"
        holeNumber={viewingHole}
        shotNumber={currentShotNumber}
        userClubs={userClubDistances}
        recommendedClub={getRecommendedClubForShot()}
        defaultLie={nextLieType}
        onStartTracking={handleStartTracking}
        onSaveResult={handleSaveResult}
        onCancel={handleShotEntryCancel}
      />

      {/* Score Entry Modal - Full Screen iOS Style */}
      <Modal
        visible={showScoreModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowScoreModal(false)}
      >
        <SafeAreaView style={styles.scoreModalContainer}>
          <StatusBar style="dark" />

          {/* iOS-style Header with pill indicator */}
          <View style={styles.scoreModalPill} />
          <View style={styles.scoreModalHeader}>
            <TouchableOpacity
              onPress={() => setShowScoreModal(false)}
              style={styles.scoreModalBackButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.scoreModalBackText}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.scoreModalHeaderCenter}>
              <Text style={styles.scoreModalHoleTitle}>Hole {viewingHole}</Text>
              <Text style={styles.scoreModalHoleInfo}>
                Par {holeInfo.par}  |  {holeInfo.yardage} yds  |  HCP {holeInfo.handicap}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (score !== null) {
                  setShowScoreModal(false);
                  handleNextHole();
                }
              }}
              style={styles.scoreModalSaveButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.scoreModalSaveText, score === null && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scoreModalBody}
            contentContainerStyle={styles.scoreModalBodyContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {/* Score Selection - Large Horizontal Scroll */}
            <View style={styles.scoreSection}>
              <Text style={styles.scoreSectionLabel}>SCORE</Text>
              {score !== null && (
                <View style={styles.scoreDisplayBadge}>
                  <Text style={[
                    styles.scoreDisplayBadgeText,
                    score - holeInfo.par < 0 && { color: '#16a34a' },
                    score - holeInfo.par === 0 && { color: '#3b82f6' },
                    score - holeInfo.par > 0 && { color: '#dc2626' },
                  ]}>
                    {getScoreDiff(score)} {getScoreLabel(score)}
                  </Text>
                </View>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scorePickerContainer}
              snapToInterval={72}
              decelerationRate="fast"
            >
              {getScoreButtons().map((scoreValue) => {
                const diff = scoreValue - holeInfo.par;
                const isSelected = score === scoreValue;
                return (
                  <TouchableOpacity
                    key={scoreValue}
                    style={[
                      styles.scorePickerItem,
                      isSelected && styles.scorePickerItemSelected,
                      isSelected && diff < 0 && styles.scorePickerItemUnder,
                      isSelected && diff === 0 && styles.scorePickerItemEven,
                      isSelected && diff > 0 && styles.scorePickerItemOver,
                    ]}
                    onPress={() => {
                      handleScoreSelect(scoreValue);
                      if (putts !== null) {
                        setGirHit((scoreValue - putts) <= (holeInfo.par - 2));
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.scorePickerNumber,
                      isSelected && styles.scorePickerNumberSelected,
                    ]}>
                      {scoreValue}
                    </Text>
                    <Text style={[
                      styles.scorePickerLabel,
                      isSelected && styles.scorePickerLabelSelected,
                    ]}>
                      {getScoreDiff(scoreValue)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Stats Section Card */}
            <View style={styles.statsCard}>
              {/* Putts */}
              <View style={styles.statsRow}>
                <Text style={styles.statsRowLabel}>Putts</Text>
                <View style={styles.statsRowButtons}>
                  {[0, 1, 2, 3, 4].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.statsButton,
                        putts === val && styles.statsButtonSelected,
                      ]}
                      onPress={() => {
                        setPutts(val);
                        if (score !== null) {
                          setGirHit((score - val) <= (holeInfo.par - 2));
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.statsButtonText,
                        putts === val && styles.statsButtonTextSelected,
                      ]}>{val === 4 ? '4+' : val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Fairway - Compass Style - only for par 4+ */}
              {holeInfo.par >= 4 && (
                <View style={styles.statsRow}>
                  <Text style={styles.statsRowLabel}>Fairway</Text>
                  <View style={styles.fairwayCompass}>
                    {/* Top - Long */}
                    <TouchableOpacity
                      style={[
                        styles.fairwayCompassBtn,
                        styles.fairwayCompassTop,
                        fairwayHit === 'long' && styles.fairwayCompassBtnSelected,
                      ]}
                      onPress={() => setFairwayHit('long')}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.fairwayCompassText,
                        fairwayHit === 'long' && styles.fairwayCompassTextSelected,
                      ]}>Long</Text>
                    </TouchableOpacity>

                    {/* Middle Row - Left, Hit, Right */}
                    <View style={styles.fairwayCompassMiddle}>
                      <TouchableOpacity
                        style={[
                          styles.fairwayCompassBtn,
                          styles.fairwayCompassSide,
                          fairwayHit === 'left' && styles.fairwayCompassBtnSelected,
                        ]}
                        onPress={() => setFairwayHit('left')}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.fairwayCompassText,
                          fairwayHit === 'left' && styles.fairwayCompassTextSelected,
                        ]}>Left</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.fairwayCompassBtn,
                          styles.fairwayCompassCenter,
                          fairwayHit === 'hit' && styles.fairwayCompassCenterSelected,
                        ]}
                        onPress={() => setFairwayHit('hit')}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.fairwayCompassCenterText,
                          fairwayHit === 'hit' && styles.fairwayCompassTextSelected,
                        ]}>{fairwayHit === 'hit' ? '\u2713' : 'Hit'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.fairwayCompassBtn,
                          styles.fairwayCompassSide,
                          fairwayHit === 'right' && styles.fairwayCompassBtnSelected,
                        ]}
                        onPress={() => setFairwayHit('right')}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.fairwayCompassText,
                          fairwayHit === 'right' && styles.fairwayCompassTextSelected,
                        ]}>Right</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Bottom - Short */}
                    <TouchableOpacity
                      style={[
                        styles.fairwayCompassBtn,
                        styles.fairwayCompassBottom,
                        fairwayHit === 'short' && styles.fairwayCompassBtnSelected,
                      ]}
                      onPress={() => setFairwayHit('short')}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.fairwayCompassText,
                        fairwayHit === 'short' && styles.fairwayCompassTextSelected,
                      ]}>Short</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* GIR */}
              <View style={styles.statsRow}>
                <Text style={styles.statsRowLabel}>GIR</Text>
                <View style={styles.statsRowButtons}>
                  <TouchableOpacity
                    style={[
                      styles.statsButtonWide,
                      girHit === true && styles.statsButtonGreen,
                    ]}
                    onPress={() => setGirHit(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.statsButtonText,
                      girHit === true && styles.statsButtonTextSelected,
                    ]}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statsButtonWide,
                      girHit === false && styles.statsButtonRed,
                    ]}
                    onPress={() => setGirHit(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.statsButtonText,
                      girHit === false && styles.statsButtonTextSelected,
                    ]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Penalties */}
              <View style={[styles.statsRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.statsRowLabel}>Penalties</Text>
                <View style={styles.statsRowButtons}>
                  {[0, 1, 2, 3].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.statsButton,
                        penalties === val && (val === 0 ? styles.statsButtonGreen : styles.statsButtonRed),
                      ]}
                      onPress={() => setPenalties(val)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.statsButtonText,
                        penalties === val && styles.statsButtonTextSelected,
                      ]}>{val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Submit Button - iOS Style */}
          <View style={styles.scoreModalFooter}>
            <TouchableOpacity
              style={[
                styles.scoreSubmitButton,
                score === null && styles.scoreSubmitDisabled,
              ]}
              onPress={() => {
                if (score !== null) {
                  setShowScoreModal(false);
                  handleNextHole();
                }
              }}
              activeOpacity={score !== null ? 0.8 : 1}
            >
              <Text style={styles.scoreSubmitText}>
                {currentHole < 18 ? 'Save & Next Hole' : 'Save & Finish Round'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Full Scorecard Modal */}
      <Modal
        visible={showFullScorecard}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowFullScorecard(false)}
      >
        <SafeAreaView style={styles.scorecardModalContainer}>
          <StatusBar style="dark" />

          {/* Header */}
          <View style={styles.scorecardModalHeader}>
            <TouchableOpacity
              onPress={() => setShowFullScorecard(false)}
              style={styles.scorecardModalBackButton}
              activeOpacity={0.7}
            >
              <Text style={styles.scorecardModalBackText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.scorecardModalTitle}>{course?.name || 'Scorecard'}</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView
            style={styles.scorecardModalBody}
            contentContainerStyle={styles.scorecardModalBodyContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Front 9 */}
            <View style={styles.scorecardSection}>
              <Text style={styles.scorecardSectionTitle}>Front 9</Text>
              <View style={styles.scorecardTable}>
                {/* Header Row */}
                <View style={styles.scorecardHeaderRow}>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardHoleCol]}>Hole</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardDataCol]}>Yds</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardDataCol]}>Par</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardDataCol]}>HCP</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardScoreCol]}>Score</Text>
                </View>

                {/* Holes 1-9 */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((holeNum) => {
                  const hole = holesData[holeNum];
                  const holeScore = holeScores[holeNum];
                  const scoreToPar = holeScore && hole ? holeScore - hole.par : null;

                  return (
                    <TouchableOpacity
                      key={holeNum}
                      style={[
                        styles.scorecardRow,
                        holeNum === viewingHole && styles.scorecardRowActive,
                      ]}
                      onPress={() => {
                        setViewingHole(holeNum);
                        setShowFullScorecard(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.scorecardCell, styles.scorecardHoleCol, styles.scorecardHoleNum]}>
                        {holeNum}
                      </Text>
                      <Text style={[styles.scorecardCell, styles.scorecardDataCol]}>
                        {hole?.yardage || '-'}
                      </Text>
                      <Text style={[styles.scorecardCell, styles.scorecardDataCol]}>
                        {hole?.par || '-'}
                      </Text>
                      <Text style={[styles.scorecardCell, styles.scorecardDataCol]}>
                        {hole?.handicap || '-'}
                      </Text>
                      <View style={[styles.scorecardScoreCol, styles.scorecardScoreWrapper]}>
                        {holeScore ? (
                          <View style={[
                            styles.scorecardScoreIndicator,
                            scoreToPar <= -2 && styles.scorecardEagle,
                            scoreToPar === -1 && styles.scorecardBirdie,
                            scoreToPar === 0 && styles.scorecardPar,
                            scoreToPar === 1 && styles.scorecardBogey,
                            scoreToPar >= 2 && styles.scorecardDoubleBogey,
                          ]}>
                            <Text style={[
                              styles.scorecardScoreText,
                              (scoreToPar <= -1 || scoreToPar >= 1) && styles.scorecardScoreTextWhite,
                            ]}>
                              {holeScore}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.scorecardCell}>-</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* OUT Total Row */}
                <View style={styles.scorecardTotalRow}>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardHoleCol]}>OUT</Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardDataCol]}>
                    {[1,2,3,4,5,6,7,8,9].reduce((sum, h) => sum + (holesData[h]?.yardage || 0), 0)}
                  </Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardDataCol]}>
                    {[1,2,3,4,5,6,7,8,9].reduce((sum, h) => sum + (holesData[h]?.par || 0), 0)}
                  </Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardDataCol]}></Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardScoreCol]}>
                    {[1,2,3,4,5,6,7,8,9].reduce((sum, h) => sum + (holeScores[h] || 0), 0) || '-'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Back 9 */}
            <View style={styles.scorecardSection}>
              <Text style={styles.scorecardSectionTitle}>Back 9</Text>
              <View style={styles.scorecardTable}>
                {/* Header Row */}
                <View style={styles.scorecardHeaderRow}>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardHoleCol]}>Hole</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardDataCol]}>Yds</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardDataCol]}>Par</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardDataCol]}>HCP</Text>
                  <Text style={[styles.scorecardHeaderCell, styles.scorecardScoreCol]}>Score</Text>
                </View>

                {/* Holes 10-18 */}
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map((holeNum) => {
                  const hole = holesData[holeNum];
                  const holeScore = holeScores[holeNum];
                  const scoreToPar = holeScore && hole ? holeScore - hole.par : null;

                  return (
                    <TouchableOpacity
                      key={holeNum}
                      style={[
                        styles.scorecardRow,
                        holeNum === viewingHole && styles.scorecardRowActive,
                      ]}
                      onPress={() => {
                        setViewingHole(holeNum);
                        setShowFullScorecard(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.scorecardCell, styles.scorecardHoleCol, styles.scorecardHoleNum]}>
                        {holeNum}
                      </Text>
                      <Text style={[styles.scorecardCell, styles.scorecardDataCol]}>
                        {hole?.yardage || '-'}
                      </Text>
                      <Text style={[styles.scorecardCell, styles.scorecardDataCol]}>
                        {hole?.par || '-'}
                      </Text>
                      <Text style={[styles.scorecardCell, styles.scorecardDataCol]}>
                        {hole?.handicap || '-'}
                      </Text>
                      <View style={[styles.scorecardScoreCol, styles.scorecardScoreWrapper]}>
                        {holeScore ? (
                          <View style={[
                            styles.scorecardScoreIndicator,
                            scoreToPar <= -2 && styles.scorecardEagle,
                            scoreToPar === -1 && styles.scorecardBirdie,
                            scoreToPar === 0 && styles.scorecardPar,
                            scoreToPar === 1 && styles.scorecardBogey,
                            scoreToPar >= 2 && styles.scorecardDoubleBogey,
                          ]}>
                            <Text style={[
                              styles.scorecardScoreText,
                              (scoreToPar <= -1 || scoreToPar >= 1) && styles.scorecardScoreTextWhite,
                            ]}>
                              {holeScore}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.scorecardCell}>-</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* IN Total Row */}
                <View style={styles.scorecardTotalRow}>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardHoleCol]}>IN</Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardDataCol]}>
                    {[10,11,12,13,14,15,16,17,18].reduce((sum, h) => sum + (holesData[h]?.yardage || 0), 0)}
                  </Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardDataCol]}>
                    {[10,11,12,13,14,15,16,17,18].reduce((sum, h) => sum + (holesData[h]?.par || 0), 0)}
                  </Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardDataCol]}></Text>
                  <Text style={[styles.scorecardTotalCell, styles.scorecardScoreCol]}>
                    {[10,11,12,13,14,15,16,17,18].reduce((sum, h) => sum + (holeScores[h] || 0), 0) || '-'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Grand Total */}
            <View style={styles.scorecardGrandTotal}>
              <View style={styles.scorecardGrandTotalRow}>
                <Text style={styles.scorecardGrandTotalLabel}>TOTAL</Text>
                <View style={styles.scorecardGrandTotalValues}>
                  <View style={styles.scorecardGrandTotalItem}>
                    <Text style={styles.scorecardGrandTotalItemLabel}>Yards</Text>
                    <Text style={styles.scorecardGrandTotalItemValue}>
                      {Object.values(holesData).reduce((sum, h) => sum + (h?.yardage || 0), 0)}
                    </Text>
                  </View>
                  <View style={styles.scorecardGrandTotalItem}>
                    <Text style={styles.scorecardGrandTotalItemLabel}>Par</Text>
                    <Text style={styles.scorecardGrandTotalItemValue}>
                      {Object.values(holesData).reduce((sum, h) => sum + (h?.par || 0), 0)}
                    </Text>
                  </View>
                  <View style={styles.scorecardGrandTotalItem}>
                    <Text style={styles.scorecardGrandTotalItemLabel}>Score</Text>
                    <Text style={[
                      styles.scorecardGrandTotalItemValue,
                      styles.scorecardGrandTotalScore,
                      roundScore > 0 && { color: '#ff6b6b' },
                      roundScore < 0 && { color: '#51cf66' },
                    ]}>
                      {Object.values(holeScores).reduce((sum, s) => sum + (s || 0), 0) || '-'}
                    </Text>
                  </View>
                  <View style={styles.scorecardGrandTotalItem}>
                    <Text style={styles.scorecardGrandTotalItemLabel}>+/-</Text>
                    <Text style={[
                      styles.scorecardGrandTotalItemValue,
                      roundScore > 0 && { color: '#ff6b6b' },
                      roundScore < 0 && { color: '#51cf66' },
                    ]}>
                      {roundScoreDisplay}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Round Settings Modal */}
      <Modal
        visible={showRoundSettings}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowRoundSettings(false)}
      >
        <SafeAreaView style={styles.settingsModalContainer}>
          <StatusBar style="dark" />

          {/* Header */}
          <View style={styles.settingsModalHeader}>
            <TouchableOpacity
              onPress={() => setShowRoundSettings(false)}
              style={styles.settingsModalBackButton}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsModalBackText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.settingsModalTitle}>Round Settings</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView
            style={styles.settingsModalBody}
            contentContainerStyle={styles.settingsModalBodyContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Course Info (Read-only) */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Course</Text>
              <View style={styles.settingsInfoRow}>
                <Text style={styles.settingsInfoLabel}>Playing at</Text>
                <Text style={styles.settingsInfoValue}>{course?.name || 'Unknown Course'}</Text>
              </View>
              <View style={styles.settingsInfoRow}>
                <Text style={styles.settingsInfoLabel}>Tee Box</Text>
                <Text style={styles.settingsInfoValue}>{selectedTee?.name || 'Default'}</Text>
              </View>
            </View>

            {/* Caddie Voice */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Caddie Voice</Text>
              <View style={styles.settingsOptionRow}>
                <View style={styles.settingsOptionInfo}>
                  <Text style={styles.settingsOptionLabel}>Sound</Text>
                  <Text style={styles.settingsOptionDescription}>
                    Read caddie advice aloud
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.settingsToggle,
                    ttsEnabled && styles.settingsToggleActive,
                  ]}
                  onPress={() => {
                    const newValue = !ttsEnabled;
                    setTtsEnabled(newValue);
                    AsyncStorage.getItem('@appSettings').then(data => {
                      const settings = data ? JSON.parse(data) : {};
                      settings.ttsEnabled = newValue;
                      AsyncStorage.setItem('@appSettings', JSON.stringify(settings));
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.settingsToggleKnob,
                    ttsEnabled && styles.settingsToggleKnobActive,
                  ]} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Caddie Response Length */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Caddie Response Style</Text>
              <Text style={styles.settingsSectionDescription}>
                How detailed should the caddie's advice be?
              </Text>
              <View style={styles.settingsButtonGroup}>
                {[
                  { value: 'brief', label: 'Brief', desc: 'Quick tips' },
                  { value: 'detailed', label: 'Detailed', desc: 'Full analysis' },
                  { value: 'comprehensive', label: 'Pro', desc: 'Tour-level detail' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.settingsButtonOption,
                      caddiePreferences?.responseDepth === option.value && styles.settingsButtonOptionActive,
                    ]}
                    onPress={() => {
                      const newPrefs = { ...caddiePreferences, responseDepth: option.value };
                      setCaddiePreferences(newPrefs);
                      AsyncStorage.getItem('userProfile').then(data => {
                        const profile = data ? JSON.parse(data) : {};
                        profile.responseDepth = option.value;
                        AsyncStorage.setItem('userProfile', JSON.stringify(profile));
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.settingsButtonLabel,
                      caddiePreferences?.responseDepth === option.value && styles.settingsButtonLabelActive,
                    ]}>
                      {option.label}
                    </Text>
                    <Text style={[
                      styles.settingsButtonDesc,
                      caddiePreferences?.responseDepth === option.value && styles.settingsButtonDescActive,
                    ]}>
                      {option.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* GPS Tracking */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>GPS Tracking</Text>
              <View style={styles.settingsOptionRow}>
                <View style={styles.settingsOptionInfo}>
                  <Text style={styles.settingsOptionLabel}>Live Location</Text>
                  <Text style={styles.settingsOptionDescription}>
                    Track your position on the course
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.settingsToggle,
                    isTrackingActive && styles.settingsToggleActive,
                  ]}
                  onPress={() => setIsTrackingActive(!isTrackingActive)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.settingsToggleKnob,
                    isTrackingActive && styles.settingsToggleKnobActive,
                  ]} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Simulation Mode (Dev) */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Developer</Text>
              <View style={styles.settingsOptionRow}>
                <View style={styles.settingsOptionInfo}>
                  <Text style={styles.settingsOptionLabel}>GPS Simulation</Text>
                  <Text style={styles.settingsOptionDescription}>
                    Simulate walking the course
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.settingsToggle,
                    isSimActive && styles.settingsToggleActive,
                  ]}
                  onPress={() => setIsSimActive(!isSimActive)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.settingsToggleKnob,
                    isSimActive && styles.settingsToggleKnobActive,
                  ]} />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <TrainingOverlay {...trainingOverlayProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenMap: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'box-none', // Allow touches to pass through to map
  },
  windIndicator: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    minWidth: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  windArrowContainer: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windArrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 24,
    color: '#fff',
  },
  windSpeed: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: '#fff',
    marginTop: 2,
  },
  windUnit: {
    fontFamily: theme.fonts.regular,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: -2,
  },
  headerOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  endRoundButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endRoundText: {
    color: theme.colors.text.inverse,
    fontSize: 24,
    fontWeight: theme.typography.weights.bold,
  },
  headerCenter: {
    alignItems: 'center',
  },
  holeNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  navArrow: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowDisabled: {
    opacity: 0.3,
  },
  navArrowText: {
    color: theme.colors.text.inverse,
    fontSize: 20,
    fontWeight: theme.typography.weights.bold,
  },
  navArrowTextDisabled: {
    opacity: 0.5,
  },
  holeNumberText: {
    ...theme.typography.styles.h4,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.bold,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    minWidth: 80,
    textAlign: 'center',
  },
  statsOverlay: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...theme.typography.styles.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    ...theme.typography.styles.h4,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.bold,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  // PGA-style scorecard
  pgaScorecard: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#0a1f3d',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    borderRadius: 12,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  pgaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pgaBottomRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    marginTop: 6,
    paddingTop: 5,
    alignItems: 'center',
  },
  pgaHoleNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pgaNavArrow: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
  },
  pgaHoleNumber: {
    fontFamily: theme.fonts.extrabold,
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 32,
  },
  pgaHoleDetails: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  pgaDivider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: 10,
  },
  pgaShotTracker: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  pgaShotItem: {
    alignItems: 'center',
  },
  pgaShotNumber: {
    fontFamily: theme.fonts.extrabold,
    color: '#ffffff',
    fontSize: 20,
  },
  pgaShotNumberActive: {
    fontFamily: theme.fonts.extrabold,
  },
  pgaShotUnderline: {
    width: 16,
    height: 2,
    backgroundColor: '#4a90d9',
    marginTop: 2,
    borderRadius: 1,
  },
  // PGA-style score indicators
  pgaBirdieCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#51cf66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaEagleOuter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#51cf66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaEagleInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#51cf66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaBogeySquare: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaDoubleBogeyOuter: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaDoubleBogeyInner: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaRoundScore: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgaRoundScoreText: {
    fontFamily: theme.fonts.extrabold,
    fontSize: 20,
    color: '#ffffff',
  },
  pgaScoreOver: {
    color: '#ff6b6b',
  },
  pgaScoreUnder: {
    color: '#51cf66',
  },
  pgaScoreEven: {
    color: '#ffffff',
  },
  distanceOverlay: {
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    pointerEvents: 'box-none', // Allow touches to pass through to map
  },
  distanceCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.base,
    alignItems: 'center',
    width: 130,
  },
  // ── Unified Hole Plan Card ──
  holePlanCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.base,
    alignSelf: 'flex-end',
    width: 170,
    gap: 6,
  },
  holePlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  holePlanTitle: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  holePlanStreamingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  holePlanStreamingText: {
    fontFamily: theme.fonts.semibold,
    color: '#60a5fa',
    fontSize: 12,
  },
  holePlanBadgeRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 5,
  },
  holePlanBadge: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  holePlanBadgeText: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 10,
    textAlign: 'center',
  },
  holePlanProjectedScore: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },
  holePlanReminders: {
    width: '100%',
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 5,
  },
  holePlanReminderText: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    lineHeight: 14,
  },
  holePlanFooterRow: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 4,
  },
  holePlanHintText: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    textAlign: 'center',
  },
  holePlanResetText: {
    fontFamily: theme.fonts.semibold,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
  },
  gpsDistanceRow: {
    marginBottom: theme.spacing.xs,
  },
  gpsLabel: {
    ...theme.typography.styles.caption,
    color: 'rgba(59, 130, 246, 1)',
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
  },
  dividerThin: {
    height: 1,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: theme.spacing.xs,
  },
  teeDistanceSmall: {
    ...theme.typography.styles.caption,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    marginBottom: theme.spacing.xs,
  },
  planHoleContainer: {
    alignItems: 'center',
  },
  planHoleButton: {
    backgroundColor: theme.colors.primary[500],
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.base,
    alignItems: 'center',
  },
  ttsSpeakerButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttsSpeakerIcon: {
    fontSize: 18,
  },
  // Inline follow-up conversation styles
  inlineMessageBubble: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 4,
    maxWidth: '95%',
  },
  inlineMessageUser: {
    backgroundColor: 'rgba(30, 64, 175, 0.85)',
    alignSelf: 'flex-end',
  },
  inlineMessageCaddy: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignSelf: 'flex-start',
  },
  inlineMessageText: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    lineHeight: 17,
  },
  inlineMessageTextUser: {
    color: '#ffffff',
  },
  floatingInputBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    zIndex: 999,
  },
  inlineInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 20,
    marginTop: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
  },
  inlineMicButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineMicButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.5)',
  },
  inlineMicIcon: {
    fontSize: 16,
  },
  inlineTextInput: {
    fontFamily: theme.fonts.regular,
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 6,
    maxHeight: 60,
  },
  inlineSendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSendButtonDisabled: {
    opacity: 0.3,
  },
  inlineSendIcon: {
    color: '#ffffff',
    fontSize: 16,
  },
  inlineDismissButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineDismissIcon: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  planHoleButtonText: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.semibold,
    fontSize: 12,
  },
  planHoleButtonDisabled: {
    backgroundColor: theme.colors.neutral.gray[400],
  },
  distanceNumber: {
    ...theme.typography.styles.h3,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.bold,
  },
  distanceLabel: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.inverse,
    fontSize: 10,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  caddyTipOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  caddyTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  aiTipIcon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },
  caddyTipTitle: {
    ...theme.typography.styles.label,
    color: theme.colors.text.inverse,
    flex: 1,
  },
  closeTipButton: {
    padding: theme.spacing.xs,
  },
  closeTipText: {
    color: theme.colors.text.inverse,
    fontSize: 20,
    fontWeight: theme.typography.weights.bold,
  },
  caddyTipText: {
    ...theme.typography.styles.bodySmall,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },
  // Full-screen score modal - iOS Professional Style
  scoreModalContainer: {
    flex: 1,
    backgroundColor: '#f2f2f7', // iOS system background
  },
  scoreModalPill: {
    width: 36,
    height: 5,
    backgroundColor: '#c7c7cc',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  scoreModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scoreModalBackButton: {
    minWidth: 60,
  },
  scoreModalBackText: {
    fontFamily: theme.fonts.regular,
    color: theme.colors.primary[500],
    fontSize: 17,
  },
  scoreModalSaveButton: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  scoreModalSaveText: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.primary[500],
    fontSize: 17,
  },
  scoreModalHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  scoreModalHoleTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: '#000',
    letterSpacing: -0.4,
  },
  scoreModalHoleInfo: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  scoreModalBody: {
    flex: 1,
  },
  scoreModalBodyContent: {
    paddingBottom: 40,
  },
  scoreModalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: '#f2f2f7',
  },
  scoreSubmitButton: {
    backgroundColor: theme.colors.primary[500],
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scoreSubmitDisabled: {
    backgroundColor: '#c7c7cc',
    shadowOpacity: 0,
  },
  scoreSubmitText: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 17,
    letterSpacing: -0.4,
  },

  // Score Section
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  scoreSectionLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: '#8e8e93',
    letterSpacing: 0.5,
  },
  scoreDisplayBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  scoreDisplayBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    letterSpacing: -0.1,
  },

  // Score Picker - Horizontal Scroll
  scorePickerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  scorePickerItem: {
    width: 64,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scorePickerItemSelected: {
    borderWidth: 2,
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  scorePickerItemUnder: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  scorePickerItemEven: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[500],
  },
  scorePickerItemOver: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  scorePickerNumber: {
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    color: '#000',
    letterSpacing: -1,
  },
  scorePickerNumberSelected: {
    color: '#fff',
  },
  scorePickerLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
  },
  scorePickerLabelSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Stats Card
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c6c6c8',
  },
  statsRowLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    color: '#000',
    letterSpacing: -0.4,
    flex: 1,
  },
  statsRowButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  statsButton: {
    width: 44,
    height: 36,
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsButtonSelected: {
    backgroundColor: theme.colors.primary[500],
  },
  statsButtonGreen: {
    backgroundColor: '#16a34a',
  },
  statsButtonRed: {
    backgroundColor: '#dc2626',
  },
  statsButtonWide: {
    paddingHorizontal: 20,
    height: 36,
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: '#000',
    letterSpacing: -0.2,
  },
  statsButtonTextSelected: {
    color: '#fff',
  },

  // Fairway Compass
  fairwayCompass: {
    alignItems: 'center',
    width: 140,
  },
  fairwayCompassMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fairwayCompassBtn: {
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fairwayCompassTop: {
    width: 50,
    height: 32,
    marginBottom: 6,
  },
  fairwayCompassBottom: {
    width: 50,
    height: 32,
    marginTop: 6,
  },
  fairwayCompassSide: {
    width: 44,
    height: 36,
  },
  fairwayCompassCenter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#16a34a',
  },
  fairwayCompassCenterSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  fairwayCompassBtnSelected: {
    backgroundColor: theme.colors.primary[500],
  },
  fairwayCompassText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: '#000',
    letterSpacing: -0.2,
  },
  fairwayCompassCenterText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: '#16a34a',
  },
  fairwayCompassTextSelected: {
    color: '#fff',
  },
  teeMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 32,
  },
  teeIconTop: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: theme.colors.secondary[500],
    marginBottom: 2,
  },
  teeIconBottom: {
    width: 2,
    height: 18,
    backgroundColor: theme.colors.secondary[500],
    borderRadius: 1,
  },
  greenMarker: {
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    width: 28,
    height: 32,
  },
  flagPole: {
    position: 'absolute',
    bottom: 0,
    left: 6,
    width: 2,
    height: 28,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  flagTriangle: {
    position: 'absolute',
    top: 2,
    left: 8,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: theme.colors.primary[500],
  },
  userMarker: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerOuterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  userMarkerInnerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  userMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  playerLocationMarker: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerLocationPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.5)',
  },
  playerLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3b82f6',
    borderWidth: 3,
    borderColor: '#fff',
  },
  distanceCardExpanded: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    minWidth: 140,
  },
  clubRow: {
    alignItems: 'center',
    paddingBottom: theme.spacing.xs,
  },
  clubLabel: {
    ...theme.typography.styles.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    marginBottom: 2,
  },
  clubName: {
    ...theme.typography.styles.body,
    color: theme.colors.primary[400],
    fontWeight: theme.typography.weights.bold,
    fontSize: 15,
  },
  nextShotButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primary[500],
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.base,
    alignItems: 'center',
  },
  nextShotButtonText: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.semibold,
    fontSize: 11,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  distanceRowIndicator: {
    width: 3,
    height: 24,
    borderRadius: 2,
  },
  distanceRowContent: {
    flex: 1,
  },
  distanceRowLabel: {
    ...theme.typography.styles.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
  },
  distanceRowNumber: {
    ...theme.typography.styles.body,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.bold,
    fontSize: 16,
  },
  distanceDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: theme.spacing.xs,
  },
  distanceTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.xs,
  },
  distanceTotalLabel: {
    ...theme.typography.styles.caption,
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  distanceTotalNumber: {
    ...theme.typography.styles.body,
    color: theme.colors.accent.amber,
    fontWeight: theme.typography.weights.bold,
    fontSize: 16,
  },
  // "Plays Like" row for effective distance
  playsLikeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)', // Amber tint
    marginHorizontal: -theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  playsLikeLabel: {
    color: theme.colors.accent.amber,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  playsLikeValue: {
    color: theme.colors.accent.amber,
    fontWeight: theme.typography.weights.bold,
    fontSize: 14,
  },
  // Distance labels displayed on polylines
  lineDistanceLabel: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lineDistanceActual: {
    color: '#fff',
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
  },
  lineDistanceEffective: {
    color: theme.colors.accent.amber,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    marginTop: 1,
  },
  chatPlaceholder: {
    alignItems: 'center',
    paddingVertical: theme.spacing['2xl'],
  },
  chatPlaceholderIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  chatPlaceholderText: {
    ...theme.typography.styles.body,
    color: theme.colors.text.secondary,
  },
  chatModalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background.white,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
    backgroundColor: theme.colors.background.white,
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  chatHeaderIcon: {
    fontSize: 32,
  },
  chatHeaderTitle: {
    ...theme.typography.styles.h4,
    fontWeight: theme.typography.weights.bold,
  },
  chatHeaderSubtitle: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  chatCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCloseButtonText: {
    fontSize: 28,
    color: theme.colors.text.secondary,
  },
  chatMessagesContainer: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  chatMessagesContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  chatMessageBubble: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chatMessageCaddy: {
    alignItems: 'flex-start',
  },
  chatMessageUser: {
    alignItems: 'flex-end',
    flexDirection: 'row-reverse',
  },
  chatMessageIcon: {
    fontSize: 24,
    marginTop: theme.spacing.xs,
  },
  chatMessageContent: {
    maxWidth: '75%',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  chatMessageContentCaddy: {
    backgroundColor: theme.colors.background.white,
    borderBottomLeftRadius: 4,
  },
  chatMessageContentUser: {
    backgroundColor: theme.colors.primary[500],
    borderBottomRightRadius: 4,
  },
  chatMessageText: {
    ...theme.typography.styles.body,
    color: theme.colors.text.primary,
    lineHeight: 22,
  },
  chatMessageTextUser: {
    color: theme.colors.text.inverse,
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.gray[200],
    gap: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.typography.styles.body,
    maxHeight: 100,
  },
  chatSendButton: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.primary[500],
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: {
    backgroundColor: theme.colors.neutral.gray[300],
  },
  chatSendButtonText: {
    fontSize: 20,
    color: theme.colors.text.inverse,
  },
  aiShotMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary[500],
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiShotMarkerText: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.bold,
    fontSize: 13,
  },
  aiShotMarkerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiShotInfoBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  aiShotClubText: {
    fontFamily: theme.fonts.bold,
    color: '#10b981',
    fontSize: 12,
  },
  aiShotDistanceText: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 11,
  },
  aiShotPlaysLikeText: {
    fontFamily: theme.fonts.regular,
    color: theme.colors.accent.amber,
    fontSize: 10,
  },
  aiShotMarkerSelected: {
    backgroundColor: theme.colors.accent.amber,
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },
  // Compact plan styles
  compactPlanOuter: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-end',
    width: '55%',
  },
  placeholderText: {
    opacity: 0.3,
  },
  compactPlanScroll: {
    maxHeight: 200,
    marginTop: 4,
  },
  compactPlanContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    gap: 6,
  },
  streamingTextCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  streamingTextContent: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    lineHeight: 17,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  streamingIndicatorText: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
  compactShotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  compactShotNum: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    width: 20,
  },
  compactShotClub: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
  },
  compactShotDist: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    width: 36,
    textAlign: 'right',
  },
  compactShotMore: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    width: 18,
    textAlign: 'center',
  },
  compactShotDetails: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    gap: 3,
  },
  compactDetailText: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    lineHeight: 17,
  },
  compactWarningText: {
    fontFamily: theme.fonts.regular,
    color: '#fbbf24',
    fontSize: 12,
    lineHeight: 17,
  },
  compactMetaRow: {
    flexDirection: 'column',
    gap: 5,
  },
  // Location error
  locationErrorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.base,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  locationErrorText: {
    fontFamily: theme.fonts.regular,
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
  },
  // Shot detection indicator
  shotDetectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: theme.borderRadius.base,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: theme.spacing.sm,
    gap: 8,
  },
  shotDetectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.neutral.gray[400],
  },
  shotDetectionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
  },
  shotDetectionCount: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginLeft: 4,
  },
  // Hazard distance labels (line style: ---245---)
  hazardDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hazardDistanceLine: {
    width: 12,
    height: 1.5,
  },
  hazardDistanceText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: '#ffffff',
    marginHorizontal: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Scorecard button
  scorecardButton: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginRight: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  scorecardButtonText: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 12,
  },

  // Full Scorecard Modal
  scorecardModalContainer: {
    flex: 1,
    backgroundColor: '#1a472a',
  },
  scorecardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0d2818',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  scorecardModalBackButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  scorecardModalBackText: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 16,
  },
  scorecardModalTitle: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  scorecardModalBody: {
    flex: 1,
  },
  scorecardModalBodyContent: {
    padding: 16,
  },

  // Scorecard sections
  scorecardSection: {
    marginBottom: 20,
  },
  scorecardSectionTitle: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scorecardTable: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  scorecardHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0d2818',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  scorecardHeaderCell: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
  },
  scorecardRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
  },
  scorecardRowActive: {
    backgroundColor: 'rgba(26, 71, 42, 0.15)',
  },
  scorecardCell: {
    fontFamily: theme.fonts.regular,
    color: '#333',
    fontSize: 14,
    textAlign: 'center',
  },
  scorecardHoleCol: {
    width: 50,
  },
  scorecardDataCol: {
    flex: 1,
    textAlign: 'center',
  },
  scorecardScoreCol: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorecardHoleNum: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: '#0d2818',
  },
  scorecardScoreWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorecardScoreIndicator: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorecardScoreText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: '#333',
  },
  scorecardScoreTextWhite: {
    color: '#ffffff',
  },
  scorecardPar: {
    // No special styling for par
  },
  scorecardBirdie: {
    backgroundColor: '#22c55e',
    borderRadius: 16,
  },
  scorecardEagle: {
    backgroundColor: '#fbbf24',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  scorecardBogey: {
    backgroundColor: '#ef4444',
    borderRadius: 4,
  },
  scorecardDoubleBogey: {
    backgroundColor: '#991b1b',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#7f1d1d',
  },
  scorecardTotalRow: {
    flexDirection: 'row',
    backgroundColor: '#e5e5e5',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  scorecardTotalCell: {
    fontFamily: theme.fonts.bold,
    color: '#0d2818',
    fontSize: 14,
    textAlign: 'center',
  },

  // Grand Total
  scorecardGrandTotal: {
    backgroundColor: '#0d2818',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  scorecardGrandTotalRow: {
    alignItems: 'center',
  },
  scorecardGrandTotalLabel: {
    fontFamily: theme.fonts.extrabold,
    color: '#ffffff',
    fontSize: 18,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  scorecardGrandTotalValues: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  scorecardGrandTotalItem: {
    alignItems: 'center',
  },
  scorecardGrandTotalItemLabel: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 4,
  },
  scorecardGrandTotalItemValue: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 20,
  },
  scorecardGrandTotalScore: {
    fontSize: 24,
  },

  // Round Settings Button
  roundSettingsButton: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  roundSettingsIcon: {
    fontSize: 20,
    color: '#ffffff',
  },

  // Settings Modal
  settingsModalContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  settingsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsModalBackButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  settingsModalBackText: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 16,
  },
  settingsModalTitle: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  settingsModalBody: {
    flex: 1,
  },
  settingsModalBodyContent: {
    padding: 16,
  },

  // Settings Sections
  settingsSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  settingsSectionTitle: {
    fontFamily: theme.fonts.bold,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingsSectionDescription: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginBottom: 12,
  },

  // Settings Info Row (read-only)
  settingsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsInfoLabel: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  settingsInfoValue: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 14,
  },

  // Settings Option Row (with toggle)
  settingsOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingsOptionInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingsOptionLabel: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 15,
    marginBottom: 2,
  },
  settingsOptionDescription: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },

  // Toggle Switch
  settingsToggle: {
    width: 50,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  settingsToggleActive: {
    backgroundColor: '#22c55e',
  },
  settingsToggleKnob: {
    width: 24,
    height: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  settingsToggleKnobActive: {
    alignSelf: 'flex-end',
  },

  // Button Group (for response length)
  settingsButtonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  settingsButtonOption: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  settingsButtonOptionActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22c55e',
  },
  settingsButtonLabel: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 2,
  },
  settingsButtonLabelActive: {
    color: '#22c55e',
  },
  settingsButtonDesc: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
  },
  settingsButtonDescActive: {
    color: 'rgba(34, 197, 94, 0.8)',
  },

  // Distance Row
  toolsAndDistanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },

  // Clear Pin Button (top-left, where layers used to be)
  clearPinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  clearPinIcon: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: theme.fonts.bold,
  },
  clearPinText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: '#ffffff',
  },

  // Floating Layers Button (bottom-left, above wind)
  floatingLayersContainer: {
    position: 'absolute',
    bottom: 210,
    left: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  fanItemWrapper: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 15,
  },
  floatingLayersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 25,
  },
  floatingLayersButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(10, 132, 255, 0.4)',
    ...Platform.select({
      ios: {
        shadowColor: '#0A84FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  floatingLayersIcon: {
    fontSize: 16,
    color: '#ffffff',
  },
  floatingLayersIconActive: {
    color: '#0A84FF',
  },
  floatingLayersText: {
    fontFamily: theme.fonts.semibold,
    color: '#ffffff',
    fontSize: 13,
  },
  floatingLayersTextActive: {
    color: '#0A84FF',
  },
  fanToolButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  fanToolButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(10, 132, 255, 0.4)',
    ...Platform.select({
      ios: {
        shadowColor: '#0A84FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  fanToolIcon: {
    fontSize: 18,
  },

  // Mini hazard icon: ── yds ── style matching map markers
  hazardMiniIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hazardMiniLine: {
    width: 8,
    height: 1.5,
    backgroundColor: '#f4d03f',
    borderRadius: 1,
  },
  hazardMiniLineActive: {
    backgroundColor: '#b8860b',
  },
  hazardMiniText: {
    fontFamily: theme.fonts.bold,
    fontSize: 7,
    color: '#f4d03f',
    letterSpacing: -0.3,
  },
  hazardMiniTextActive: {
    color: '#8B6914',
  },

  // Mini overlay icon: green polygon shape
  overlayMiniIcon: {
    width: 22,
    height: 16,
    borderRadius: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 5,
    borderWidth: 1.5,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-15deg' }],
  },
  overlayMiniIconActive: {
    borderColor: '#166534',
    backgroundColor: 'rgba(22, 101, 52, 0.35)',
  },
  overlayMiniInner: {
    width: 6,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.6)',
  },
  overlayMiniInnerActive: {
    backgroundColor: 'rgba(22, 101, 52, 0.6)',
  },

  // ── Shot Logging ──
  logShotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 8,
    marginRight: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  logShotButtonText: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
  },
  trackingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 8,
    marginRight: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  trackingButtonText: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
  },

});
