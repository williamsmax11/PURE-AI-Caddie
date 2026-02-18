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
import { fetchTeeBoxes } from '../services/courseService';
import StepIndicator from '../components/StepIndicator';
import AICaddieCard from '../components/AICaddieCard';
import PressableScale from '../components/PressableScale';
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

const TEE_COLORS = {
  Black: { bg: '#1c1c1e', text: '#fff', dot: '#000' },
  Blue: { bg: '#007aff', text: '#fff', dot: '#007aff' },
  White: { bg: '#f2f2f7', text: '#000', dot: '#c7c7cc' },
  Red: { bg: '#ff3b30', text: '#fff', dot: '#ff3b30' },
  Gold: { bg: '#ffcc00', text: '#000', dot: '#d4a017' },
  Green: { bg: '#34c759', text: '#fff', dot: '#34c759' },
};

const FALLBACK_TEE_OPTIONS = [
  { id: 'black', color: 'Black', yardage: 6828, rating: 73.5, slope: 145, handicapRange: [0, 5] },
  { id: 'blue', color: 'Blue', yardage: 6325, rating: 71.2, slope: 138, handicapRange: [6, 14] },
  { id: 'white', color: 'White', yardage: 5841, rating: 69.0, slope: 130, handicapRange: [15, 24] },
  { id: 'red', color: 'Red', yardage: 5237, rating: 70.5, slope: 125, handicapRange: [25, 36] },
];

function normalizeTeeBox(dbTee, index, totalTees) {
  const rangeSize = Math.ceil(36 / totalTees);
  const handicapStart = index * rangeSize;
  const handicapEnd = Math.min(handicapStart + rangeSize, 36);

  return {
    id: dbTee.id,
    color: dbTee.color || 'White',
    yardage: dbTee.yardage || 0,
    rating: dbTee.rating || 0,
    slope: dbTee.slope || 0,
    parTotal: dbTee.parTotal,
    handicapRange: [handicapStart, handicapEnd],
  };
}

