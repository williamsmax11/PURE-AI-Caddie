/**
 * DraggableShotMarker
 *
 * An interactive shot target marker that can be dragged to reposition.
 * Uses native Marker `draggable` for reliable cross-platform drag handling.
 * Displays dynamic color coding (green/yellow/red) based on shot quality.
 *
 * Performance: Uses tiered calculation approach:
 *   - Tier 1 (every onDrag frame): distance + club lookup
 *   - Tier 2 (throttled 100ms): lightweight color assessment
 *   - Tier 3 (on release): full scoring via parent callback
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import {
  computeDragFrameUpdate,
  assessShotColorLightweight,
} from '../services/dragShotCalculator';

// ============================================================================
// COLOR STYLE DEFINITIONS
// ============================================================================

const COLOR_STYLES = {
  green: {
    circle: { backgroundColor: '#10b981', borderColor: '#059669' },
    clubText: { color: '#10b981' },
    infoBoxBorder: { borderLeftColor: '#10b981', borderLeftWidth: 3 },
  },
  yellow: {
    circle: { backgroundColor: '#f59e0b', borderColor: '#d97706' },
    clubText: { color: '#f59e0b' },
    infoBoxBorder: { borderLeftColor: '#f59e0b', borderLeftWidth: 3 },
  },
  red: {
    circle: { backgroundColor: '#ef4444', borderColor: '#dc2626' },
    clubText: { color: '#ef4444' },
    infoBoxBorder: { borderLeftColor: '#ef4444', borderLeftWidth: 3 },
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

const DraggableShotMarker = React.memo(({
  shot,
  shotIndex,
  isSelected,
  color,
  isDragging,
  previousPosition,
  greenPosition,
  preComputedClubReaches,
  weather,
  hazardCentroids,
  polygons,
  isApproach,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPress,
}) => {
  const throttleRef = useRef(null);
  const lastCoordRef = useRef(null);
  const isDraggingRef = useRef(false);
  const markerRef = useRef(null);

  // Force the native map to re-capture the marker bitmap after state changes.
  // react-native-maps caches custom views as bitmaps; the cache can go stale
  // after drag end or selection changes. Marker.redraw() forces a fresh capture.
  useEffect(() => {
    if (isDragging) return; // Don't redraw mid-drag
    const timer = setTimeout(() => {
      markerRef.current?.redraw();
    }, 100);
    return () => clearTimeout(timer);
  }, [isSelected, color, isDragging, shot?.club, shot?.distance, shot?.effectiveDistance]);

  const colorStyles = COLOR_STYLES[color] || COLOR_STYLES.green;

  // Tier 2 throttled color check during drag
  const runThrottledColorCheck = useCallback((coordinate) => {
    if (throttleRef.current) return; // Already scheduled

    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;

      if (!isDraggingRef.current) return;

      const newColor = assessShotColorLightweight(
        coordinate,
        previousPosition,
        greenPosition,
        polygons,
        hazardCentroids,
        preComputedClubReaches,
        isApproach
      );

      // Pass color update through drag move with a color field
      if (onDragMove && lastCoordRef.current) {
        const update = computeDragFrameUpdate(
          lastCoordRef.current,
          previousPosition,
          greenPosition,
          preComputedClubReaches,
          weather
        );
        update.color = newColor;
        onDragMove(shotIndex, lastCoordRef.current, update);
      }
    }, 100);
  }, [
    previousPosition, greenPosition, polygons, hazardCentroids,
    preComputedClubReaches, isApproach, shotIndex, onDragMove,
  ]);

  // Native drag start handler
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    lastCoordRef.current = null;
    if (onDragStart) {
      onDragStart(shotIndex);
    }
  }, [shotIndex, onDragStart]);

  // Native drag handler — fires on each frame with GPS coordinate
  const handleDrag = useCallback((e) => {
    const coordinate = e.nativeEvent.coordinate;
    if (!coordinate) return;

    lastCoordRef.current = coordinate;

    // Tier 1: immediate distance + club + plays-like update
    const update = computeDragFrameUpdate(
      coordinate,
      previousPosition,
      greenPosition,
      preComputedClubReaches,
      weather
    );

    if (onDragMove) {
      onDragMove(shotIndex, coordinate, update);
    }

    // Schedule Tier 2 color check
    runThrottledColorCheck(coordinate);
  }, [shotIndex, previousPosition, greenPosition, preComputedClubReaches,
      weather, onDragMove, runThrottledColorCheck]);

  // Native drag end handler — Tier 3 full scoring
  const handleDragEnd = useCallback((e) => {
    isDraggingRef.current = false;

    // Clear any pending throttle
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }

    const coordinate = e.nativeEvent.coordinate;
    if (onDragEnd && coordinate) {
      onDragEnd(shotIndex, coordinate);
    }
  }, [shotIndex, onDragEnd]);

  // Tap handler
  const handlePress = useCallback(() => {
    if (onPress) {
      onPress(shotIndex);
    }
  }, [shotIndex, onPress]);

  if (!shot?.landingZone?.latitude || !shot?.landingZone?.longitude) {
    return null;
  }

  const playsLikeDelta = shot.effectiveDistance
    ? shot.effectiveDistance - shot.distance
    : 0;

  return (
    <Marker
      ref={markerRef}
      coordinate={shot.landingZone}
      anchor={{ x: 14 / 170, y: 14 / 56 }}
      zIndex={isDragging ? 200 : 100}
      tracksViewChanges={true}
      draggable
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onPress={handlePress}
    >
      <View style={styles.container}>
        {/* Shot number circle — container is sized to this, so anchor centers it */}
        {/* Always include transform to prevent react-native-maps bitmap cache glitch */}
        <View style={[
          styles.shotCircle,
          colorStyles.circle,
          { transform: [{ scale: isDragging ? 1.2 : isSelected ? 1.15 : 1.0 }] },
          isDragging && { opacity: 0.9 },
        ]}>
          <Text style={styles.shotNumber}>{shot.shotNumber}</Text>
        </View>

        {/* Info box — absolutely positioned so it doesn't affect anchor calculation */}
        <View style={[styles.infoBox, colorStyles.infoBoxBorder]}>
          <Text style={[styles.clubText, colorStyles.clubText]}>{shot.club}</Text>
          <Text style={styles.distanceText}>{shot.distance} yds</Text>
          {shot.effectiveDistance != null && (
            <Text style={styles.playsLikeText}>
              Playing {shot.effectiveDistance}
              {Math.abs(playsLikeDelta) >= 1
                ? ` (${playsLikeDelta > 0 ? '+' : ''}${playsLikeDelta})`
                : ''}
            </Text>
          )}
        </View>
      </View>
    </Marker>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo — only re-render when relevant data changes
  return (
    prevProps.shot?.landingZone?.latitude === nextProps.shot?.landingZone?.latitude &&
    prevProps.shot?.landingZone?.longitude === nextProps.shot?.landingZone?.longitude &&
    prevProps.shot?.club === nextProps.shot?.club &&
    prevProps.shot?.distance === nextProps.shot?.distance &&
    prevProps.shot?.effectiveDistance === nextProps.shot?.effectiveDistance &&
    prevProps.color === nextProps.color &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.previousPosition?.latitude === nextProps.previousPosition?.latitude &&
    prevProps.previousPosition?.longitude === nextProps.previousPosition?.longitude
  );
});

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: 170,
    height: 56,
  },
  shotCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotNumber: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  infoBox: {
    position: 'absolute',
    left: 34,
    top: 0,
    minWidth: 130,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clubText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  distanceText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  playsLikeText: {
    color: '#f59e0b',
    fontSize: 10,
  },
});

export default DraggableShotMarker;
