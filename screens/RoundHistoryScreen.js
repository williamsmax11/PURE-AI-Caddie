/**
 * Round History Screen
 *
 * Shows overall stats (handicap, avg score, best score, etc.)
 * and a scrollable list of all completed rounds.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../theme';
import { fetchRoundHistory } from '../services/roundService';

const { width } = Dimensions.get('window');

export default function RoundHistoryScreen({ userId, onBack, onSelectRound }) {
  const insets = useSafeAreaInsets();
  const [rounds, setRounds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRounds();
  }, []);

  const loadRounds = async () => {
    setIsLoading(true);
    const { data } = await fetchRoundHistory(userId, 50);
    setRounds(data || []);
    setIsLoading(false);
  };

  // Compute overall stats from all rounds
  const computeStats = () => {
    if (rounds.length === 0) {
      return {
        roundsPlayed: 0,
        avgScore: '-',
        bestScore: '-',
        avgPutts: '-',
        handicap: '-',
        firPct: '-',
        girPct: '-',
      };
    }

    const totalScores = rounds.map((r) => r.total_score).filter(Boolean);
    const avgScore = totalScores.length > 0
      ? (totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(1)
      : '-';
    const bestScore = totalScores.length > 0 ? Math.min(...totalScores) : '-';

    const totalPutts = rounds.map((r) => r.total_putts).filter(Boolean);
    const avgPutts = totalPutts.length > 0
      ? (totalPutts.reduce((a, b) => a + b, 0) / totalPutts.length).toFixed(1)
      : '-';

    // Handicap estimate: best 8 of last 20 differentials
    // Differential = (score - rating) * 113 / slope
    const differentials = rounds
      .filter((r) => r.total_score && r.tee_rating && r.tee_slope)
      .slice(0, 20)
      .map((r) => ((r.total_score - r.tee_rating) * 113) / r.tee_slope);

    let handicap = '-';
    if (differentials.length >= 3) {
      const sorted = [...differentials].sort((a, b) => a - b);
      const count = Math.min(8, Math.ceil(sorted.length * 0.4));
      const best = sorted.slice(0, Math.max(count, 1));
      const avg = best.reduce((a, b) => a + b, 0) / best.length;
      handicap = Math.max(0, avg).toFixed(1);
    }

    // FIR%
    const firRounds = rounds.filter((r) => r.fairways_total > 0);
    const firPct = firRounds.length > 0
      ? Math.round(
          (firRounds.reduce((s, r) => s + r.fairways_hit, 0) /
            firRounds.reduce((s, r) => s + r.fairways_total, 0)) *
            100
        ) + '%'
      : '-';

    // GIR%
    const girRounds = rounds.filter((r) => r.greens_total > 0);
    const girPct = girRounds.length > 0
      ? Math.round(
          (girRounds.reduce((s, r) => s + r.greens_in_reg, 0) /
            girRounds.reduce((s, r) => s + r.greens_total, 0)) *
            100
        ) + '%'
      : '-';

    return {
      roundsPlayed: rounds.length,
      avgScore,
      bestScore,
      avgPutts,
      handicap,
      firPct,
      girPct,
    };
  };

  const stats = computeStats();

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getScoreToParDisplay = (scoreToPar) => {
    if (scoreToPar == null) return '-';
    if (scoreToPar === 0) return 'E';
    return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
  };

  const getScoreToParColor = (scoreToPar) => {
    if (scoreToPar == null) return theme.colors.text.primary;
    if (scoreToPar < 0) return theme.colors.primary[600];
    if (scoreToPar === 0) return theme.colors.primary[500];
    return theme.colors.semantic.error;
  };

  const renderRoundItem = ({ item }) => (
    <TouchableOpacity
      style={styles.roundCard}
      onPress={() => onSelectRound(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.roundCardLeft}>
        <Text style={styles.roundCourseName}>
          {item.course?.name || 'Unknown Course'}
        </Text>
        <Text style={styles.roundMeta}>
          {formatDate(item.started_at)}
          {item.tee_color ? `  |  ${item.tee_color} Tees` : ''}
          {item.holes_played ? `  |  ${item.holes_played} holes` : ''}
        </Text>
      </View>
      <View style={styles.roundCardRight}>
        <Text style={styles.roundScore}>{item.total_score || '-'}</Text>
        <Text style={[styles.roundScoreToPar, { color: getScoreToParColor(item.score_to_par) }]}>
          {getScoreToParDisplay(item.score_to_par)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Compute scoring trend data (last 10 rounds, reversed so oldest is left)
  const trendData = rounds
    .filter(r => r.score_to_par != null)
    .slice(0, 10)
    .reverse();

  const renderHeader = () => (
    <>
      {/* Stats Overview */}
      <LinearGradient
        colors={[theme.colors.dark.surface, theme.colors.dark.elevated]}
        style={styles.statsCard}
      >
        <View style={styles.statsTopRow}>
          <View style={styles.statHighlight}>
            <Text style={styles.statHighlightValue}>{stats.handicap}</Text>
            <Text style={styles.statHighlightLabel}>Handicap</Text>
          </View>
          <View style={styles.statsTopDivider} />
          <View style={styles.statHighlight}>
            <Text style={styles.statHighlightValue}>{stats.avgScore}</Text>
            <Text style={styles.statHighlightLabel}>Avg Score</Text>
          </View>
          <View style={styles.statsTopDivider} />
          <View style={styles.statHighlight}>
            <Text style={styles.statHighlightValue}>{stats.bestScore}</Text>
            <Text style={styles.statHighlightLabel}>Best</Text>
          </View>
        </View>

        <View style={styles.statsDivider} />

        <View style={styles.statsBottomRow}>
          <View style={styles.statSmall}>
            <Text style={styles.statSmallValue}>{stats.roundsPlayed}</Text>
            <Text style={styles.statSmallLabel}>Rounds</Text>
          </View>
          <View style={styles.statSmall}>
            <Text style={styles.statSmallValue}>{stats.avgPutts}</Text>
            <Text style={styles.statSmallLabel}>Avg Putts</Text>
          </View>
          <View style={styles.statSmall}>
            <Text style={styles.statSmallValue}>{stats.firPct}</Text>
            <Text style={styles.statSmallLabel}>FIR%</Text>
          </View>
          <View style={styles.statSmall}>
            <Text style={styles.statSmallValue}>{stats.girPct}</Text>
            <Text style={styles.statSmallLabel}>GIR%</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Scoring Trend Mini-Chart */}
      {trendData.length >= 3 && (
        <View style={styles.trendCard}>
          <Text style={styles.trendTitle}>Scoring Trend</Text>
          <Text style={styles.trendSubtitle}>Last {trendData.length} rounds vs par</Text>
          <View style={styles.trendChart}>
            {/* Zero line (par) */}
            <View style={styles.trendZeroLine} />
            <View style={styles.trendBars}>
              {trendData.map((round, index) => {
                const scoreToPar = round.score_to_par;
                const maxBar = 12; // max visual height in the chart
                const barHeight = Math.min(Math.abs(scoreToPar), maxBar);
                const isUnder = scoreToPar < 0;
                const isEven = scoreToPar === 0;
                const barColor = isUnder
                  ? theme.colors.primary[500]
                  : isEven
                    ? theme.colors.primary[300]
                    : theme.colors.semantic.error;

                return (
                  <View key={round.id || index} style={styles.trendBarCol}>
                    {/* Bar above or below the zero line */}
                    <View style={styles.trendBarWrapper}>
                      {!isUnder && (
                        <View
                          style={[
                            styles.trendBar,
                            {
                              height: isEven ? 3 : barHeight * 4,
                              backgroundColor: barColor,
                              borderRadius: 3,
                            },
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.trendBarWrapper}>
                      {isUnder && (
                        <View
                          style={[
                            styles.trendBar,
                            {
                              height: barHeight * 4,
                              backgroundColor: barColor,
                              borderRadius: 3,
                            },
                          ]}
                        />
                      )}
                    </View>
                    <Text style={styles.trendBarLabel}>
                      {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Section title */}
      <Text style={styles.sectionTitle}>PAST ROUNDS</Text>
    </>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No rounds yet</Text>
      <Text style={styles.emptySubtitle}>
        Complete a round to see your stats and history here.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header with gradient */}
      <LinearGradient
        colors={[theme.colors.primary[700], theme.colors.primary[600]]}
        style={[styles.headerGradient, { paddingTop: insets.top + theme.spacing.sm }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Round History</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={rounds}
          renderItem={renderRoundItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  // Header
  headerGradient: {
    paddingBottom: theme.spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  // Stats card
  statsCard: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  statsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statsTopDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.dark.border,
  },
  statHighlight: {
    alignItems: 'center',
    flex: 1,
  },
  statHighlightValue: {
    fontFamily: theme.fonts.extrabold,
    color: '#fff',
    fontSize: 32,
  },
  statHighlightLabel: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.dark.text.tertiary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  statsDivider: {
    height: 1,
    backgroundColor: theme.colors.dark.border,
    marginVertical: theme.spacing.lg,
  },
  statsBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statSmall: {
    alignItems: 'center',
  },
  statSmallValue: {
    fontFamily: theme.fonts.bold,
    color: '#fff',
    fontSize: 18,
  },
  statSmallLabel: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.dark.text.tertiary,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  // Scoring Trend Chart
  trendCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  trendTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  trendSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  trendChart: {
    height: 100,
    position: 'relative',
    justifyContent: 'center',
  },
  trendZeroLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '45%',
    height: 1,
    backgroundColor: theme.colors.neutral.gray[200],
  },
  trendBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flex: 1,
  },
  trendBarCol: {
    alignItems: 'center',
    flex: 1,
  },
  trendBarWrapper: {
    height: 36,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBar: {
    width: 14,
    minHeight: 3,
  },
  trendBarLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 9,
    color: theme.colors.text.tertiary,
    marginTop: 4,
  },
  // Section title
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.md,
  },
  // Round cards
  roundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  roundCardLeft: {
    flex: 1,
  },
  roundCourseName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  roundMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  roundCardRight: {
    alignItems: 'center',
    marginLeft: theme.spacing.md,
  },
  roundScore: {
    fontFamily: theme.fonts.extrabold,
    fontSize: 28,
    color: theme.colors.text.primary,
  },
  roundScoreToPar: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    marginTop: -2,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing['5xl'],
  },
  emptyTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
});
