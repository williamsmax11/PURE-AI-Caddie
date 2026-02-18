/**
 * GlassCard Component
 *
 * Frosted glass effect card using expo-blur.
 * Creates the glassmorphism look from the inspiration designs.
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import theme from '../theme';

export default function GlassCard({
  children,
  tint = 'light', // 'light' | 'dark' | 'default'
  intensity = 50,
  borderRadius = theme.borderRadius.xl,
  style,
}) {
  // BlurView works well on iOS, needs fallback on Android
  const isIOS = Platform.OS === 'ios';

  if (isIOS) {
    return (
      <View style={[{ borderRadius, overflow: 'hidden' }, style]}>
        <BlurView
          intensity={intensity}
          tint={tint}
          style={[styles.blurContainer, { borderRadius }]}
        >
          <View style={[styles.innerContainer, { borderRadius }]}>
            {children}
          </View>
        </BlurView>
      </View>
    );
  }

  // Android fallback: semi-transparent background
  const bgColor = tint === 'dark'
    ? 'rgba(26, 31, 46, 0.85)'
    : tint === 'light'
      ? 'rgba(255, 255, 255, 0.8)'
      : 'rgba(255, 255, 255, 0.7)';

  return (
    <View
      style={[
        styles.androidFallback,
        {
          backgroundColor: bgColor,
          borderRadius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  blurContainer: {
    overflow: 'hidden',
  },
  innerContainer: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  androidFallback: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...theme.shadows.md,
  },
});
