/**
 * RecentRoundCard Component
 *
 * Compact card for displaying a recent round in a horizontal scroll.
 * Shows course name, score (with par-relative color), and date.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PressableScale from './PressableScale';
import theme from '../theme';

export default function RecentRoundCard({
  courseName,
  score,
  par,
  date,
  onPress,
}) {
  const diff = score && par ? score - par : null;
  const scoreColor = getScoreColor(diff);
  const scoreLabel = getScoreLabel(diff);

  // Format date string
  const formattedDate = formatDate(date);

  return (
    <PressableScale onPress={onPress} haptic="light">
      <View style={styles.container}>
        {/* Score badge */}
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '18' }]}>
          <Text style={[styles.scoreText, { color: scoreColor }]}>
            {score || '--'}
          </Text>
          {scoreLabel && (
            <Text style={[styles.scoreLabel, { color: scoreColor }]}>
              {scoreLabel}
            </Text>
          )}
        </View>

        {/* Course info */}
        <Text style={styles.courseName} numberOfLines={1}>
          {courseName || 'Course'}
        </Text>
        <Text style={styles.date}>{formattedDate}</Text>
      </View>
    </PressableScale>
  );
}

function getScoreColor(diff) {
  if (diff == null) return theme.colors.text.tertiary;
  if (diff <= -2) return theme.golfTheme?.score?.eagle || '#9333ea';
  if (diff === -1) return theme.colors.primary[500];
  if (diff === 0) return theme.colors.primary[600];
  if (diff <= 2) return theme.colors.accent.amber;
  return theme.colors.semantic?.error || '#ef4444';
}

function getScoreLabel(diff) {
  if (diff == null) return null;
  if (diff < 0) return `${diff}`;
  if (diff === 0) return 'E';
  return `+${diff}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    width: 140,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  scoreBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  scoreText: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
  },
  scoreLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 10,
    marginTop: -2,
  },
  courseName: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: 2,
  },
  date: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.text.tertiary,
  },
});
