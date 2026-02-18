/**
 * SkeletonLoader Component
 *
 * Animated shimmer placeholder for loading states.
 * Replaces plain "Loading..." text with premium skeleton UI.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../theme';

function ShimmerBlock({ width, height = 16, borderRadius = 8, style }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.neutral.gray[200],
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255, 255, 255, 0.4)',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// Pre-built skeleton layouts for common patterns
export function CardSkeleton({ style }) {
  return (
    <View style={[styles.card, style]}>
      <ShimmerBlock width="60%" height={20} style={{ marginBottom: 12 }} />
      <ShimmerBlock width="90%" height={14} style={{ marginBottom: 8 }} />
      <ShimmerBlock width="40%" height={14} />
    </View>
  );
}

export function StatsSkeleton({ style }) {
  return (
    <View style={[styles.statsCard, style]}>
      <ShimmerBlock width="30%" height={16} style={{ marginBottom: 16 }} />
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <ShimmerBlock width={48} height={32} borderRadius={8} style={{ marginBottom: 8 }} />
          <ShimmerBlock width={56} height={12} />
        </View>
        <View style={styles.statItem}>
          <ShimmerBlock width={48} height={32} borderRadius={8} style={{ marginBottom: 8 }} />
          <ShimmerBlock width={56} height={12} />
        </View>
        <View style={styles.statItem}>
          <ShimmerBlock width={48} height={32} borderRadius={8} style={{ marginBottom: 8 }} />
          <ShimmerBlock width={56} height={12} />
        </View>
      </View>
    </View>
  );
}

export function ListItemSkeleton({ style }) {
  return (
    <View style={[styles.listItem, style]}>
      <ShimmerBlock width={48} height={48} borderRadius={12} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <ShimmerBlock width="70%" height={16} style={{ marginBottom: 6 }} />
        <ShimmerBlock width="40%" height={12} />
      </View>
    </View>
  );
}

export default ShimmerBlock;

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  statsCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    ...theme.shadows.sm,
  },
});
