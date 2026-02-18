/**
 * StatsSummaryCard Component
 *
 * Displays a summary of user golf statistics with animated numbers
 * and Inter typography for a premium look.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import AnimatedNumber from './AnimatedNumber';
import theme from '../theme';

export default function StatsSummaryCard({
  handicap,
  avgScore,
  roundsPlayed,
  onPress,
}) {
  const hasStats = roundsPlayed > 0;

  return (
    <PressableScale onPress={onPress} haptic="light">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Stats</Text>
          <View style={styles.viewMore}>
            <Text style={styles.viewMoreText}>View All</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.colors.primary[500]}
            />
          </View>
        </View>

        {hasStats ? (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <AnimatedNumber
                value={handicap}
                decimals={1}
                style={styles.statValue}
              />
              <Text style={styles.statLabel}>Handicap</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statItem}>
              <AnimatedNumber
                value={avgScore != null ? Math.round(avgScore) : null}
                style={styles.statValue}
              />
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statItem}>
              <AnimatedNumber
                value={roundsPlayed}
                style={styles.statValue}
              />
              <Text style={styles.statLabel}>Rounds</Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons
              name="golf-outline"
              size={32}
              color={theme.colors.text.tertiary}
            />
            <Text style={styles.emptyText}>
              Complete your first round to see stats
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.md,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  viewMore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewMoreText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.primary[500],
    marginRight: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    color: theme.colors.primary[600],
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.neutral.gray[200],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  emptyText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});
