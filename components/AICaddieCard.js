/**
 * AICaddieCard Component
 *
 * Distinctive dark-surface card for AI-generated content.
 * Features: animated gradient border, shimmer sweep, pulsing sparkle badge.
 * Visually separates AI insights from regular UI content.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

const BORDER_WIDTH = 1.5;
const CARD_RADIUS = theme.borderRadius.xl;
const INNER_RADIUS = CARD_RADIUS - BORDER_WIDTH;

export default function AICaddieCard({
  title,
  children,
  style,
  compact = false,
}) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Shimmer: pause, sweep left-to-right, reset, repeat
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(4000),
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    shimmerLoop.start();

    // Sparkle icon: breathe (scale + opacity)
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    );
    glowLoop.start();

    return () => {
      shimmerLoop.stop();
      glowLoop.stop();
    };
  }, []);

  const screenWidth = Dimensions.get('window').width;
  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenWidth * 0.6, screenWidth],
  });

  // Sparkle icon: scale breathe + color shift via opacity layering
  const sparkleScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const sparkleOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 1, 0.6],
  });
  // Teal layer fades in as green layer fades, creating a color shift
  const tealOpacity = glowAnim;
  const greenOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const radius = compact ? theme.borderRadius.lg : CARD_RADIUS;
  const innerRadius = compact ? theme.borderRadius.lg - BORDER_WIDTH : INNER_RADIUS;

  return (
    <View style={[styles.outerWrapper, compact && styles.outerWrapperCompact, style]}>
      {/* Gradient border — fills the outer wrapper, visible through the margin gap */}
      <LinearGradient
        colors={[
          theme.colors.primary[400],
          theme.colors.accent.teal,
          theme.colors.primary[500],
          theme.colors.accent.teal,
          theme.colors.primary[400],
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />

      {/* Inner card with dark background */}
      <View style={[styles.innerCard, { borderRadius: innerRadius }]}>
        {/* Shimmer sweep */}
        <Animated.View
          style={[
            styles.shimmerLayer,
            { transform: [{ translateX: shimmerTranslateX }] },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(255, 255, 255, 0.04)',
              'rgba(255, 255, 255, 0.10)',
              'rgba(255, 255, 255, 0.04)',
              'transparent',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>

        {/* Card content */}
        <View style={styles.content}>
          {/* Badge + title row */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Animated.View style={{ transform: [{ scale: sparkleScale }], opacity: sparkleOpacity }}>
                <Animated.View style={{ opacity: greenOpacity, position: 'absolute' }}>
                  <Ionicons name="sparkles" size={12} color={theme.colors.primary[400]} />
                </Animated.View>
                <Animated.View style={{ opacity: tealOpacity }}>
                  <Ionicons name="sparkles" size={12} color={theme.colors.accent.teal} />
                </Animated.View>
              </Animated.View>
              <Text style={styles.badgeText}>Pure AI</Text>
            </View>
            {title && <Text style={styles.title}>{title}</Text>}
          </View>

          {/* Body */}
          <View style={styles.body}>
            {typeof children === 'string' ? (
              <Text style={styles.bodyText}>{children}</Text>
            ) : (
              children
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  outerWrapperCompact: {
    borderRadius: theme.borderRadius.lg,
  },
  innerCard: {
    margin: BORDER_WIDTH,
    backgroundColor: theme.colors.dark.card,
    borderRadius: INNER_RADIUS,
    overflow: 'hidden',
  },
  shimmerLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '60%',
    zIndex: 1,
  },
  shimmerGradient: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    zIndex: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    gap: 4,
    overflow: 'visible',
  },
  badgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: theme.colors.primary[400],
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.dark.text.secondary,
  },
  body: {
    // Content goes here
  },
  bodyText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.dark.text.primary,
    lineHeight: 22,
  },
});
