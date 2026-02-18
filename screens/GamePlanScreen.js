import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { generateGamePlan } from '../services/gamePlanService';
import AICaddieCard from '../components/AICaddieCard';
import PressableScale from '../components/PressableScale';
import StepIndicator from '../components/StepIndicator';
import theme from '../theme';

// Course background images — same set as CourseOverviewScreen
const COURSE_BACKGROUNDS = [
  require('../assets/course_background1.jpg'),
  require('../assets/course_background2.jpg'),
  require('../assets/course_background3.jpg'),
  require('../assets/course_background4.jpg'),
];

function getCourseBackground(courseId) {
  if (!courseId) return COURSE_BACKGROUNDS[0];
  let hash = 0;
  for (let i = 0; i < courseId.length; i++) {
    hash = ((hash << 5) - hash) + courseId.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % COURSE_BACKGROUNDS.length;
  return COURSE_BACKGROUNDS[index];
}

// Pick a personalized opener based on available user/course data.
// Uses a simple hash so the same course+day always shows the same message,
// but a different course or day rotates to a new one.
function getAIOpener({ plan, userProfile, course }) {
  const name = userProfile?.name?.split(' ')[0]; // first name only
  const handicap = userProfile?.handicap;
  const target = plan?.targetScore?.target;
  const coursePar = plan?.coursePar;
  const holes = plan?.holesLoaded || 0;
  const rounds = plan?.roundsAtCourse || 0;
  const courseName = course?.name || 'the course';

  const openers = [];

  // Name + target openers
  if (name && target) {
    openers.push(`Let's go get that ${target}, ${name}. Here's how we'll play ${courseName} today.`);
    openers.push(`${name}, I've mapped out all ${holes} holes. Your target is ${target}, and here's the plan to get there.`);
  }

  // Name-only openers
  if (name && !target) {
    openers.push(`${name}, I've put together your strategy for ${courseName}. Let's have a great round.`);
    openers.push(`Here's your game plan, ${name}. I've broken down ${courseName} hole by hole.`);
  }

  // Handicap openers
  if (handicap && holes > 0) {
    openers.push(`Playing as a ${handicap} handicap, here's your strategy for ${courseName}.`);
    openers.push(`I've built this plan around your ${handicap} handicap and what ${courseName} throws at you.`);
  }

  // Target + par context
  if (target && coursePar) {
    const diff = target - coursePar;
    if (diff <= 0) {
      openers.push(`You can go low today. Here's the plan to shoot ${target} or better at ${courseName}.`);
    } else {
      openers.push(`Your target is ${target} on a par ${coursePar} course. Here's where to use those ${diff} bogeys wisely.`);
    }
  }

  // Return visit
  if (rounds > 0) {
    openers.push(`Welcome back to ${courseName}. Round ${rounds + 1} starts with a plan.`);
  }

  // First visit
  if (rounds === 0 && holes > 0) {
    openers.push(`First time at ${courseName}? I've scouted all ${holes} holes for you. Here's the game plan.`);
  }

  // Generic fallbacks
  if (openers.length === 0) {
    openers.push(
      'Here\'s your strategy for today\'s round. Let\'s make every shot count.',
      'I\'ve studied the course and put together a plan. Let\'s have a great round.',
    );
  }

  // Deterministic pick: hash courseId + today's date
  const dateKey = new Date().toISOString().slice(0, 10);
  const seed = `${course?.id || ''}${dateKey}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  return openers[Math.abs(hash) % openers.length];
}

export default function GamePlanScreen({
  course,
  selectedTee,
  userId,
  userProfile,
  onBack,
  onViewCourseMap,
  onStartRound,
  onQuickPlay,
}) {
  const [loading, setLoading] = useState(true);
  const [gamePlan, setGamePlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGamePlan();
  }, [course?.id, selectedTee?.id]);

  async function loadGamePlan() {
    setLoading(true);
    setError(null);
    const result = await generateGamePlan({
      course,
      selectedTee,
      userId,
      userProfile,
    });
    if (result.error) {
      setError(result.error);
    }
    setGamePlan(result.gamePlan);
    setLoading(false);
  }

  // Helpers
  const plan = gamePlan || {};
  const target = plan.targetScore || {};
  const coursePar = plan.coursePar;

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image Section */}
        <View style={styles.heroContainer}>
          <Image
            source={getCourseBackground(course?.id)}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.35, 1]}
            style={styles.heroGradient}
          />

          {/* Header Overlay — dark glass buttons */}
          <View style={styles.headerOverlay}>
            <TouchableOpacity
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.backButtonCircle}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onQuickPlay}
              style={styles.quickStartPill}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="flash" size={13} color="#fff" style={{ marginRight: 5 }} />
              <Text style={styles.quickStartPillText}>Quick Start</Text>
            </TouchableOpacity>
          </View>

          {/* Course Title Overlay */}
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2}>{course?.name || 'Course'}</Text>
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-sharp" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroLocationText} numberOfLines={1}>
                {course?.full_address || course?.location || 'Golf Course'}
              </Text>
            </View>
          </View>

          {/* Step Indicator — dark glass bar with tee badge */}
          <View style={styles.stepIndicatorBar}>
            <StepIndicator currentStep={2} totalSteps={2} />
            <View style={styles.teeBadgeHero}>
              <Text style={styles.teeBadgeHeroText}>{selectedTee?.color || 'White'} Tees</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary[500]} />
            <Text style={styles.loadingText}>Building your game plan...</Text>
          </View>
        ) : (
          <View style={styles.contentArea}>
            {/* AI Caddie Header */}
            <AICaddieCard compact>
            <Text style={styles.aiHeaderText}>
              {getAIOpener({ plan, userProfile, course })}
            </Text>
          </AICaddieCard>

          {/* Target Score Card */}
          <View style={styles.targetScoreCard}>
            <View style={styles.targetScoreHeader}>
              <Text style={styles.targetScoreLabel}>Target Score</Text>
              {target.target !== null && target.target !== undefined ? (
                <View style={styles.targetScoreValue}>
                  <Text style={styles.targetScoreNumber}>{target.target}</Text>
                </View>
              ) : (
                <View style={[styles.targetScoreValue, styles.targetScoreUnavailable]}>
                  <Text style={styles.targetScoreNumberMissing}>—</Text>
                </View>
              )}
            </View>
            <Text style={styles.targetScoreNote}>
              {target.note || 'Add your handicap in settings to see a target'}
            </Text>
            {target.target !== null && coursePar ? (
              <View style={styles.targetScoreDetail}>
                <Text style={styles.targetDetailText}>
                  Par {coursePar} • Target +{Math.max(0, target.target - coursePar)}
                </Text>
                {target.confidence === 'high' && (
                  <View style={styles.confidenceBadge}>
                    <Text style={styles.confidenceText}>High confidence</Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {/* Key Strategies */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Strategies</Text>
            <View style={styles.strategiesCard}>
              {(plan.keyStrategies || []).map((strategy, index) => (
                <View key={index} style={styles.strategyItem}>
                  <View style={styles.strategyNumber}>
                    <Text style={styles.strategyNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.strategyText}>{strategy}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Birdie Opportunities */}
          {(plan.birdieOpportunities || []).length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Birdie Opportunities</Text>
                <Text style={styles.sectionBadge}>Attack</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.holesScrollContainer}
              >
                {plan.birdieOpportunities.map((hole) => (
                  <View key={hole.holeNumber} style={styles.opportunityCard}>
                    <View style={styles.holeHeaderRow}>
                      <View style={styles.holeNumberBadge}>
                        <Text style={styles.holeNumberText}>{hole.holeNumber}</Text>
                      </View>
                      <Text style={styles.holePar}>Par {hole.par}</Text>
                      <Text style={styles.holeYardage}>{hole.yardage} yds</Text>
                    </View>
                    <Text style={styles.holeReason} numberOfLines={3}>
                      {hole.tip}
                    </Text>
                    <View style={styles.holeFooterRow}>
                      {hole.avgScore !== null ? (
                        <View style={styles.avgScoreRow}>
                          <Text style={styles.avgScoreLabel}>Your avg:</Text>
                          <Text style={styles.avgScoreValue}>{hole.avgScore.toFixed(1)}</Text>
                        </View>
                      ) : (
                        <Text style={styles.holeHcpLabel}>HCP {hole.handicapIndex}</Text>
                      )}
                      {(hole.hazards.water > 0 || hole.hazards.bunkers > 0) && (
                        <View style={styles.hazardBadges}>
                          {hole.hazards.water > 0 && (
                            <Text style={styles.hazardBadgeWater}>W</Text>
                          )}
                          {hole.hazards.bunkers > 0 && (
                            <Text style={styles.hazardBadgeSand}>B</Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Danger Zones */}
          {(plan.dangerZones || []).length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Danger Zones</Text>
                <Text style={[styles.sectionBadge, styles.dangerBadge]}>Caution</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.holesScrollContainer}
              >
                {plan.dangerZones.map((hole) => (
                  <View key={hole.holeNumber} style={[styles.opportunityCard, styles.dangerCard]}>
                    <View style={styles.holeHeaderRow}>
                      <View style={[styles.holeNumberBadge, styles.dangerHoleBadge]}>
                        <Text style={styles.holeNumberText}>{hole.holeNumber}</Text>
                      </View>
                      <Text style={styles.holePar}>Par {hole.par}</Text>
                      <Text style={styles.holeYardage}>{hole.yardage} yds</Text>
                    </View>
                    <Text style={styles.holeReason} numberOfLines={3}>
                      {hole.warning}
                    </Text>
                    <View style={styles.strategyTip}>
                      <Text style={styles.strategyTipText}>{hole.strategy}</Text>
                    </View>
                    {hole.avgScore !== null && (
                      <View style={[styles.avgScoreRow, { marginTop: 6 }]}>
                        <Text style={styles.avgScoreLabel}>Your avg:</Text>
                        <Text style={[styles.avgScoreValue, styles.avgScoreDanger]}>
                          {hole.avgScore.toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Par Strategy */}
          {plan.parStrategy && (plan.parStrategy.par3s || plan.parStrategy.par4s || plan.parStrategy.par5s) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Par Strategy</Text>
              <View style={styles.parStrategyCard}>
                {plan.parStrategy.par3s && (
                  <View style={styles.parStrategyRow}>
                    <View style={styles.parTypeHeader}>
                      <Text style={styles.parTypeLabel}>Par 3s</Text>
                      <Text style={styles.parTypeCount}>{plan.parStrategy.par3s.count} holes</Text>
                    </View>
                    <Text style={styles.parStrategyText}>{plan.parStrategy.par3s.strategy}</Text>
                  </View>
                )}
                {plan.parStrategy.par3s && plan.parStrategy.par4s && <View style={styles.parDivider} />}
                {plan.parStrategy.par4s && (
                  <View style={styles.parStrategyRow}>
                    <View style={styles.parTypeHeader}>
                      <Text style={styles.parTypeLabel}>Par 4s</Text>
                      <Text style={styles.parTypeCount}>{plan.parStrategy.par4s.count} holes</Text>
                    </View>
                    <Text style={styles.parStrategyText}>{plan.parStrategy.par4s.strategy}</Text>
                  </View>
                )}
                {plan.parStrategy.par4s && plan.parStrategy.par5s && <View style={styles.parDivider} />}
                {plan.parStrategy.par5s && (
                  <View style={styles.parStrategyRow}>
                    <View style={styles.parTypeHeader}>
                      <Text style={styles.parTypeLabel}>Par 5s</Text>
                      <Text style={styles.parTypeCount}>{plan.parStrategy.par5s.count} holes</Text>
                    </View>
                    <Text style={styles.parStrategyText}>{plan.parStrategy.par5s.strategy}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Mental Game — AI Caddie treatment */}
          {(plan.mentalTips || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mental Game</Text>
              <AICaddieCard title="Focus Areas">
                <View style={styles.mentalGameList}>
                  {plan.mentalTips.map((tip, index) => (
                    <View key={index} style={styles.mentalGameItem}>
                      <Text style={styles.mentalGameIcon}>{tip.icon}</Text>
                      <Text style={styles.mentalGameText}>{tip.text}</Text>
                    </View>
                  ))}
                </View>
              </AICaddieCard>
            </View>
          )}

          {/* No hole data message */}
          {plan.holesLoaded === 0 && !error && (
            <View style={styles.noDataCard}>
              <Text style={styles.noDataText}>
                Hole-by-hole data isn't available for this course yet.
                Birdie opportunities and danger zones will appear once hole data is imported.
              </Text>
            </View>
          )}

          {/* Error message */}
          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={loadGamePlan} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          </View>
        )}

        {/* Bottom Spacer for fixed CTA */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={styles.bottomCTA}>
        <PressableScale onPress={onStartRound} haptic="light">
          <LinearGradient
            colors={[theme.colors.primary[500], theme.colors.primary[600]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.startRoundButton}
          >
            <Text style={styles.startRoundButtonText}>Start Round</Text>
          </LinearGradient>
        </PressableScale>
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
    paddingBottom: 100,
  },

  // Hero Section — matches CourseOverviewScreen
  heroContainer: {
    height: 240,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },

  // Header — dark glass buttons
  headerOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 38,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backButtonCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickStartPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },

  // Course title overlay
  heroContent: {
    position: 'absolute',
    bottom: 70,
    left: 20,
    right: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroLocationText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.3,
    flex: 1,
    marginLeft: 6,
  },

  // Step indicator — dark glass bar
  stepIndicatorBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  teeBadgeHero: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  teeBadgeHeroText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Content area
  contentArea: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  loadingText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.secondary,
  },

  // AI Header text
  aiHeaderText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.dark.text.primary,
    lineHeight: 22,
  },

  // Target Score Card
  targetScoreCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: 20,
    marginBottom: 24,
    ...theme.shadows.sm,
  },
  targetScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  targetScoreLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.secondary,
  },
  targetScoreValue: {
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.lg,
  },
  targetScoreUnavailable: {
    backgroundColor: theme.colors.neutral.gray[200],
  },
  targetScoreNumber: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    color: '#fff',
  },
  targetScoreNumberMissing: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    color: theme.colors.neutral.gray[400],
  },
  targetScoreNote: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginTop: 10,
  },
  targetScoreDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  targetDetailText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.tertiary,
  },
  confidenceBadge: {
    backgroundColor: theme.colors.primary[500] + '1F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
  },
  confidenceText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: theme.colors.primary[500],
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionBadge: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: theme.colors.primary[500],
    backgroundColor: theme.colors.primary[500] + '1F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
  },
  dangerBadge: {
    color: theme.colors.accent.amber,
    backgroundColor: theme.colors.accent.amber + '1F',
  },

  // Strategies Card
  strategiesCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    gap: 14,
    ...theme.shadows.sm,
  },
  strategyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  strategyNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  strategyNumberText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: '#fff',
  },
  strategyText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.primary,
    lineHeight: 22,
  },

  // Holes Scroll
  holesScrollContainer: {
    paddingRight: 20,
    gap: 12,
  },
  opportunityCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: 14,
    width: 200,
    ...theme.shadows.sm,
  },
  dangerCard: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent.amber,
  },
  holeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  holeNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerHoleBadge: {
    backgroundColor: theme.colors.accent.amber,
  },
  holeNumberText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: '#fff',
  },
  holePar: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  holeYardage: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.text.tertiary,
  },
  holeReason: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.primary,
    lineHeight: 18,
    marginBottom: 10,
  },
  holeFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holeHcpLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.text.tertiary,
  },
  avgScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avgScoreLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginRight: 4,
  },
  avgScoreValue: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.primary[500],
  },
  avgScoreDanger: {
    color: theme.colors.accent.amber,
  },
  hazardBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  hazardBadgeWater: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    color: theme.colors.secondary[500],
    backgroundColor: theme.colors.secondary[500] + '1F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  hazardBadgeSand: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    color: theme.colors.accent.amber,
    backgroundColor: theme.colors.accent.amber + '1F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  strategyTip: {
    backgroundColor: theme.colors.accent.amber + '1A',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  strategyTipText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.accent.amber,
  },

  // Par Strategy Card
  parStrategyCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  parStrategyRow: {
    paddingVertical: 4,
  },
  parTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  parTypeLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  parTypeCount: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  parStrategyText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    lineHeight: 20,
  },
  parDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.neutral.gray[200],
    marginVertical: 12,
  },

  // Mental Game (inside AICaddieCard)
  mentalGameList: {
    gap: 12,
  },
  mentalGameItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mentalGameIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  mentalGameText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.dark.text.primary,
    lineHeight: 22,
  },

  // No data / Error
  noDataCard: {
    backgroundColor: theme.colors.neutral.gray[100] + '80',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: 24,
  },
  noDataText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.secondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: theme.colors.semantic.error + '14',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: 24,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.semantic.error,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  retryText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: '#fff',
  },

  // Bottom CTA
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: theme.colors.background.light,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.neutral.gray[200],
  },
  startRoundButton: {
    borderRadius: theme.borderRadius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    shadowColor: theme.colors.primary[500],
  },
  startRoundButtonText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: '#fff',
  },
});
