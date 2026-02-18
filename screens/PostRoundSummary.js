/**
 * Post-Round Summary Screen
 *
 * Displays a summary of the completed round with key stats.
 * Shown after the player finishes hole 18.
 */

import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, AICaddieCard } from '../components';
import theme from '../theme';

const { width } = Dimensions.get('window');

// Display-friendly club names
function formatClubName(clubId) {
  if (!clubId) return '?';
  const mapping = {
    driver: 'Driver', '3_wood': '3 Wood', '5_wood': '5 Wood',
    '4_hybrid': '4 Hybrid', '5_hybrid': '5 Hybrid',
    '3_iron': '3 Iron', '4_iron': '4 Iron', '5_iron': '5 Iron', '6_iron': '6 Iron',
    '7_iron': '7 Iron', '8_iron': '8 Iron', '9_iron': '9 Iron',
    pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter',
  };
  return mapping[clubId] || clubId.replace(/_/g, ' ');
}

/**
 * Generate key insights from this round's shot data and scores.
 * Returns an array of { icon, text } objects.
 */
function generateRoundInsights(roundScores, roundShots) {
  const insights = [];
  if (!roundShots || roundShots.length === 0) return insights;

  // Group shots by club
  const shotsByClub = {};
  for (const shot of roundShots) {
    if (!shot.club) continue;
    if (!shotsByClub[shot.club]) shotsByClub[shot.club] = [];
    shotsByClub[shot.club].push(shot);
  }

  // 1. Driver distance insight
  const driverShots = shotsByClub['driver'] || [];
  const driverWithDist = driverShots.filter(s => s.distanceActual > 0);
  if (driverWithDist.length >= 2) {
    const avgDist = Math.round(driverWithDist.reduce((s, shot) => s + shot.distanceActual, 0) / driverWithDist.length);
    insights.push({ icon: '\uD83C\uDFCC', text: `Your driver averaged ${avgDist} yards today (${driverWithDist.length} drives).` });
  }

  // 2. Miss direction pattern
  const shotsWithOffline = roundShots.filter(s => s.distanceOffline != null && Math.abs(s.distanceOffline) > 2);
  if (shotsWithOffline.length >= 5) {
    const missRight = shotsWithOffline.filter(s => s.distanceOffline > 0).length;
    const missLeft = shotsWithOffline.filter(s => s.distanceOffline < 0).length;
    const total = shotsWithOffline.length;
    if (missRight / total >= 0.65) {
      insights.push({ icon: '\u27A1', text: `${missRight} of ${total} missed shots went right - check your alignment.` });
    } else if (missLeft / total >= 0.65) {
      insights.push({ icon: '\u2B05', text: `${missLeft} of ${total} missed shots went left - check your alignment.` });
    }
  }

  // 3. Par type performance
  const par3s = roundScores.filter(h => h.par === 3);
  const par5s = roundScores.filter(h => h.par === 5);
  if (par3s.length >= 3) {
    const par3Diff = par3s.reduce((s, h) => s + ((h.score || 0) - (h.par || 0)), 0);
    if (par3Diff <= -1) {
      insights.push({ icon: '\u2B50', text: `Great par 3 play - ${par3Diff > 0 ? '+' : ''}${par3Diff} on par 3s today!` });
    } else if (par3Diff >= 3) {
      insights.push({ icon: '\u26A0', text: `Par 3s were tough today (+${par3Diff}). Consider more center-green approaches.` });
    }
  }
  if (par5s.length >= 3) {
    const par5Diff = par5s.reduce((s, h) => s + ((h.score || 0) - (h.par || 0)), 0);
    if (par5Diff <= -1) {
      insights.push({ icon: '\u2B50', text: `Strong par 5 play - ${par5Diff > 0 ? '+' : ''}${par5Diff} on par 5s!` });
    }
  }

  // 4. Penalty strokes
  const totalPenalties = roundScores.reduce((s, h) => s + (h.penalties || 0), 0);
  const penaltyShots = roundShots.filter(s => s.result === 'water' || s.result === 'ob');
  if (totalPenalties >= 3) {
    insights.push({ icon: '\uD83D\uDEA8', text: `${totalPenalties} penalty strokes cost you today. Course management is key.` });
  } else if (totalPenalties === 0 && roundScores.length >= 9) {
    insights.push({ icon: '\u2705', text: 'Zero penalties - great course management!' });
  }

  // 5. Front vs back nine comparison
  const front = roundScores.filter(h => h.hole <= 9);
  const back = roundScores.filter(h => h.hole > 9);
  if (front.length >= 9 && back.length >= 9) {
    const frontDiff = front.reduce((s, h) => s + ((h.score || 0) - (h.par || 0)), 0);
    const backDiff = back.reduce((s, h) => s + ((h.score || 0) - (h.par || 0)), 0);
    const gap = backDiff - frontDiff;
    if (gap >= 4) {
      insights.push({ icon: '\uD83D\uDCC9', text: `You faded on the back nine (+${gap} strokes vs front). Focus on staying patient late.` });
    } else if (gap <= -3) {
      insights.push({ icon: '\uD83D\uDCC8', text: `Strong finish - ${Math.abs(gap)} strokes better on the back nine!` });
    }
  }

  // 6. Best club by GIR proximity
  const approachShots = roundShots.filter(s => s.distanceToTarget != null && s.distanceToTarget > 0 && s.club !== 'driver' && s.club !== 'putter');
  if (approachShots.length >= 3) {
    // Group by club, find best avg proximity
    const clubProx = {};
    for (const s of approachShots) {
      if (!clubProx[s.club]) clubProx[s.club] = { total: 0, count: 0 };
      clubProx[s.club].total += s.distanceToTarget;
      clubProx[s.club].count++;
    }
    let bestClub = null;
    let bestAvg = Infinity;
    for (const [club, data] of Object.entries(clubProx)) {
      if (data.count >= 2) {
        const avg = data.total / data.count;
        if (avg < bestAvg) { bestAvg = avg; bestClub = club; }
      }
    }
    if (bestClub && bestAvg < 30) {
      insights.push({ icon: '\uD83C\uDFAF', text: `${formatClubName(bestClub)} was your most accurate club - avg ${Math.round(bestAvg)} yards from the pin.` });
    }
  }

  return insights.slice(0, 5); // Cap at 5 insights
}

