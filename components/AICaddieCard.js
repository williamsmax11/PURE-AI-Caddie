/**
 * AICaddieCard Component
 *
 * Distinctive dark-surface card for AI-generated content.
 * Visually separates AI insights from regular UI content.
 * Features: dark background, green accent border, "Pure AI" badge.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

export default function AICaddieCard({
  title,
  children,
  style,
  compact = false,
}) {
  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {/* Green accent border on left */}
      <LinearGradient
        colors={[theme.colors.primary[400], theme.colors.primary[600]]}
        style={styles.accentBorder}
      />

      <View style={styles.content}>
        {/* AI Badge */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={12} color={theme.colors.primary[400]} />
            <Text style={styles.badgeText}>Pure AI</Text>
          </View>
          {title && <Text style={styles.title}>{title}</Text>}
        </View>

        {/* Card Content */}
        <View style={styles.body}>
          {typeof children === 'string' ? (
            <Text style={styles.bodyText}>{children}</Text>
          ) : (
            children
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.card,
    borderRadius: theme.borderRadius.xl,
    flexDirection: 'row',
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  containerCompact: {
    borderRadius: theme.borderRadius.lg,
  },
  accentBorder: {
    width: 3,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
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
