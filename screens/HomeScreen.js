/**
 * HomeScreen Component
 *
 * Main home screen for Pure featuring:
 * - Hero section with time-of-day dynamic gradient and weather
 * - Quick action cards (Start Round, Resume Round)
 * - AI Tip of the Day card
 * - Stat rings (Handicap, Avg Score, Rounds)
 * - Recent rounds horizontal scroll
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import theme from '../theme';
import {
  HeroSection,
  QuickActionCard,
  StatsSummaryCard,
  AICaddieCard,
  StatRing,
  RecentRoundCard,
} from '../components';
import { useTraining } from '../components/TrainingProvider';
import TrainingOverlay from '../components/TrainingOverlay';
import { fetchRoundHistory } from '../services/roundService';
import { calculateHandicap } from '../utils/handicapUtils';

const golfHeroImage = require('../assets/golf-ball-and-hole.jpg');
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Contextual AI tips based on user's stats
function getAITip(stats) {
  if (!stats || stats.roundsPlayed === 0) {
    return "Welcome to Pure. Start your first round and I'll begin learning your game to give personalized advice.";
  }

  const tips = [];

  if (stats.handicap != null) {
    if (stats.handicap > 20) {
      tips.push("Focus on keeping the ball in play off the tee. Course management beats distance for breaking 90.");
    } else if (stats.handicap > 10) {
      tips.push("Your short game is where the biggest scoring gains are. Prioritize 100-yard and in practice.");
    } else {
      tips.push("At your level, putting makes the difference. Track your putts per round and work on lag putting.");
    }
  }

  if (stats.daysSinceLastRound > 14) {
    tips.push("It's been a while since your last round. Start with tempo — smooth swings will help shake off the rust.");
  } else if (stats.roundsThisWeek >= 3) {
    tips.push("You're playing a lot this week. Stay loose and hydrated — fatigue affects your short game first.");
  }

  if (stats.avgScore != null && stats.avgScore > 95) {
    tips.push("Try the 'bogey golf' mindset: play for the center of every green. Eliminate the big numbers first.");
  }

  return tips[Math.floor(Math.random() * tips.length)] ||
    "Stay patient out there. The best rounds happen when you trust your swing and commit to your targets.";
}

export default function HomeScreen({
  userProfile,
  userId,
  inProgressRound,
  onStartRound,
  onResumeRound,
  onOpenRoundHistory,
}) {
  const [stats, setStats] = useState(null);
  const [recentRounds, setRecentRounds] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { trainingOverlayProps, triggerTraining } = useTraining('home');

  useEffect(() => {
    if (userId) {
      loadStats();
    }
  }, [userId]);

  // Trigger training overlay on first visit (after content loads)
  useEffect(() => {
    if (stats) {
      const timer = setTimeout(() => triggerTraining(), 800);
      return () => clearTimeout(timer);
    }
  }, [stats]);

  const loadStats = async () => {
    try {
      const { data: rounds } = await fetchRoundHistory(userId, 20);

      if (!rounds || rounds.length === 0) {
        setStats({
          handicap: null,
          avgScore: null,
          roundsPlayed: 0,
          totalRounds: 0,
        });
        setRecentRounds([]);
        return;
      }

      // Compute stats
      const totalScores = rounds.map((r) => r.total_score).filter(Boolean);
      const avgScore =
        totalScores.length > 0
          ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length
          : null;

      // Handicap calculation (shared utility)
      const { handicap } = calculateHandicap(rounds);

      // Calculate days since last round for greeting context
      const lastRound = rounds[0];
      const daysSinceLastRound = lastRound?.completed_at
        ? Math.floor(
            (Date.now() - new Date(lastRound.completed_at).getTime()) / 86400000
          )
        : 0;

      // Count rounds this week
      const oneWeekAgo = Date.now() - 7 * 86400000;
      const roundsThisWeek = rounds.filter(
        (r) => new Date(r.completed_at || r.started_at).getTime() > oneWeekAgo
      ).length;

      setStats({
        handicap,
        avgScore,
        roundsPlayed: rounds.length,
        totalRounds: rounds.length,
        lastRoundScore: lastRound?.total_score,
        daysSinceLastRound,
        roundsThisWeek,
      });

      // Store recent rounds for the horizontal scroll (up to 5)
      setRecentRounds(
        rounds.slice(0, 5).map((r) => ({
          id: r.id,
          courseName: r.course_name || r.courseName || 'Course',
          score: r.total_score,
          par: r.course_par || 72,
          date: r.completed_at || r.started_at,
        }))
      );
    } catch (error) {
      console.error('[HomeScreen] Error loading stats:', error);
      setStats({
        handicap: null,
        avgScore: null,
        roundsPlayed: 0,
        totalRounds: 0,
      });
      setRecentRounds([]);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadStats();
    setIsRefreshing(false);
  };

  const aiTip = useMemo(() => getAITip(stats), [stats]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Hero Section with Background Image */}
      <HeroSection
        userName={userProfile?.name}
        stats={stats}
      />

      {/* Main Content */}
      <ScrollView
        style={styles.contentContainer}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary[500]}
          />
        }
      >
        {/* AI Tip of the Day */}
          <AICaddieCard title="Tip of the Day" style={styles.aiTipCard}>
            {aiTip}
          </AICaddieCard>

        {/* Resume Round Card (conditional) */}
        {inProgressRound && (
          <QuickActionCard
            title="Resume Round"
            subtitle={`Hole ${inProgressRound.currentHole || (inProgressRound.holes_played || 0) + 1} at ${
              inProgressRound.course?.name || inProgressRound.courseName || 'Golf Course'
            }`}
            icon="play-circle"
            variant="warning"
            onPress={onResumeRound}
          />
        )}

        {/* Start Round Card */}
        <QuickActionCard
          title="Start New Round"
          subtitle="Select a course and begin tracking"
          icon="golf"
          variant="hero"
          backgroundImage={golfHeroImage}
          onPress={onStartRound}
        />



        {/* Stat Rings */}
        {stats && stats.roundsPlayed > 0 && (
          <View style={styles.statRingsSection}>
            <Text style={styles.sectionTitle}>Your Performance</Text>
            <View style={styles.statRingsRow}>
              <StatRing
                value={stats.handicap}
                maxValue={36}
                label="Handicap"
                displayValue={stats.handicap != null ? stats.handicap.toFixed(1) : '--'}
                color={theme.colors.primary[500]}
              />
              <StatRing
                value={stats.avgScore != null ? Math.max(0, 120 - stats.avgScore) : null}
                maxValue={50}
                label="Avg Score"
                displayValue={stats.avgScore != null ? Math.round(stats.avgScore) : '--'}
                color={theme.colors.secondary[500]}
              />
              <StatRing
                value={Math.min(stats.roundsPlayed, 50)}
                maxValue={50}
                label="Rounds"
                displayValue={String(stats.roundsPlayed)}
                color={theme.colors.gold.base}
              />
            </View>
          </View>
        )}

        {/* Stats Summary Card (detailed view link) */}
        <StatsSummaryCard
          handicap={stats?.handicap}
          avgScore={stats?.avgScore}
          roundsPlayed={stats?.roundsPlayed || 0}
          onPress={onOpenRoundHistory}
        />

        {/* Recent Rounds */}
        {recentRounds.length > 0 && (
          <View style={styles.recentRoundsSection}>
            <Text style={styles.sectionTitle}>Recent Rounds</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRoundsScroll}
            >
              {recentRounds.map((round) => (
                <RecentRoundCard
                  key={round.id}
                  courseName={round.courseName}
                  score={round.score}
                  par={round.par}
                  date={round.date}
                  onPress={onOpenRoundHistory}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
      <TrainingOverlay {...trainingOverlayProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  contentContainer: {
    flex: 1,
    marginTop: -24, // Overlap hero slightly
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.background.light,
  },
  contentInner: {
    padding: theme.spacing.xl,
    paddingTop: theme.spacing['2xl'],
    paddingBottom: 100, // Space for floating tab bar
  },
  aiTipCard: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  statRingsSection: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  statRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.sm,
  },
  recentRoundsSection: {
    marginTop: theme.spacing.lg,
  },
  recentRoundsScroll: {
    gap: 12,
    paddingRight: theme.spacing.xl,
  },
});
