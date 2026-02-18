/**
 * StatRing Component
 *
 * Circular progress indicator for golf stats using pure React Native.
 * No SVG dependency - uses bordered half-circle technique.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import theme from '../theme';

export default function StatRing({
  value,
  maxValue = 100,
  label,
  displayValue,
  size = 80,
  strokeWidth = 6,
  color = theme.colors.primary[500],
  backgroundColor = theme.colors.neutral.gray[200],
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const progress = value != null ? Math.min(value / maxValue, 1) : 0;

  useEffect(() => {
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const halfSize = size / 2;

  // First half rotation (0 to 0.5 progress)
  const firstHalfRotation = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '180deg', '180deg'],
    extrapolate: 'clamp',
  });

  // Second half rotation (0.5 to 1.0 progress)
  const secondHalfRotation = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '0deg', '180deg'],
    extrapolate: 'clamp',
  });

  // Opacity of second half (only visible after 50%)
  const secondHalfOpacity = animatedValue.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [0, 0, 1, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        {/* Background ring */}
        <View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: halfSize,
              borderWidth: strokeWidth,
              borderColor: backgroundColor,
            },
          ]}
        />

        {/* Right half (first 50%) */}
        <View style={[styles.halfContainer, { width: halfSize, height: size, left: halfSize }]}>
          <Animated.View
            style={[
              styles.halfCircle,
              {
                width: halfSize,
                height: size,
                borderTopRightRadius: halfSize,
                borderBottomRightRadius: halfSize,
                borderWidth: strokeWidth,
                borderLeftWidth: 0,
                borderColor: color,
                transform: [
                  { translateX: -halfSize / 2 },
                  { rotate: firstHalfRotation },
                  { translateX: halfSize / 2 },
                ],
              },
            ]}
          />
        </View>

        {/* Left half (second 50%) */}
        <Animated.View
          style={[
            styles.halfContainer,
            { width: halfSize, height: size, left: 0, opacity: secondHalfOpacity },
          ]}
        >
          <Animated.View
            style={[
              styles.halfCircle,
              {
                width: halfSize,
                height: size,
                borderTopLeftRadius: halfSize,
                borderBottomLeftRadius: halfSize,
                borderWidth: strokeWidth,
                borderRightWidth: 0,
                borderColor: color,
                transform: [
                  { translateX: halfSize / 2 },
                  { rotate: secondHalfRotation },
                  { translateX: -halfSize / 2 },
                ],
              },
            ]}
          />
        </Animated.View>

        {/* Center value */}
        <View style={[styles.centerValue, { width: size, height: size }]}>
          <Text
            style={[
              styles.valueText,
              { color, fontSize: size > 70 ? 18 : 14 },
            ]}
          >
            {displayValue ?? (value != null ? Math.round(value) : '--')}
          </Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
  },
  halfContainer: {
    position: 'absolute',
    overflow: 'hidden',
  },
  halfCircle: {
    position: 'absolute',
  },
  centerValue: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueText: {
    fontFamily: theme.fonts.bold,
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.text.secondary,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