// Simple confetti particle component
function ConfettiParticles({ active }) {
  const particles = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      x: new Animated.Value(Math.random() * Dimensions.get('window').width),
      y: new Animated.Value(-20),
      opacity: new Animated.Value(1),
      color: [theme.colors.primary[400], theme.colors.gold.base, theme.colors.accent.amber, theme.colors.primary[300], '#fff'][i % 5],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 1500,
    }))
  ).current;

  useEffect(() => {
    if (!active) return;
    const screenH = Dimensions.get('window').height;
    particles.forEach((p) => {
      p.y.setValue(-20);
      p.opacity.setValue(1);
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.y, { toValue: screenH + 20, duration: 2500 + Math.random() * 1000, useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: 3000, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, [active]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            transform: [{ translateY: p.y }],
            opacity: p.opacity,
          }}
        />
      ))}
    </View>
  );
}

export default function PostRoundSummary({
  course,
  selectedTee,
  roundScores,
  roundShots = [],
  onDone,
}) {
  const insets = useSafeAreaInsets();

  // Compute stats from roundScores array
  const totalScore = roundScores.reduce((sum, h) => sum + (h.score || 0), 0);
  const totalPar = roundScores.reduce((sum, h) => sum + (h.par || 0), 0);
  const scoreToPar = totalScore - totalPar;
  const totalPutts = roundScores.reduce((sum, h) => sum + (h.putts || 0), 0);
  const holesPlayed = roundScores.length;

  // Front/back nine
  const frontNine = roundScores.filter((h) => h.hole <= 9);
  const backNine = roundScores.filter((h) => h.hole > 9);
  const frontScore = frontNine.reduce((sum, h) => sum + (h.score || 0), 0);
  const backScore = backNine.reduce((sum, h) => sum + (h.score || 0), 0);
  const frontPar = frontNine.reduce((sum, h) => sum + (h.par || 0), 0);
  const backPar = backNine.reduce((sum, h) => sum + (h.par || 0), 0);

  // Fairways
  const fairwayHoles = roundScores.filter((h) => h.par >= 4 && h.fairway_hit && h.fairway_hit !== 'na');
  const fairwaysHit = fairwayHoles.filter((h) => h.fairway_hit === 'hit').length;
  const fairwaysTotal = fairwayHoles.length;

  // GIR
  const girHoles = roundScores.filter((h) => h.gir !== null && h.gir !== undefined);
  const girCount = girHoles.filter((h) => h.gir === true).length;
  const girTotal = girHoles.length;

  // Score distribution
  const eagles = roundScores.filter((h) => h.score && h.par && (h.score - h.par) <= -2).length;
  const birdies = roundScores.filter((h) => h.score && h.par && (h.score - h.par) === -1).length;
  const pars = roundScores.filter((h) => h.score && h.par && (h.score - h.par) === 0).length;
  const bogeys = roundScores.filter((h) => h.score && h.par && (h.score - h.par) === 1).length;
  const doubles = roundScores.filter((h) => h.score && h.par && (h.score - h.par) === 2).length;
  const triplePlus = roundScores.filter((h) => h.score && h.par && (h.score - h.par) >= 3).length;

  // Penalties
  const totalPenalties = roundScores.reduce((sum, h) => sum + (h.penalties || 0), 0);

  // Generate insights from shot data
  const insights = useMemo(
    () => generateRoundInsights(roundScores, roundShots),
    [roundScores, roundShots]
  );

  const scoreToParDisplay = scoreToPar === 0 ? 'E' : (scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`);

  const getScoreColor = () => {
    if (scoreToPar < 0) return theme.colors.primary[500];
    if (scoreToPar === 0) return theme.colors.primary[400];
    return theme.colors.semantic.error;
  };

  // Determine if this is a "good" round worth celebrating
  const isGoodRound = scoreToPar <= 0 || eagles > 0;

  // Generate AI caddie congratulation
  const getCaddieMessage = () => {
    if (eagles > 0) return "An eagle! That's the kind of shot you'll remember forever. Pure ball striking today.";
    if (scoreToPar < -2) return "Exceptional round. Your game was firing on all cylinders today. Let's keep this momentum going.";
    if (scoreToPar < 0) return "Under par — that's solid golf. I noticed some great course management decisions out there.";
    if (scoreToPar === 0) return "Even par is always a good day. You showed great composure and made some clutch saves.";
    if (scoreToPar <= 5) return "Good round overall. A few holes got away from us, but there's a lot to build on here.";
    return "Every round is a learning opportunity. Let's look at the data and find where to improve next time.";
  };

  // Determine achievements
  const achievements = [];
  if (eagles > 0) achievements.push('Eagle Club');
  if (totalPenalties === 0 && holesPlayed >= 18) achievements.push('Clean Sheet');
  if (birdies >= 4) achievements.push('Birdie Fest');
  if (scoreToPar <= 0 && holesPlayed >= 18) achievements.push('Under Par');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ConfettiParticles active={isGoodRound} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.roundComplete}>Round Complete</Text>
          <Text style={styles.courseName}>{course?.name || 'Golf Course'}</Text>
          {selectedTee && (
            <Text style={styles.teeInfo}>{selectedTee.name} | {selectedTee.yardage} yds</Text>
          )}
        </View>

        {/* Big Score Card */}
        <LinearGradient
          colors={[theme.colors.dark.surface, theme.colors.dark.elevated]}
          style={styles.bigScoreCard}
        >
          <Text style={styles.bigScoreLabel}>Total Score</Text>
          <Text style={styles.bigScoreNumber}>{totalScore}</Text>
          <Text style={[styles.bigScoreToPar, { color: getScoreColor() }]}>
            {scoreToParDisplay}
          </Text>
          <View style={styles.nineScoreRow}>
            <View style={styles.nineScoreItem}>
              <Text style={styles.nineScoreLabel}>Front 9</Text>
              <Text style={styles.nineScoreValue}>{frontScore || '-'}</Text>
              {frontPar > 0 && (
                <Text style={styles.nineScorePar}>({frontPar})</Text>
              )}
            </View>
            <View style={styles.nineScoreDivider} />
            <View style={styles.nineScoreItem}>
              <Text style={styles.nineScoreLabel}>Back 9</Text>
              <Text style={styles.nineScoreValue}>{backScore || '-'}</Text>
              {backPar > 0 && (
                <Text style={styles.nineScorePar}>({backPar})</Text>
              )}
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
              { label: 'Eagle-', count: eagles, color: theme.colors.primary[700] },
              { label: 'Birdie', count: birdies, color: theme.colors.primary[500] },
              { label: 'Par', count: pars, color: theme.colors.primary[400] },
              { label: 'Bogey', count: bogeys, color: theme.colors.accent.amber },
              { label: 'Dbl', count: doubles, color: theme.colors.semantic.error },
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

        {/* Key Takeaways (from shot data) */}
        {insights.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Key Takeaways</Text>
            {insights.map((insight, i) => (
              <View key={i} style={styles.insightRow}>
                <Text style={styles.insightIcon}>{insight.icon}</Text>
                <Text style={styles.insightText}>{insight.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <View style={styles.achievementsCard}>
            <LinearGradient
              colors={[theme.colors.gold.base, theme.colors.gold.dark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.achievementsGradient}
            >
              <Ionicons name="trophy" size={20} color="#fff" />
              <View style={styles.achievementsContent}>
                <Text style={styles.achievementsTitle}>Achievements Unlocked</Text>
                <View style={styles.achievementsList}>
                  {achievements.map((a) => (
                    <View key={a} style={styles.achievementBadge}>
                      <Text style={styles.achievementBadgeText}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* AI Caddie Message */}
        <AICaddieCard
          message={getCaddieMessage()}
          style={{ marginBottom: theme.spacing.lg }}
        />

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
          {roundScores.map((h) => {
            const diff = (h.score || 0) - (h.par || 0);
            const scoreColor = diff < 0 ? theme.colors.primary[600] : diff === 0 ? theme.colors.text.primary : diff === 1 ? theme.colors.accent.amber : theme.colors.semantic.error;
            return (
              <View key={h.hole} style={[styles.holeByHoleRow, h.hole % 2 === 0 && styles.holeByHoleRowAlt]}>
                <Text style={[styles.holeByHoleCell, { flex: 0.5, fontFamily: theme.fonts.semibold }]}>{h.hole}</Text>
                <Text style={styles.holeByHoleCell}>{h.par || '-'}</Text>
                <Text style={[styles.holeByHoleCell, { color: scoreColor, fontFamily: theme.fonts.bold }]}>{h.score || '-'}</Text>
                <Text style={styles.holeByHoleCell}>{h.putts != null ? h.putts : '-'}</Text>
                <Text style={styles.holeByHoleCell}>
                  {h.fairway_hit === 'hit' ? '\u2714' : h.fairway_hit === 'na' ? '-' : h.fairway_hit ? '\u2718' : '-'}
                </Text>
                <Text style={[styles.holeByHoleCell, h.gir === true && { color: theme.colors.primary[600] }]}>
                  {h.gir === true ? '\u2714' : h.gir === false ? '\u2718' : '-'}
                </Text>
              </View>
            );
          })}
          {/* Totals row */}
          <View style={[styles.holeByHoleRow, styles.holeByHoleTotals]}>
            <Text style={[styles.holeByHoleCell, { flex: 0.5, fontFamily: theme.fonts.bold }]}>Tot</Text>
            <Text style={[styles.holeByHoleCell, { fontFamily: theme.fonts.bold }]}>{totalPar}</Text>
            <Text style={[styles.holeByHoleCell, { fontFamily: theme.fonts.bold, color: getScoreColor() }]}>{totalScore}</Text>
            <Text style={[styles.holeByHoleCell, { fontFamily: theme.fonts.bold }]}>{totalPutts}</Text>
            <Text style={[styles.holeByHoleCell, { fontFamily: theme.fonts.bold }]}>
              {fairwaysTotal > 0 ? `${fairwaysHit}/${fairwaysTotal}` : '-'}
            </Text>
            <Text style={[styles.holeByHoleCell, { fontFamily: theme.fonts.bold }]}>
              {girTotal > 0 ? `${girCount}/${girTotal}` : '-'}
            </Text>
          </View>
        </View>

        <View style={{ height: theme.spacing.xl }} />
      </ScrollView>

      {/* Done button */}
      <View style={styles.footer}>
        <Button
          title="Done"
          onPress={onDone}
          size="large"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
  },
  roundComplete: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    color: theme.colors.primary[500],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: theme.spacing.xs,
  },
  courseName: {
    fontFamily: theme.fonts.bold,
    fontSize: 24,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  teeInfo: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing.xs,
  },
  // Big Score Card
  bigScoreCard: {
    borderRadius: theme.borderRadius['2xl'],
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  bigScoreLabel: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.dark.text.tertiary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigScoreNumber: {
    fontFamily: theme.fonts.extrabold,
    color: '#fff',
    fontSize: 64,
    lineHeight: 72,
  },
  bigScoreToPar: {
    fontFamily: theme.fonts.bold,
    fontSize: 24,
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
    backgroundColor: theme.colors.dark.border,
  },
  nineScoreLabel: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.dark.text.tertiary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nineScoreValue: {
    fontFamily: theme.fonts.bold,
    color: '#fff',
    fontSize: 28,
    marginTop: 2,
  },
  nineScorePar: {
    fontFamily: theme.fonts.regular,
    color: theme.colors.dark.text.tertiary,
    fontSize: 12,
  },
  // Stats Grid
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
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    color: theme.colors.text.primary,
  },
  statCardLabel: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.text.tertiary,
    marginTop: 2,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Achievements
  achievementsCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  achievementsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  achievementsContent: {
    flex: 1,
  },
  achievementsTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: '#fff',
    marginBottom: theme.spacing.sm,
  },
  achievementsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  achievementBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
  },
  achievementBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: '#fff',
  },
  // Section Card
  sectionCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.md,
  },
  // Scoring Distribution
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
    fontFamily: theme.fonts.bold,
    color: '#fff',
    fontSize: 16,
  },
  scoringLabel: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.text.tertiary,
    marginTop: 4,
    fontSize: 10,
  },
  // Insights
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  insightIcon: {
    fontSize: 18,
    marginRight: theme.spacing.sm,
    marginTop: 1,
  },
  insightText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.primary,
    flex: 1,
    lineHeight: 20,
  },
  // Hole-by-Hole
  holeByHoleHeader: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  holeByHoleHeaderText: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text.tertiary,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  holeByHoleRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
  },
  holeByHoleRowAlt: {
    backgroundColor: theme.colors.neutral.gray[50],
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
    fontFamily: theme.fonts.regular,
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.text.primary,
  },
  // Footer
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.gray[200],
    backgroundColor: theme.colors.background.white,
  },
});
