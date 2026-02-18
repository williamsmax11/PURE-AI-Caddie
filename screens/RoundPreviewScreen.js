import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchWeather } from '../services/weatherService';
import { generateGamePlan } from '../services/gamePlanService';
import AICaddieCard from '../components/AICaddieCard';
import PressableScale from '../components/PressableScale';
import StepIndicator from '../components/StepIndicator';
import theme from '../theme';

function getTeeColor(color) {
  const colors = {
    Black: '#1c1c1e',
    Blue: '#007aff',
    White: '#8e8e93',
    Red: '#ff3b30',
    Gold: '#ffcc00',
    Green: '#34c759',
  };
  return colors[color] || '#8e8e93';
}

function getConditionEmoji(condition) {
  const conditionMap = {
    'sunny': '☀️',
    'clear': '☀️',
    'partly cloudy': '⛅',
    'cloudy': '☁️',
    'overcast': '☁️',
    'rain': '🌧️',
    'drizzle': '🌦️',
    'thunderstorm': '⛈️',
    'snow': '🌨️',
    'fog': '🌫️',
    'windy': '💨',
  };
  const key = (condition || '').toLowerCase();
  for (const [k, v] of Object.entries(conditionMap)) {
    if (key.includes(k)) return v;
  }
  return '🌤️';
}

function generateAINotes(weatherData) {
  if (!weatherData) return [];
  const { current } = weatherData;
  const notes = [];

  if (current.temp >= 60 && current.temp <= 75) {
    notes.push({ icon: '🌡️', text: 'Ideal temps for scoring - ball flies normal distance' });
  } else if (current.temp > 75) {
    notes.push({ icon: '🔥', text: 'Hot conditions - stay hydrated, ball may fly 5-10 yards extra' });
  } else if (current.temp < 50) {
    notes.push({ icon: '❄️', text: 'Cold temps - ball won\'t fly as far, add 1-2 clubs' });
  }

  if (current.wind.speed < 10) {
    notes.push({ icon: '✨', text: 'Light wind - great scoring conditions' });
  } else if (current.wind.speed < 15) {
    notes.push({ icon: '💨', text: 'Moderate wind - factor on exposed holes' });
  } else {
    notes.push({ icon: '🌬️', text: 'Strong wind - expect 2-3 club differences' });
  }

  if (current.humidity > 70) {
    notes.push({ icon: '💧', text: 'High humidity - ball may not fly as far' });
  }

  return notes;
}