export default function TeeSelectionScreen({
  course,
  userProfile,
  onBack,
  onSelectTee,
  onQuickPlay,
}) {
  const [selectedTee, setSelectedTee] = useState(null);
  const [teeOptions, setTeeOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const userHandicap = parseFloat(userProfile?.handicap?.split('-')[0]) || 15;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data: dbTees } = await fetchTeeBoxes(course.id);
      if (cancelled) return;

      if (dbTees && dbTees.length > 0) {
        const normalized = dbTees.map((t, i) => normalizeTeeBox(t, i, dbTees.length));
        setTeeOptions(normalized);
      } else {
        setTeeOptions(FALLBACK_TEE_OPTIONS);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [course.id]);

  const getRecommendedTee = () => {
    if (teeOptions.length === 0) return null;
    for (const tee of teeOptions) {
      if (userHandicap >= tee.handicapRange[0] && userHandicap <= tee.handicapRange[1]) {
        return tee;
      }
    }
    return teeOptions[1] || teeOptions[0];
  };

  const recommendedTee = getRecommendedTee();

  useEffect(() => {
    if (recommendedTee && !selectedTee) {
      setSelectedTee(recommendedTee);
    }
  }, [recommendedTee]);

  const handleSelectTee = (tee) => {
    setSelectedTee(tee);
  };

  const handleContinue = () => {
    if (selectedTee) {
      onSelectTee(selectedTee);
    }
  };

  const getTeeStyle = (color) => {
    return TEE_COLORS[color] || TEE_COLORS.White;
  };

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
            source={getCourseBackground(course.id)}
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
            <Text style={styles.heroTitle} numberOfLines={2}>{course.name}</Text>
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-sharp" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroLocationText} numberOfLines={1}>
                {course.full_address || course.location}
              </Text>
            </View>
          </View>

          {/* Step Indicator — dark glass bar */}
          <View style={styles.stepIndicatorBar}>
            <StepIndicator currentStep={1} totalSteps={2} />
          </View>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary[500]} />
            <Text style={styles.loadingText}>Loading tees...</Text>
          </View>
        ) : (
          <View style={styles.contentArea}>
            {/* AI Recommendation */}
            {recommendedTee && (
              <AICaddieCard title="Tee Recommendation" compact style={styles.recommendationCard}>
                <Text style={styles.recommendationText}>
                  Based on your handicap, the{' '}
                  <Text style={styles.recommendationHighlight}>{recommendedTee.color} tees</Text>
                  {' '}({recommendedTee.yardage.toLocaleString()} yds) are your best match for a competitive but enjoyable round.
                </Text>
              </AICaddieCard>
            )}

            {/* Tee Options */}
            <View style={styles.teeOptionsContainer}>
              {teeOptions.map((tee) => {
                const isSelected = selectedTee?.id === tee.id;
                const isRecommended = recommendedTee?.id === tee.id;
                const teeStyle = getTeeStyle(tee.color);

                return (
                  <PressableScale
                    key={tee.id}
                    onPress={() => handleSelectTee(tee)}
                    haptic="light"
                  >
                    <View style={[
                      styles.teeOption,
                      isSelected && styles.teeOptionSelected,
                    ]}>
                      {isSelected && (
                        <LinearGradient
                          colors={[theme.colors.primary[400], theme.colors.primary[600]]}
                          style={styles.teeAccentBar}
                        />
                      )}

                      <View style={styles.teeOptionInner}>
                        <View style={styles.teeOptionLeft}>
                          <View style={[styles.teeColorDot, { backgroundColor: teeStyle.dot }]} />
                          <View style={styles.teeOptionInfo}>
                            <View style={styles.teeNameRow}>
                              <Text style={[
                                styles.teeOptionName,
                                isSelected && styles.teeOptionNameSelected,
                              ]}>{tee.color}</Text>
                              {isRecommended && (
                                <View style={styles.recommendedPill}>
                                  <Ionicons name="sparkles" size={10} color="#fff" style={{ marginRight: 3 }} />
                                  <Text style={styles.recommendedPillText}>Best Fit</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.teeOptionYardage}>{tee.yardage.toLocaleString()} yards</Text>
                          </View>
                        </View>

                        <View style={styles.teeOptionRight}>
                          <View style={styles.teeStats}>
                            <Text style={styles.teeStatValue}>{tee.rating}</Text>
                            <Text style={styles.teeStatLabel}>Rating</Text>
                          </View>
                          <View style={styles.teeStatsDivider} />
                          <View style={styles.teeStats}>
                            <Text style={styles.teeStatValue}>{tee.slope}</Text>
                            <Text style={styles.teeStatLabel}>Slope</Text>
                          </View>
                          <View style={styles.checkCircle}>
                            {isSelected ? (
                              <Ionicons name="checkmark-circle" size={26} color={theme.colors.primary[500]} />
                            ) : (
                              <Ionicons name="ellipse-outline" size={26} color={theme.colors.neutral.gray[300]} />
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* Tip */}
            <View style={styles.tipContainer}>
              <View style={styles.tipIconCircle}>
                <Ionicons name="bulb-outline" size={16} color={theme.colors.primary[500]} />
              </View>
              <Text style={styles.tipText}>
                Play from tees where you can reach par 4s with driver + mid-iron
              </Text>
            </View>
          </View>
        )}

        {/* Bottom spacer for fixed CTA */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={styles.bottomCTA}>
        <PressableScale onPress={handleContinue} haptic="medium" disabled={!selectedTee}>
          <LinearGradient
            colors={selectedTee
              ? [theme.colors.primary[500], theme.colors.primary[600]]
              : [theme.colors.neutral.gray[300], theme.colors.neutral.gray[300]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueButton}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content area
  contentArea: {
    paddingHorizontal: 20,
    paddingTop: theme.spacing.lg,
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

  // AI Recommendation
  recommendationCard: {
    marginBottom: theme.spacing.lg,
  },
  recommendationText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.dark.text.primary,
    lineHeight: 21,
  },
  recommendationHighlight: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.primary[400],
  },

  // Tee Options
  teeOptionsContainer: {
    gap: 10,
  },
  teeOption: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    flexDirection: 'row',
    ...theme.shadows.sm,
  },
  teeOptionSelected: {
    borderColor: theme.colors.primary[500],
    backgroundColor: theme.colors.primary[50],
    ...theme.shadows.md,
  },
  teeAccentBar: {
    width: 3,
  },
  teeOptionInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.base,
  },
  teeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teeColorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 14,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  teeOptionInfo: {
    flex: 1,
  },
  teeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teeOptionName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: theme.colors.text.primary,
    letterSpacing: -0.4,
  },
  teeOptionNameSelected: {
    color: theme.colors.primary[700],
  },
  teeOptionYardage: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  recommendedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
  },
  recommendedPillText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: '#fff',
  },
  teeOptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teeStats: {
    alignItems: 'center',
    minWidth: 40,
  },
  teeStatValue: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.primary,
    letterSpacing: -0.3,
  },
  teeStatLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 10,
    color: theme.colors.text.tertiary,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  teeStatsDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.neutral.gray[200],
  },
  checkCircle: {
    marginLeft: 6,
  },

  // Tip
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    paddingHorizontal: 4,
    gap: 10,
  },
  tipIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.secondary,
    lineHeight: 18,
    letterSpacing: -0.2,
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
  continueButton: {
    borderRadius: theme.borderRadius.xl,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    shadowColor: theme.colors.primary[500],
  },
  continueButtonText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: '#fff',
  },
});
