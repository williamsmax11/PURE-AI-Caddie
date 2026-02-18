/**
 * Round Detail Screen
 *
 * Shows detailed stats and hole-by-hole breakdown for a single completed round.
 * Fetches data from Supabase via fetchRoundDetail().
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../theme';
import { fetchRoundDetail, fetchRoundShots } from '../services/roundService';

const { width } = Dimensions.get('window');

// Display-friendly club names from stored IDs (e.g., '7_iron' → '7 Iron')
function formatClubName(clubId) {
  if (!clubId) return '?';
  const mapping = {
    driver: 'Driver', '3_wood': '3W', '5_wood': '5W',
    '4_hybrid': '4H', '5_hybrid': '5H',
    '3_iron': '3i', '4_iron': '4i', '5_iron': '5i', '6_iron': '6i',
    '7_iron': '7i', '8_iron': '8i', '9_iron': '9i',
    pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter',
  };
  return mapping[clubId] || clubId.replace(/_/g, ' ');
}

// Result badge color
function getResultColor(result) {
  if (!result) return theme.colors.neutral.gray[400];
  const r = result.toLowerCase();
  if (r === 'fairway' || r === 'green') return '#16a34a';
  if (r.includes('rough')) return '#f59e0b';
  if (r === 'bunker') return '#d97706';
  if (r === 'water' || r === 'ob') return '#ef4444';
  return theme.colors.neutral.gray[500];
}

// Shot quality indicator color
function getQualityColor(quality) {
  if (!quality) return null;
  if (quality === 'good') return '#16a34a';
  if (quality === 'acceptable') return '#f59e0b';
  return '#ef4444';
}

export default function RoundDetailScreen({ roundId, onBack }) {
  const [round, setRound] = useState(null);
  const [shots, setShots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedHole, setExpandedHole] = useState(null);

  useEffect(() => {
    loadRound();
  }, [roundId]);

  const loadRound = async () => {
    setIsLoading(true);
    const [roundResult, shotsResult] = await Promise.all([
      fetchRoundDetail(roundId),
      fetchRoundShots(roundId),
    ]);
    setRound(roundResult.data);
    setShots(shotsResult.data || []);
    setIsLoading(false);
  };

  // Group shots by hole number
  const shotsByHole = shots.reduce((acc, shot) => {
    const h = shot.hole_number;
    if (!acc[h]) acc[h] = [];
    acc[h].push(shot);
    return acc;
  }, {});

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getScoreColor = (scoreToPar) => {
    if (scoreToPar < 0) return '#16a34a';
    if (scoreToPar === 0) return theme.colors.primary[500];
    return '#dc2626';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backText}>&#8592;</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Round Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backText}>&#8592;</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Round Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Round not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const holes = round.holes || [];
  const totalScore = round.total_score || 0;
  const totalPar = round.course_par || holes.reduce((s, h) => s + (h.par || 0), 0);
  const scoreToPar = round.score_to_par ?? (totalScore - totalPar);
  const scoreToParDisplay = scoreToPar === 0 ? 'E' : (scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`);

  const frontNine = holes.filter((h) => h.hole_number <= 9);
  const backNine = holes.filter((h) => h.hole_number > 9);
  const frontScore = round.front_nine_score || frontNine.reduce((s, h) => s + (h.score || 0), 0);
  const backScore = round.back_nine_score || backNine.reduce((s, h) => s + (h.score || 0), 0);
  const frontPar = frontNine.reduce((s, h) => s + (h.par || 0), 0);
  const backPar = backNine.reduce((s, h) => s + (h.par || 0), 0);

  const totalPutts = round.total_putts || holes.reduce((s, h) => s + (h.putts || 0), 0);
  const fairwaysHit = round.fairways_hit || 0;
  const fairwaysTotal = round.fairways_total || 0;
  const girCount = round.greens_in_reg || 0;
  const girTotal = round.greens_total || 0;
  const totalPenalties = holes.reduce((s, h) => s + (h.penalties || 0), 0);

  // Score distribution
  const eagles = holes.filter((h) => h.score && h.par && (h.score - h.par) <= -2).length;
  const birdies = holes.filter((h) => h.score && h.par && (h.score - h.par) === -1).length;
  const pars = holes.filter((h) => h.score && h.par && (h.score - h.par) === 0).length;
  const bogeys = holes.filter((h) => h.score && h.par && (h.score - h.par) === 1).length;
  const doubles = holes.filter((h) => h.score && h.par && (h.score - h.par) === 2).length;
  const triplePlus = holes.filter((h) => h.score && h.par && (h.score - h.par) >= 3).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backText}>&#8592;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Round Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Course info */}
        <View style={styles.courseInfo}>
          <Text style={styles.courseName}>{round.course?.name || 'Golf Course'}</Text>
          <Text style={styles.courseSubtitle}>
            {formatDate(round.started_at)}
          </Text>
          {round.tee_color && (
            <Text style={styles.teeInfo}>
              {round.tee_color} Tees  |  {round.tee_yardage} yds
            </Text>
          )}
        </View>

        {/* Big Score Card */}
        <LinearGradient
          colors={['#0a1f3d', '#1a365d']}
          style={styles.bigScoreCard}
        >
          <Text style={styles.bigScoreLabel}>Total Score</Text>
          <Text style={styles.bigScoreNumber}>{totalScore}</Text>
          <Text style={[styles.bigScoreToPar, { color: getScoreColor(scoreToPar) }]}>
            {scoreToParDisplay}
          </Text>
          <View style={styles.nineScoreRow}>
            <View style={styles.nineScoreItem}>
              <Text style={styles.nineScoreLabel}>Front 9</Text>
              <Text style={styles.nineScoreValue}>{frontScore || '-'}</Text>
              {frontPar > 0 && <Text style={styles.nineScorePar}>({frontPar})</Text>}
            </View>
            <View style={styles.nineScoreDivider} />
            <View style={styles.nineScoreItem}>
              <Text style={styles.nineScoreLabel}>Back 9</Text>
              <Text style={styles.nineScoreValue}>{backScore || '-'}</Text>
              {backPar > 0 && <Text style={styles.nineScorePar}>({backPar})</Text>}
            </View>
          </View>
        </LinearGradient>

        {/* Key Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statCardValue}>{totalPutts}</Text>
            <Text style={styles.statCardLabel}>Putts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCardValue}>
              {fairwaysTotal > 0 ? `${fairwaysHit}/${fairwaysTotal}` : '-'}
            </Text>
            <Text style={styles.statCardLabel}>Fairways</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCardValue}>
              {girTotal > 0 ? `${girCount}/${girTotal}` : '-'}
            </Text>
            <Text style={styles.statCardLabel}>GIR</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCardValue}>{totalPenalties}</Text>
            <Text style={styles.statCardLabel}>Penalties</Text>
          </View>
        </View>

        {/* Score Distribution */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Scoring</Text>
          <View style={styles.scoringRow}>
            {[
              { label: 'Eagle-', count: eagles, color: '#059669' },
              { label: 'Birdie', count: birdies, color: '#16a34a' },
              { label: 'Par', count: pars, color: theme.colors.primary[500] },
              { label: 'Bogey', count: bogeys, color: '#f59e0b' },
              { label: 'Dbl', count: doubles, color: '#ef4444' },
              { label: '3+', count: triplePlus, color: '#991b1b' },
            ].map(({ label, count, color }) => (
              <View key={label} style={styles.scoringItem}>
                <View style={[styles.scoringDot, { backgroundColor: color }]}>
                  <Text style={styles.scoringDotText}>{count}</Text>
                </View>
                <Text style={styles.scoringLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Hole-by-Hole */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Hole by Hole</Text>
          <View style={styles.holeByHoleHeader}>
            <Text style={[styles.holeByHoleCell, styles.holeByHoleHeaderText, { flex: 0.5 }]}>Hole</Text>
            <Text style={[styles.holeByHoleCell, styles.holeByHoleHeaderText]}>Par</Text>
            <Text style={[styles.holeByHoleCell, styles.holeByHoleHeaderText]}>Score</Text>
            <Text style={[styles.holeByHoleCell, styles.holeByHoleHeaderText]}>Putts</Text>
            <Text style={[styles.holeByHoleCell, styles.holeByHoleHeaderText]}>FIR</Text>
            <Text style={[styles.holeByHoleCell, styles.holeByHoleHeaderText]}>GIR</Text>
          </View>
          {holes.map((h) => {
            const diff = (h.score || 0) - (h.par || 0);
            const scoreColor = diff < 0 ? '#16a34a' : diff === 0 ? theme.colors.text.primary : diff === 1 ? '#f59e0b' : '#ef4444';
            const holeShots = shotsByHole[h.hole_number] || [];
            const isExpanded = expandedHole === h.hole_number;
            const hasShotData = holeShots.length > 0;

            return (
              <View key={h.hole_number}>
                <TouchableOpacity
                  activeOpacity={hasShotData ? 0.6 : 1}
                  onPress={() => hasShotData && setExpandedHole(isExpanded ? null : h.hole_number)}
                  style={[styles.holeByHoleRow, h.hole_number % 2 === 0 && styles.holeByHoleRowAlt]}
                >
                  <Text style={[styles.holeByHoleCell, { flex: 0.5, fontWeight: '600' }]}>
                    {h.hole_number}
                    {hasShotData && <Text style={styles.shotIndicator}> {isExpanded ? '\u25B2' : '\u25BC'}</Text>}
                  </Text>
                  <Text style={styles.holeByHoleCell}>{h.par || '-'}</Text>
                  <Text style={[styles.holeByHoleCell, { color: scoreColor, fontWeight: '700' }]}>
                    {h.score || '-'}
                  </Text>
                  <Text style={styles.holeByHoleCell}>
                    {h.putts != null ? h.putts : '-'}
                  </Text>
                  <Text style={styles.holeByHoleCell}>
                    {h.fairway_hit === 'hit' ? '\u2714' : h.fairway_hit === 'na' ? '-' : h.fairway_hit ? '\u2718' : '-'}
                  </Text>
                  <Text style={[styles.holeByHoleCell, h.gir === true && { color: '#16a34a' }]}>
                    {h.gir === true ? '\u2714' : h.gir === false ? '\u2718' : '-'}
                  </Text>
                </TouchableOpacity>

                {/* Shot Replay - expanded view */}
                {isExpanded && holeShots.length > 0 && (
                  <View style={styles.shotReplayContainer}>
                    {holeShots.map((shot) => (
                      <View key={shot.shot_number} style={styles.shotReplayRow}>
                        <View style={styles.shotReplayNumber}>
                          <Text style={styles.shotReplayNumberText}>{shot.shot_number}</Text>
                        </View>
                        <View style={styles.shotReplayDetails}>
                          <View style={styles.shotReplayTopRow}>
                            <Text style={styles.shotReplayClub}>{formatClubName(shot.club)}</Text>
                            {shot.distance_actual ? (
                              <Text style={styles.shotReplayDistance}>{Math.round(shot.distance_actual)} yds</Text>
                            ) : null}
                            {shot.result && (
                              <View style={[styles.shotResultBadge, { backgroundColor: getResultColor(shot.result) }]}>
                                <Text style={styles.shotResultBadgeText}>
                                  {shot.result.replace(/_/g, ' ')}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.shotReplayBottomRow}>
                            {shot.lie_type && shot.lie_type !== 'tee' && (
                              <Text style={styles.shotReplayLie}>from {shot.lie_type}</Text>
                            )}
                            {shot.distance_offline != null && Math.abs(shot.distance_offline) > 0 && (
                              <Text style={styles.shotReplayOffline}>
                                {Math.abs(shot.distance_offline).toFixed(0)}y {shot.distance_offline > 0 ? 'right' : 'left'}
                              </Text>
                            )}
                            {shot.shot_quality && (
                              <View style={[styles.shotQualityDot, { backgroundColor: getQualityColor(shot.shot_quality) }]} />
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          {/* Totals row */}
          <View style={[styles.holeByHoleRow, styles.holeByHoleTotals]}>
            <Text style={[styles.holeByHoleCell, { flex: 0.5, fontWeight: '700' }]}>Tot</Text>
            <Text style={[styles.holeByHoleCell, { fontWeight: '700' }]}>{totalPar}</Text>
            <Text style={[styles.holeByHoleCell, { fontWeight: '700', color: getScoreColor(scoreToPar) }]}>
              {totalScore}
            </Text>
            <Text style={[styles.holeByHoleCell, { fontWeight: '700' }]}>{totalPutts}</Text>
            <Text style={[styles.holeByHoleCell, { fontWeight: '700' }]}>
              {fairwaysTotal > 0 ? `${fairwaysHit}/${fairwaysTotal}` : '-'}
            </Text>
            <Text style={[styles.holeByHoleCell, { fontWeight: '700' }]}>
              {girTotal > 0 ? `${girCount}/${girTotal}` : '-'}
            </Text>
          </View>
        </View>

        {/* Weather info if available */}
        {(round.weather_temp_f || round.weather_condition) && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <Text style={styles.weatherText}>
              {round.weather_condition ? `${round.weather_condition.charAt(0).toUpperCase() + round.weather_condition.slice(1)}` : ''}
              {round.weather_temp_f ? `  |  ${round.weather_temp_f}\u00B0F` : ''}
              {round.weather_wind_mph ? `  |  ${round.weather_wind_mph} mph wind` : ''}
            </Text>
          </View>
        )}

        <View style={{ height: theme.spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 24,
    color: theme.colors.primary[500],
  },
  headerTitle: {
    ...theme.typography.styles.h3,
    fontWeight: theme.typography.weights.bold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...theme.typography.styles.body,
    color: theme.colors.text.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.xl,
  },
  courseInfo: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  courseName: {
    ...theme.typography.styles.h2,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  courseSubtitle: {
    ...theme.typography.styles.bodySmall,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing.xs,
  },
  teeInfo: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  bigScoreCard: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  bigScoreLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigScoreNumber: {
    color: '#ffffff',
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 72,
  },
  bigScoreToPar: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: -4,
  },
  nineScoreRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.lg,
    width: '100%',
    justifyContent: 'center',
  },
  nineScoreItem: {
    alignItems: 'center',
    flex: 1,
  },
  nineScoreDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  nineScoreLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nineScoreValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 2,
  },
  nineScorePar: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  statCardValue: {
    ...theme.typography.styles.h3,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.primary,
  },
  statCardLabel: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.secondary,
    marginTop: 2,
    fontSize: 10,
  },
  sectionCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    ...theme.typography.styles.label,
    fontWeight: theme.typography.weights.bold,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  scoringRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoringItem: {
    alignItems: 'center',
  },
  scoringDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoringDotText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  scoringLabel: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.secondary,
    marginTop: 4,
    fontSize: 10,
  },
  holeByHoleHeader: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  holeByHoleHeaderText: {
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.secondary,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  holeByHoleRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
  },
  holeByHoleRowAlt: {
    backgroundColor: theme.colors.background.light,
    marginHorizontal: -theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  holeByHoleTotals: {
    borderTopWidth: 2,
    borderTopColor: theme.colors.neutral.gray[300],
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  holeByHoleCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.text.primary,
  },
  weatherText: {
    ...theme.typography.styles.body,
    color: theme.colors.text.primary,
  },
  shotIndicator: {
    fontSize: 8,
    color: theme.colors.primary[500],
  },
  shotReplayContainer: {
    backgroundColor: theme.colors.background.light,
    marginHorizontal: -theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[500],
  },
  shotReplayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  shotReplayNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    marginTop: 1,
  },
  shotReplayNumberText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  shotReplayDetails: {
    flex: 1,
  },
  shotReplayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  shotReplayClub: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  shotReplayDistance: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  shotResultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  shotResultBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  shotReplayBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  shotReplayLie: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
  },
  shotReplayOffline: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  shotQualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