export default function RoundPreviewScreen({
  course,
  selectedTee,
  userId,
  userProfile,
  onBack,
  onStartRound,
  onQuickPlay,
}) {
  // Weather state
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(null);

  // Game plan state
  const [gamePlan, setGamePlan] = useState(null);
  const [gamePlanLoading, setGamePlanLoading] = useState(true);
  const [gamePlanError, setGamePlanError] = useState(null);

  // Load both in parallel
  useEffect(() => {
    const loadWeather = async () => {
      setWeatherLoading(true);
      setWeatherError(null);
      const lat = course?.latitude || course?.coordinates?.latitude;
      const lng = course?.longitude || course?.coordinates?.longitude;
      if (!lat || !lng) {
        setWeatherError('No location data available for this course');
        setWeatherLoading(false);
        return;
      }
      const weather = await fetchWeather(lat, lng);
      if (weather) {
        setWeatherData(weather);
      } else {
        setWeatherError('Unable to load weather data');
      }
      setWeatherLoading(false);
    };

    const loadGamePlan = async () => {
      setGamePlanLoading(true);
      setGamePlanError(null);
      const result = await generateGamePlan({
        course,
        selectedTee,
        userId,
        userProfile,
      });
      if (result.error) setGamePlanError(result.error);
      setGamePlan(result.gamePlan);
      setGamePlanLoading(false);
    };

    loadWeather();
    loadGamePlan();
  }, [course?.id, selectedTee?.id]);

  const hasGoodConditions = weatherData &&
    weatherData.current.temp >= 55 &&
    weatherData.current.temp <= 80 &&
    weatherData.current.wind.speed < 15;

  const plan = gamePlan || {};
  const target = plan.targetScore || {};
  const coursePar = plan.coursePar;

  // ─── Weather Section ─────────────────────────────────
  const renderWeatherSection = () => {
    if (weatherLoading) {
      return (
        <View style={styles.sectionLoading}>
          <ActivityIndicator size="small" color="#007aff" />
          <Text style={styles.sectionLoadingText}>Loading weather...</Text>
        </View>
      );
    }

    if (!weatherData && weatherError) {
      return (
        <View style={styles.unavailableCard}>
          <Text style={styles.unavailableIcon}>🌤️</Text>
          <Text style={styles.unavailableTitle}>Weather Unavailable</Text>
          <Text style={styles.unavailableSubtitle}>{weatherError}</Text>
        </View>
      );
    }

    if (!weatherData) return null;

    return (
      <>
        {/* Weather Card */}
        <View style={styles.weatherCard}>
          <View style={styles.weatherMain}>
            <Text style={styles.weatherEmoji}>
              {typeof weatherData.current.condition === 'string'
                ? getConditionEmoji(weatherData.current.condition)
                : weatherData.current.condition}
            </Text>
            <View style={styles.weatherTempContainer}>
              <Text style={styles.weatherTemp}>{weatherData.current.temp}°</Text>
              <Text style={styles.weatherFeelsLike}>Feels like {weatherData.current.feelsLike}°</Text>
            </View>
            {hasGoodConditions && (
              <View style={styles.goodConditionsBadge}>
                <Text style={styles.goodConditionsBadgeText}>Great Day</Text>
              </View>
            )}
          </View>

          <View style={styles.weatherStatsGrid}>
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatIcon}>💨</Text>
              <Text style={styles.weatherStatValue}>{weatherData.current.wind.speed} mph</Text>
              <Text style={styles.weatherStatLabel}>{weatherData.current.wind.direction}</Text>
            </View>
            <View style={styles.weatherStatDivider} />
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatIcon}>💧</Text>
              <Text style={styles.weatherStatValue}>{weatherData.current.humidity}%</Text>
              <Text style={styles.weatherStatLabel}>Humidity</Text>
            </View>
            <View style={styles.weatherStatDivider} />
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatIcon}>🌧️</Text>
              <Text style={styles.weatherStatValue}>{weatherData.current.precipitation}%</Text>
              <Text style={styles.weatherStatLabel}>Rain</Text>
            </View>
          </View>
        </View>

        {/* Hourly Forecast */}
        {weatherData.forecast && (
          <View style={styles.section}>
            <Text style={styles.sectionTitleLarge}>Next 4 Hours</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.forecastContainer}
            >
              {weatherData.forecast.map((hour, index) => (
                <View key={index} style={styles.forecastItem}>
                  <Text style={styles.forecastTime}>{hour.time}</Text>
                  <Text style={styles.forecastIcon}>{hour.icon}</Text>
                  <Text style={styles.forecastTemp}>{hour.temp}°</Text>
                  <View style={styles.forecastWind}>
                    <Text style={styles.forecastWindText}>{hour.wind} mph</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* AI Weather Notes */}
        <View style={styles.section}>
          <AICaddieCard title="Weather Impact">
            <View style={styles.aiNotesList}>
              {generateAINotes(weatherData).map((note, index) => (
                <View key={index} style={styles.aiNoteItem}>
                  <Text style={styles.aiNoteIcon}>{note.icon}</Text>
                  <Text style={styles.aiNoteText}>{note.text}</Text>
                </View>
              ))}
            </View>
          </AICaddieCard>
        </View>
      </>
    );
  };

  // ─── Game Plan Section ───────────────────────────────
  const renderGamePlanSection = () => {
    if (gamePlanLoading) {
      return (
        <View style={styles.sectionLoading}>
          <ActivityIndicator size="small" color="#007aff" />
          <Text style={styles.sectionLoadingText}>Building your game plan...</Text>
        </View>
      );
    }

    if (gamePlanError && !gamePlan) {
      return (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{gamePlanError}</Text>
          <TouchableOpacity
            onPress={() => {
              setGamePlanLoading(true);
              setGamePlanError(null);
              generateGamePlan({ course, selectedTee, userId, userProfile }).then(result => {
                if (result.error) setGamePlanError(result.error);
                setGamePlan(result.gamePlan);
                setGamePlanLoading(false);
              });
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        {/* AI Caddie Header */}
        <AICaddieCard compact>
          <Text style={styles.aiHeaderText}>
            {plan.holesLoaded > 0
              ? `I've analyzed ${plan.holesLoaded} holes for today. Here's your personalized game plan.`
              : 'Here\'s your personalized strategy for today\'s round.'}
          </Text>
        </AICaddieCard>

        {/* Course Info Row */}
        <View style={styles.courseInfoRow}>
          <Text style={styles.courseName} numberOfLines={1}>
            {course?.name || 'Course'}
          </Text>
          <View style={styles.teeBadge}>
            <Text style={styles.teeBadgeText}>
              {selectedTee?.color || 'White'} Tees
            </Text>
          </View>
        </View>

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
        {(plan.keyStrategies || []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Strategies</Text>
            <View style={styles.strategiesCard}>
              {plan.keyStrategies.map((strategy, index) => (
                <View key={index} style={styles.strategyItem}>
                  <View style={styles.strategyNumber}>
                    <Text style={styles.strategyNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.strategyText}>{strategy}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

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
                  <Text style={styles.holeReason} numberOfLines={3}>{hole.tip}</Text>
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
                  <Text style={styles.holeReason} numberOfLines={3}>{hole.warning}</Text>
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

        {/* Mental Game */}
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
        {plan.holesLoaded === 0 && !gamePlanError && (
          <View style={styles.noDataCard}>
            <Text style={styles.noDataText}>
              Hole-by-hole data isn't available for this course yet.
              Birdie opportunities and danger zones will appear once hole data is imported.
            </Text>
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.primary[500]} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <StepIndicator currentStep={2} totalSteps={2} />

        <TouchableOpacity
          onPress={onQuickPlay}
          style={styles.skipButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tee Info Header */}
        <View style={styles.teeHeader}>
          <View style={[styles.teeColorDot, { backgroundColor: getTeeColor(selectedTee?.color) }]} />
          <Text style={styles.teeInfoText}>
            {selectedTee?.color} Tees • {selectedTee?.yardage?.toLocaleString()} yards
          </Text>
        </View>

        {/* ─── Weather ─── */}
        {renderWeatherSection()}

        {/* Divider between weather and game plan */}
        {!weatherLoading && weatherData && (
          <View style={styles.sectionDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>Game Plan</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        {/* ─── Game Plan ─── */}
        {renderGamePlanSection()}

        {/* Bottom spacer */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.base,
    backgroundColor: theme.colors.background.light,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  backButtonText: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    color: theme.colors.primary[500],
  },
  skipButton: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  skipButtonText: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    color: theme.colors.primary[500],
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // Tee header
  teeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  teeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  teeInfoText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.secondary,
  },

  // Section loading
  sectionLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingVertical: 32,
    gap: 10,
  },
  sectionLoadingText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.secondary,
  },

  // Weather Card
  weatherCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius['2xl'],
    padding: 20,
    marginBottom: 20,
    ...theme.shadows.md,
  },
  weatherMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  weatherEmoji: {
    fontSize: 56,
    marginRight: 16,
  },
  weatherTempContainer: {
    flex: 1,
  },
  weatherTemp: {
    fontFamily: theme.fonts.light,
    fontSize: 48,
    color: theme.colors.text.primary,
    letterSpacing: -2,
  },
  weatherFeelsLike: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.secondary,
    marginTop: -4,
  },
  goodConditionsBadge: {
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  goodConditionsBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: '#fff',
  },
  weatherStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  weatherStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  weatherStatIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  weatherStatValue: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: theme.colors.text.primary,
  },
  weatherStatLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  weatherStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.neutral.gray[200],
  },

  // Forecast
  forecastContainer: {
    gap: 10,
  },
  forecastItem: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: 14,
    alignItems: 'center',
    minWidth: 72,
    ...theme.shadows.sm,
  },
  forecastTime: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginBottom: 8,
  },
  forecastIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  forecastTemp: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.primary,
  },
  forecastWind: {
    marginTop: 6,
  },
  forecastWindText: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.text.secondary,
  },

  // Weather unavailable
  unavailableCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    ...theme.shadows.sm,
  },
  unavailableIcon: {
    fontSize: 40,
    marginBottom: 12,
    opacity: 0.5,
  },
  unavailableTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.primary,
    marginBottom: 6,
  },
  unavailableSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // AI Notes (weather)
  aiNotesList: {
    gap: 12,
  },
  aiNoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiNoteIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  aiNoteText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.dark.text.primary,
    lineHeight: 20,
  },

  // Section divider (between weather and game plan)
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.neutral.gray[300],
  },
  dividerLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },

  // Sections (game plan)
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
  sectionTitleLarge: {
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    color: theme.colors.text.primary,
    marginBottom: 12,
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

  // AI Header text
  aiHeaderText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.dark.text.primary,
    lineHeight: 22,
  },

  // Course Info Row
  courseInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  courseName: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  teeBadge: {
    backgroundColor: theme.colors.primary[500] + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  teeBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.primary[500],
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

  // Mental Game
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
