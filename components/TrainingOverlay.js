/**
 * TrainingOverlay - Coach mark overlay with spotlight and tooltip
 *
 * Renders a full-screen overlay with:
 * - Semi-transparent dimmed background
 * - Spotlight cutout on the target region (or full dim for 'none' targets)
 * - Tooltip card with title, description, step dots, Next/Skip buttons
 * - Styled to match AI Caddie card aesthetic
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.75)';
const SPOTLIGHT_BORDER_COLOR = theme.colors.primary[400];
const TOOLTIP_BG = '#1a1f2e';
const TOOLTIP_BORDER = theme.colors.primary[500];
const PADDING = 12; // px padding around spotlight

export default function TrainingOverlay({
  visible,
  steps,
  currentStep,
  totalSteps,
  onNext,
  onSkip,
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      contentAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(contentAnim, {
          toValue: 1,
          duration: 400,
          delay: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Animate step transitions
  useEffect(() => {
    if (visible) {
      contentAnim.setValue(0);
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [currentStep]);

  const insets = useSafeAreaInsets();

  if (!visible || !steps || steps.length === 0) return null;

  const step = steps[currentStep];
  if (!step) return null;

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const isLastStep = currentStep === totalSteps - 1;
  const hasTarget = step.target && step.target.type !== 'none';

  // Calculate target rectangle in pixels
  let targetRect = null;
  if (step.target?.type === 'region') {
    // Percentage-based positioning (for scroll content, map areas)
    targetRect = {
      top: (step.target.top / 100) * screenHeight,
      left: (step.target.left / 100) * screenWidth,
      width: (step.target.width / 100) * screenWidth,
      height: (step.target.height / 100) * screenHeight,
    };
  } else if (step.target?.type === 'absolute') {
    // Pixel-based positioning from edges (matches actual style values)
    const t = step.target;
    const safeTop = t.safeTop ? insets.top : 0;
    const safeBottom = t.safeBottom ? insets.bottom : 0;

    // Calculate left position
    let rectLeft;
    if (t.left !== undefined) {
      rectLeft = t.left;
    } else if (t.right !== undefined && t.width !== undefined) {
      rectLeft = screenWidth - t.right - t.width;
    } else {
      rectLeft = 0;
    }

    // Calculate width
    let rectWidth;
    if (t.width !== undefined) {
      rectWidth = t.width;
    } else if (t.left !== undefined && t.right !== undefined) {
      rectWidth = screenWidth - t.left - t.right;
    } else {
      rectWidth = screenWidth - rectLeft;
    }

    // Calculate top position
    let rectTop;
    if (t.top !== undefined) {
      rectTop = t.top + safeTop;
    } else if (t.bottom !== undefined && t.height !== undefined) {
      rectTop = screenHeight - t.bottom - t.height - safeBottom;
    } else {
      rectTop = 0;
    }

    // Calculate height
    let rectHeight;
    if (t.height !== undefined) {
      rectHeight = t.height;
    } else if (t.top !== undefined && t.bottom !== undefined) {
      rectHeight = screenHeight - (t.top + safeTop) - (t.bottom + safeBottom);
    } else {
      rectHeight = 50;
    }

    targetRect = {
      top: Math.max(0, rectTop),
      left: Math.max(0, rectLeft),
      width: Math.min(rectWidth, screenWidth - rectLeft),
      height: Math.min(rectHeight, screenHeight - rectTop),
    };
  }

  // Determine tooltip position: above or below target
  const tooltipAbove = hasTarget
    ? (targetRect.top + targetRect.height / 2) > screenHeight * 0.5
    : false;

  const contentTranslateY = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tooltipAbove ? -15 : 15, 0],
  });

  return (
    <Animated.View
      style={[styles.overlay, { opacity: fadeAnim }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {hasTarget ? (
        // Render 4 dark rectangles around the clear target
        // Clamp values to prevent negative dimensions at screen edges
        <>
          {/* Top section */}
          {targetRect.top - PADDING > 0 && (
            <View
              style={[
                styles.dimSection,
                {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: Math.max(0, targetRect.top - PADDING),
                },
              ]}
            />
          )}
          {/* Left section */}
          {targetRect.left - PADDING > 0 && (
            <View
              style={[
                styles.dimSection,
                {
                  top: Math.max(0, targetRect.top - PADDING),
                  left: 0,
                  width: Math.max(0, targetRect.left - PADDING),
                  height: targetRect.height + PADDING * 2,
                },
              ]}
            />
          )}
          {/* Right section */}
          <View
            style={[
              styles.dimSection,
              {
                top: Math.max(0, targetRect.top - PADDING),
                left: targetRect.left + targetRect.width + PADDING,
                right: 0,
                height: targetRect.height + PADDING * 2,
              },
            ]}
          />
          {/* Bottom section */}
          <View
            style={[
              styles.dimSection,
              {
                top: targetRect.top + targetRect.height + PADDING,
                left: 0,
                right: 0,
                bottom: 0,
              },
            ]}
          />
          {/* Spotlight border */}
          <View
            style={[
              styles.spotlightBorder,
              {
                top: Math.max(0, targetRect.top - PADDING),
                left: Math.max(0, targetRect.left - PADDING),
                width: targetRect.width + PADDING * 2 + Math.min(0, targetRect.left - PADDING),
                height: targetRect.height + PADDING * 2 + Math.min(0, targetRect.top - PADDING),
              },
            ]}
          />
        </>
      ) : (
        // Full screen dim for 'none' target type
        <View style={[styles.dimSection, styles.fullScreen]} />
      )}

      {/* Tooltip Card */}
      <Animated.View
        style={[
          styles.tooltipCard,
          {
            opacity: contentAnim,
            transform: [{ translateY: contentTranslateY }],
          },
          hasTarget
            ? tooltipAbove
              ? { bottom: screenHeight - targetRect.top + PADDING + 16 }
              : { top: targetRect.top + targetRect.height + PADDING + 16 }
            : { top: screenHeight * 0.3 },
        ]}
      >
        {/* Header row: icon + title + step counter */}
        <View style={styles.tooltipHeader}>
          <View style={styles.tooltipIconCircle}>
            <Ionicons
              name={step.icon || 'information-circle-outline'}
              size={18}
              color={theme.colors.primary[400]}
            />
          </View>
          <Text style={styles.tooltipTitle} numberOfLines={1}>
            {step.title}
          </Text>
          <Text style={styles.stepCounter}>
            {currentStep + 1}/{totalSteps}
          </Text>
        </View>

        {/* Description */}
        <Text style={styles.tooltipDescription}>
          {step.description}
        </Text>

        {/* Step dots */}
        {totalSteps > 1 && (
          <View style={styles.stepDots}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentStep && styles.dotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Button row */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            activeOpacity={0.6}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={onNext}
            activeOpacity={0.7}
          >
            <Text style={styles.nextText}>
              {isLastStep ? 'Got it' : 'Next'}
            </Text>
            {!isLastStep && (
              <Ionicons
                name="chevron-forward"
                size={14}
                color="#fff"
                style={{ marginLeft: 4 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  dimSection: {
    position: 'absolute',
    backgroundColor: OVERLAY_COLOR,
  },
  fullScreen: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  spotlightBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: SPOTLIGHT_BORDER_COLOR,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  tooltipCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: TOOLTIP_BG,
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 3,
    borderLeftColor: TOOLTIP_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tooltipIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary[500] + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tooltipTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: '#fff',
    flex: 1,
  },
  stepCounter: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 8,
  },
  tooltipDescription: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 21,
    marginBottom: 16,
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: theme.colors.primary[500],
    width: 20,
    borderRadius: 3,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary[500],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  nextText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: '#fff',
  },
});
