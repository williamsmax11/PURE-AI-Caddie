/**
 * Player Insights Screen
 *
 * Shows the player's measured club stats, tendencies, and strengths/weaknesses.
 * Accessible from Home screen or Settings. Data comes from user_club_stats and
 * user_tendencies tables, computed by shotAnalyticsService after each round.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../theme';
import { StatRing } from '../components';
import { useTraining } from '../components/TrainingProvider';
import TrainingOverlay from '../components/TrainingOverlay';
import { loadPlayerInsights } from '../services/playerInsightsService';

const { width } = Dimensions.get('window');

const CLUB_ORDER = [
  'driver', '3_wood', '5_wood',
  '4_hybrid', '5_hybrid',
  '3_iron', '4_iron', '5_iron', '6_iron', '7_iron', '8_iron', '9_iron',
  'pw', 'gw', 'sw', 'lw',
];

const CLUB_DISPLAY = {
  driver: 'Driver',
  '3_wood': '3 Wood',
  '5_wood': '5 Wood',
  '4_hybrid': '4 Hybrid',
  '5_hybrid': '5 Hybrid',
  '3_iron': '3 Iron',
  '4_iron': '4 Iron',
  '5_iron': '5 Iron',
  '6_iron': '6 Iron',
  '7_iron': '7 Iron',
  '8_iron': '8 Iron',
  '9_iron': '9 Iron',
  pw: 'PW',
  gw: 'GW',
  sw: 'SW',
  lw: 'LW',
};

export default function PlayerInsightsScreen({ userId, onBack }) {
  const insets = useSafeAreaInsets();
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedClub, setExpandedClub] = useState(null);
  const { trainingOverlayProps, triggerTraining } = useTraining('playerInsights');

  useEffect(() => {
    loadData();
  }, []);

  // Trigger training overlay on first visit (after data loads)
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => triggerTraining(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const loadData = async () => {
    setIsLoading(true);
    const result = await loadPlayerInsights(userId, true); // Force refresh
    setInsights(result);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Header onBack={onBack} insets={insets} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        </View>
      </View>
    );
  }

  const { clubStats, tendencies, dataQuality } = insights || {};
  const noData = !dataQuality || dataQuality.dataLevel === 'none';

  // Compute key stat ring values
  const firPct = (() => {
    const rangeTs = (tendencies || []).filter(t => t.type === 'distance_range' && t.confidence >= 0.3);
    const total = rangeTs.reduce((s, t) => s + (t.data?.totalShots || 0), 0);
    const girHits = rangeTs.reduce((s, t) => s + (t.data?.girHits || 0), 0);
    return total > 0 ? Math.round((girHits / total) * 100) : null;
  })();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Header onBack={onBack} insets={insets} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Data Quality Banner */}
        <DataQualityBanner dataQuality={dataQuality} />

        {/* Quick Stat Rings */}
        {!noData && dataQuality?.totalRounds >= 3 && (
          <View style={styles.statRingsRow}>
            <View style={styles.statRingItem}>
              <StatRing
                value={dataQuality.totalRounds}
                maxValue={50}
                size={70}
                strokeWidth={6}
                color={theme.colors.primary[500]}
                label="Rounds"
              />
            </View>
            <View style={styles.statRingItem}>
              <StatRing
                value={dataQuality.totalShots}
                maxValue={Math.max(dataQuality.totalShots, 500)}
                size={70}
                strokeWidth={6}
                color={theme.colors.secondary[500]}
                label="Shots"
              />
            </View>
            {firPct !== null && (
              <View style={styles.statRingItem}>
                <StatRing
                  value={firPct}
                  maxValue={100}
                  size={70}
                  strokeWidth={6}
                  color={theme.colors.accent.emerald}
                  label="GIR %"
                  suffix="%"
                />
              </View>
            )}
          </View>
        )}

        {noData ? (
          <EmptyState />
        ) : (
          <>
            {/* Club Performance Cards */}
            <SectionTitle title="Club Performance" icon="golf-outline" />
            {CLUB_ORDER.filter(id => clubStats?.[id]).map(clubId => (
              <ClubCard
                key={clubId}
                clubId={clubId}
                stats={clubStats[clubId]}
                expanded={expandedClub === clubId}
                onPress={() => setExpandedClub(expandedClub === clubId ? null : clubId)}
              />
            ))}

            {/* Tendencies */}
            {tendencies && tendencies.length > 0 && (
              <>
                <SectionTitle title="Your Game at a Glance" icon="analytics-outline" />
                {tendencies
                  .filter(t => t.confidence >= 0.3)
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((tendency, i) => (
                    <TendencyCard key={`${tendency.type}_${tendency.key}`} tendency={tendency} index={i} />
                  ))
                }
              </>
            )}

            {/* Strengths & Weaknesses */}
            <StrengthsWeaknesses clubStats={clubStats} tendencies={tendencies} />
          </>
        )}
      </ScrollView>
      <TrainingOverlay {...trainingOverlayProps} />
    </View>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function Header({ onBack, insets }) {
  return (
    <LinearGradient
      colors={[theme.colors.primary[700], theme.colors.primary[600]]}
      style={[styles.headerGradient, { paddingTop: (insets?.top || 0) + theme.spacing.sm }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Player Insights</Text>
        <View style={{ width: 40 }} />
      </View>
    </LinearGradient>
  );
}

function DataQualityBanner({ dataQuality }) {
  if (!dataQuality) return null;

  const levels = {
    none: { color: theme.colors.text.tertiary, label: 'No Data', desc: 'Play your first round to start tracking' },
    minimal: { color: theme.colors.accent.amber, label: 'Getting Started', desc: `${dataQuality.totalRounds} round${dataQuality.totalRounds !== 1 ? 's' : ''}, ${dataQuality.totalShots} shots tracked` },
    moderate: { color: theme.colors.secondary[500], label: 'Building Profile', desc: `${dataQuality.totalRounds} rounds, ${dataQuality.totalShots} shots - recommendations improving` },
    strong: { color: theme.colors.primary[500], label: 'Fully Personalized', desc: `${dataQuality.totalRounds} rounds, ${dataQuality.totalShots} shots - AI-powered recommendations active` },
  };

  const info = levels[dataQuality.dataLevel] || levels.none;

  return (
    <View style={[styles.qualityBanner, { borderLeftColor: info.color }]}>
      <View style={styles.qualityRow}>
        <View style={[styles.qualityDot, { backgroundColor: info.color }]} />
        <Text style={[styles.qualityLabel, { color: info.color }]}>{info.label}</Text>
      </View>
      <Text style={styles.qualityDesc}>{info.desc}</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="analytics-outline" size={48} color={theme.colors.neutral.gray[300]} />
      <Text style={styles.emptyTitle}>No Insights Yet</Text>
      <Text style={styles.emptyDesc}>
        Play a round and log your shots to start building your player profile. The more you play, the smarter your caddie gets.
      </Text>
    </View>
  );
}

function SectionTitle({ title, icon }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={16} color={theme.colors.text.secondary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ClubCard({ clubId, stats, expanded, onPress }) {
  const missDir = stats.avgOffline != null
    ? (stats.avgOffline > 2 ? 'R' : stats.avgOffline < -2 ? 'L' : '-')
    : '-';
  const missColor = missDir === '-' ? theme.colors.primary[500] : theme.colors.accent.amber;

  return (
    <TouchableOpacity style={styles.clubCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.clubCardHeader}>
        <Text style={styles.clubName}>{CLUB_DISPLAY[clubId] || clubId}</Text>
        <View style={styles.clubCardRight}>
          <Text style={styles.clubAvgDist}>{Math.round(stats.avgDistance)}y</Text>
          <View style={[styles.missBadge, { backgroundColor: missColor + '20' }]}>
            <Text style={[styles.missBadgeText, { color: missColor }]}>{missDir}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.text.tertiary} />
        </View>
      </View>

      {expanded && (
        <View style={styles.clubCardExpanded}>
          <View style={styles.clubStatRow}>
            <ClubStat label="Avg" value={`${Math.round(stats.avgDistance)}y`} />
            <ClubStat label="Med" value={`${Math.round(stats.medianDistance)}y`} />
            <ClubStat label="Range" value={`${stats.minDistance}-${stats.maxDistance}`} />
            <ClubStat label="Shots" value={`${stats.totalShots}`} />
          </View>
          {stats.avgOffline != null && (
            <View style={styles.clubStatRow}>
              <ClubStat label="Avg Miss" value={`${Math.abs(stats.avgOffline).toFixed(1)}y ${stats.avgOffline > 0 ? 'R' : 'L'}`} />
              <ClubStat label="Left" value={`${stats.missLeftPct}%`} />
              <ClubStat label="Right" value={`${stats.missRightPct}%`} />
              <ClubStat label="Dispersion" value={stats.dispersionRadius ? `${stats.dispersionRadius}y` : '--'} />
            </View>
          )}
          {stats.last10Avg && (
            <View style={styles.trendRow}>
              <Ionicons
                name={stats.last10Avg >= stats.avgDistance ? 'trending-up' : 'trending-down'}
                size={14}
                color={stats.last10Avg >= stats.avgDistance ? theme.colors.primary[500] : theme.colors.semantic.error}
              />
              <Text style={styles.trendText}>
                Last 10: {Math.round(stats.last10Avg)}y ({stats.last10Avg >= stats.avgDistance ? '+' : ''}{Math.round(stats.last10Avg - stats.avgDistance)}y vs avg)
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function ClubStat({ label, value }) {
  return (
    <View style={styles.clubStatItem}>
      <Text style={styles.clubStatValue}>{value}</Text>
      <Text style={styles.clubStatLabel}>{label}</Text>
    </View>
  );
}

function TendencyCard({ tendency, index }) {
  const icons = {
    club_bias: 'golf-outline',
    distance_range: 'resize-outline',
    condition: 'cloud-outline',
    scoring: 'trophy-outline',
    situational: 'flag-outline',
    hole_type: 'map-outline',
  };

  const confidenceColor = tendency.confidence >= 0.7 ? theme.colors.primary[500] : tendency.confidence >= 0.5 ? theme.colors.accent.amber : theme.colors.text.tertiary;

  return (
    <View style={styles.tendencyCard}>
      <View style={styles.tendencyIcon}>
        <Ionicons name={icons[tendency.type] || 'information-circle-outline'} size={18} color={theme.colors.primary[500]} />
      </View>
      <View style={styles.tendencyContent}>
        <Text style={styles.tendencyText}>{tendency.data?.description || `${tendency.type}: ${tendency.key}`}</Text>
        <View style={styles.tendencyMeta}>
          <View style={[styles.confidenceBar, { width: `${tendency.confidence * 100}%`, backgroundColor: confidenceColor }]} />
          <Text style={styles.tendencySample}>{tendency.sampleSize} shots</Text>
        </View>
      </View>
    </View>
  );
}

function StrengthsWeaknesses({ clubStats, tendencies }) {
  if (!clubStats || !tendencies) return null;

  const strengths = [];
  const weaknesses = [];

  // Analyze distance ranges
  const rangeTs = (tendencies || []).filter(t => t.type === 'distance_range' && t.confidence >= 0.3);
  for (const t of rangeTs) {
    const gir = t.data?.girPct;
    if (gir >= 60) strengths.push(`${gir}% GIR from ${t.data?.range}y`);
    if (gir <= 30 && t.data?.totalShots >= 8) weaknesses.push(`Only ${gir}% GIR from ${t.data?.range}y`);
  }

  // Analyze club biases
  const biasTs = (tendencies || []).filter(t => t.type === 'club_bias' && t.confidence >= 0.5);
  for (const t of biasTs) {
    if (t.data?.yards > 10) {
      weaknesses.push(t.data?.description);
    }
  }

  // Condition tendencies
  const windT = (tendencies || []).find(t => t.key === 'wind_over_15' && t.confidence >= 0.5);
  if (windT) weaknesses.push(windT.data?.description);

  if (strengths.length === 0 && weaknesses.length === 0) return null;

  return (
    <View style={styles.swSection}>
      {strengths.length > 0 && (
        <>
          <SectionTitle title="Strengths" icon="checkmark-circle-outline" />
          {strengths.map((s, i) => (
            <View key={`s_${i}`} style={styles.swRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary[500]} />
              <Text style={styles.swText}>{s}</Text>
            </View>
          ))}
        </>
      )}
      {weaknesses.length > 0 && (
        <>
          <SectionTitle title="Areas to Improve" icon="alert-circle-outline" />
          {weaknesses.map((w, i) => (
            <View key={`w_${i}`} style={styles.swRow}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.accent.amber} />
              <Text style={styles.swText}>{w}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.base,
    paddingBottom: theme.spacing['3xl'],
  },

  // Stat Rings
  statRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  statRingItem: {
    alignItems: 'center',
  },

  // Data Quality Banner
  qualityBanner: {
    backgroundColor: theme.colors.neutral.gray[50],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.lg,
    borderLeftWidth: 4,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  qualityLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
  },
  qualityDesc: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    marginLeft: 14,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['5xl'],
    paddingHorizontal: theme.spacing['2xl'],
  },
  emptyTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.primary,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.sm,
  },
  emptyDesc: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Section Title
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // Club Card
  clubCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
    overflow: 'hidden',
  },
  clubCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
  },
  clubName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  clubCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clubAvgDist: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.primary[600],
  },
  missBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  missBadgeText: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
  },
  clubCardExpanded: {
    paddingHorizontal: theme.spacing.base,
    paddingBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.gray[100],
  },
  clubStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  clubStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  clubStatValue: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  clubStatLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    color: theme.colors.text.tertiary,
    marginTop: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.gray[100],
  },
  trendText: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.secondary,
  },

  // Tendency Card
  tendencyCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
    gap: 10,
  },
  tendencyIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tendencyContent: {
    flex: 1,
  },
  tendencyText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.primary,
    marginBottom: 6,
  },
  tendencyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceBar: {
    height: 3,
    borderRadius: 2,
    maxWidth: 60,
  },
  tendencySample: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    color: theme.colors.text.tertiary,
  },

  // Strengths / Weaknesses
  swSection: {
    marginTop: theme.spacing.sm,
  },
  swRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  swText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.primary,
    flex: 1,
  },
});
