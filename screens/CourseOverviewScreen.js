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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchCourseHistory } from '../services/roundService';
import { fetchWeather, getMockWeather } from '../services/weatherService';
import AICaddieCard from '../components/AICaddieCard';

// Course background images to cycle through
const COURSE_BACKGROUNDS = [
  require('../assets/course_background1.jpg'),
  require('../assets/course_background2.jpg'),
  require('../assets/course_background3.jpg'),
  require('../assets/course_background4.jpg'),
];

/**
 * Get a consistent background image for a course based on its ID
 */
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

function formatRelativeDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`;
}

function getWeatherAdvice(weather) {
  if (!weather?.current) return [];
  const tips = [];
  const w = weather.current;
  const maxRainChance = weather.forecast?.reduce((max, h) => Math.max(max, h.precip || 0), 0) || 0;

  // Wind advice
  if (w.wind.speed >= 15) {
    tips.push({ icon: '💨', text: `Strong ${w.wind.speed} mph ${w.wind.direction} winds — club up into the wind and keep the ball low.` });
  } else if (w.wind.speed >= 8) {
    tips.push({ icon: '🌬️', text: `${w.wind.speed} mph winds from the ${w.wind.direction} — adjust 1-2 clubs on exposed holes.` });
  } else {
    tips.push({ icon: '🎯', text: 'Light winds — great conditions for attacking pins.' });
  }

  // Temperature advice
  if (w.temp >= 90) {
    tips.push({ icon: '🥵', text: 'Stay hydrated. Heat will sap energy on the back nine.' });
  } else if (w.temp <= 50) {
    tips.push({ icon: '🧊', text: 'Cold reduces ball flight 5-10 yards per club. Bundle up and keep hands warm.' });
  } else if (w.temp <= 60) {
    tips.push({ icon: '🌡️', text: 'Cool conditions — expect slightly shorter ball flight.' });
  }

  // Rain advice
  if (maxRainChance >= 50) {
    tips.push({ icon: '🌧️', text: 'High rain chance — keep grips dry, expect soft greens and less roll.' });
  } else if (maxRainChance >= 20) {
    tips.push({ icon: '☂️', text: 'Possible showers later — pack a rain glove just in case.' });
  }

  // Humidity advice
  if (w.humidity >= 80) {
    tips.push({ icon: '💧', text: 'High humidity — the ball will fly shorter. Hydrate frequently.' });
  }

  return tips;
}

export default function CourseOverviewScreen({ course, userId, onBack, onStartRound, onViewMap, onQuickPlay }) {
  const [historyStats, setHistoryStats] = useState(null);
  const [recentRounds, setRecentRounds] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [weather, setWeather] = useState(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);

  const courseDetails = {
    ...course,
    location: course.location || 'Unknown Location',
    phone: course.phone || null,
    website: course.website || null,
    full_address: course.full_address || null,
  };

  useEffect(() => {
    if (userId && course.id) {
      loadCourseHistory();
    } else {
      setIsLoadingHistory(false);
    }
    loadWeather();
  }, [userId, course.id]);

  const loadWeather = async () => {
    setIsLoadingWeather(true);
    if (course.latitude && course.longitude) {
      const data = await fetchWeather(course.latitude, course.longitude);
      setWeather(data || getMockWeather());
    } else {
      setWeather(getMockWeather());
    }
    setIsLoadingWeather(false);
  };

  const loadCourseHistory = async () => {
    setIsLoadingHistory(true);
    const { data, error } = await fetchCourseHistory(userId, course.id);
    if (!error && data) {
      setHistoryStats(data.stats);
      setRecentRounds(data.rounds || []);
    }
    setIsLoadingHistory(false);
  };

  const renderQuickStatValue = (value, label) => {
    const hasValue = value != null && value !== 'N/A';
    return (
      <View style={styles.quickStatItem}>
        <Text style={hasValue ? styles.quickStatValue : styles.quickStatValueMissing}>
          {hasValue ? value : '—'}
        </Text>
        <Text style={styles.quickStatLabel}>{label}</Text>
      </View>
    );
  };

  const renderScoreTrend = () => {
    if (!historyStats?.scoreTrend || historyStats.scoreTrend.length < 2) return null;

    const scores = [...historyStats.scoreTrend].reverse(); // oldest to newest
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;
    const barMaxHeight = 40;

    return (
      <View style={styles.trendContainer}>
        <Text style={styles.trendLabel}>Recent Scores</Text>
        <View style={styles.trendBars}>
          {scores.map((score, i) => {
            const height = ((score - minScore) / range) * barMaxHeight + 8;
            const isLatest = i === scores.length - 1;
            return (
              <View key={i} style={styles.trendBarWrapper}>
                <Text style={[styles.trendBarLabel, isLatest && styles.trendBarLabelLatest]}>{score}</Text>
                <View
                  style={[
                    styles.trendBar,
                    { height },
                    isLatest ? styles.trendBarLatest : styles.trendBarOld,
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderTroubleHoles = () => {
    if (!historyStats?.troubleHoles || historyStats.troubleHoles.length === 0) return null;

    return (
      <View style={styles.holeInsightSection}>
        <View style={styles.holeInsightHeader}>
          <View style={[styles.holeInsightDot, { backgroundColor: '#ff3b30' }]} />
          <Text style={styles.holeInsightTitle}>Trouble Holes</Text>
        </View>
        <View style={styles.holeInsightRow}>
          {historyStats.troubleHoles.map((h) => (
            <View key={h.hole} style={[styles.holeBadge, styles.troubleHoleBadge]}>
              <Text style={styles.holeBadgeNumber}>#{h.hole}</Text>
              <Text style={styles.holeBadgeStat}>+{h.avgOverPar}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderBestHoles = () => {
    if (!historyStats?.bestHoles || historyStats.bestHoles.length === 0) return null;

    return (
      <View style={styles.holeInsightSection}>
        <View style={styles.holeInsightHeader}>
          <View style={[styles.holeInsightDot, { backgroundColor: '#34c759' }]} />
          <Text style={styles.holeInsightTitle}>Best Holes</Text>
        </View>
        <View style={styles.holeInsightRow}>
          {historyStats.bestHoles.map((h) => (
            <View key={h.hole} style={[styles.holeBadge, styles.bestHoleBadge]}>
              <Text style={styles.holeBadgeNumber}>#{h.hole}</Text>
              <Text style={[styles.holeBadgeStat, { color: '#34c759' }]}>{h.avgOverPar}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderRecentRounds = () => {
    if (recentRounds.length === 0) return null;

    const recent = recentRounds.slice(0, 3);
    return (
      <View style={styles.recentRoundsSection}>
        <Text style={styles.recentRoundsTitle}>Recent Rounds</Text>
        {recent.map((round, i) => {
          const scoreToPar = round.score_to_par;
          const scoreColor = scoreToPar <= 0 ? '#34c759' : scoreToPar <= 5 ? '#ff9500' : '#ff3b30';
          const scorePrefix = scoreToPar > 0 ? '+' : '';

          return (
            <View key={round.id} style={[styles.recentRoundRow, i === recent.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.recentRoundLeft}>
                <Text style={styles.recentRoundScore}>{round.total_score}</Text>
                <Text style={[styles.recentRoundToPar, { color: scoreColor }]}>
                  {scoreToPar === 0 ? 'E' : `${scorePrefix}${scoreToPar}`}
                </Text>
              </View>
              <View style={styles.recentRoundMiddle}>
                <Text style={styles.recentRoundDate}>{formatRelativeDate(round.started_at)}</Text>
                <Text style={styles.recentRoundTee}>{round.tee_color || 'Unknown'} tees</Text>
              </View>
              <View style={styles.recentRoundRight}>
                {round.total_putts != null && (
                  <Text style={styles.recentRoundStat}>{round.total_putts} putts</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image Section — full bleed to top of screen */}
        <View style={styles.heroContainer}>
          <Image
            source={getCourseBackground(course.id)}
            style={styles.heroImage}
            resizeMode="cover"
          />

          {/* Gradient vignette — dark top + dark bottom for readability */}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.35, 1]}
            style={styles.heroGradient}
          />

          {/* Header Overlay — dark glass buttons */}
          <View style={styles.headerOverlay}>
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.backButtonCircle}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onQuickPlay}
              style={styles.skipButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="flash" size={13} color="#fff" style={{ marginRight: 5 }} />
              <Text style={styles.skipButtonText}>Quick Start</Text>
            </TouchableOpacity>
          </View>

          {/* Course Title Overlay */}
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2}>{courseDetails.name}</Text>
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-sharp" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroLocationText} numberOfLines={1}>
                {courseDetails.full_address || courseDetails.location}
              </Text>
            </View>
          </View>

          {/* Quick Stats — dark glass bar overlaid on hero */}
          <View style={styles.quickStatsBar}>
            {renderQuickStatValue(course.rating, 'Rating')}
            <View style={styles.quickStatDivider} />
            {renderQuickStatValue(course.slope, 'Slope')}
            <View style={styles.quickStatDivider} />
            {renderQuickStatValue(course.yardage ? course.yardage.toLocaleString() : null, 'Yards')}
            <View style={styles.quickStatDivider} />
            {renderQuickStatValue(course.num_holes || null, 'Holes')}
          </View>
        </View>

        {/* Your History Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your History</Text>

          {isLoadingHistory ? (
            <View style={styles.historyLoadingCard}>
              <ActivityIndicator size="small" color="#007aff" />
              <Text style={styles.historyLoadingText}>Loading your stats...</Text>
            </View>
          ) : historyStats && historyStats.roundsPlayed > 0 ? (
            <View style={styles.historyCard}>
              {/* Last played */}
              {historyStats.lastPlayed && (
                <View style={styles.lastPlayedRow}>
                  <Text style={styles.lastPlayedText}>Last played {formatRelativeDate(historyStats.lastPlayed)}</Text>
                </View>
              )}

              {/* Main stats grid */}
              <View style={styles.historyStatsGrid}>
                <View style={styles.historyMainStat}>
                  <Text style={styles.historyMainStatValue}>{historyStats.roundsPlayed}</Text>
                  <Text style={styles.historyMainStatLabel}>Rounds</Text>
                </View>
                <View style={styles.historyMainStat}>
                  <Text style={styles.historyMainStatValue}>{historyStats.averageScore || '—'}</Text>
                  <Text style={styles.historyMainStatLabel}>Avg Score</Text>
                </View>
                <View style={styles.historyMainStat}>
                  <Text style={[styles.historyMainStatValue, styles.bestScoreValue]}>{historyStats.bestScore || '—'}</Text>
                  <Text style={styles.historyMainStatLabel}>Best</Text>
                </View>
              </View>

              {/* Secondary stats */}
              <View style={styles.secondaryStatsRow}>
                <View style={styles.secondaryStat}>
                  <Text style={styles.secondaryStatValue}>{historyStats.averagePutts || '—'}</Text>
                  <Text style={styles.secondaryStatLabel}>Avg Putts</Text>
                </View>
                <View style={styles.secondaryStatDivider} />
                <View style={styles.secondaryStat}>
                  <Text style={styles.secondaryStatValue}>{historyStats.firPercent != null ? `${historyStats.firPercent}%` : '—'}</Text>
                  <Text style={styles.secondaryStatLabel}>Fairways</Text>
                </View>
                <View style={styles.secondaryStatDivider} />
                <View style={styles.secondaryStat}>
                  <Text style={styles.secondaryStatValue}>{historyStats.girPercent != null ? `${historyStats.girPercent}%` : '—'}</Text>
                  <Text style={styles.secondaryStatLabel}>GIR</Text>
                </View>
                <View style={styles.secondaryStatDivider} />
                <View style={styles.secondaryStat}>
                  <Text style={styles.secondaryStatValue}>{historyStats.worstScore || '—'}</Text>
                  <Text style={styles.secondaryStatLabel}>Worst</Text>
                </View>
              </View>

              {/* Score trend mini-chart */}
              {renderScoreTrend()}

              {/* Hole insights */}
              {renderTroubleHoles()}
              {renderBestHoles()}

              {/* Recent rounds list */}
              {renderRecentRounds()}
            </View>
          ) : (
            <View style={styles.noHistoryCard}>
              <View style={styles.noHistoryIconContainer}>
                <Ionicons name="trending-up" size={28} color="#007aff" />
              </View>
              <Text style={styles.noHistoryTitle}>No History Yet</Text>
              <Text style={styles.noHistorySubtitle}>
                Play your first round to start tracking your stats at this course
              </Text>
            </View>
          )}
        </View>

        {/* Weather Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Weather</Text>

          {isLoadingWeather ? (
            <View style={styles.weatherLoadingCard}>
              <ActivityIndicator size="small" color="#007aff" />
              <Text style={styles.weatherLoadingText}>Loading weather...</Text>
            </View>
          ) : weather ? (
            <>
              <View style={styles.weatherCard}>
                {/* Main weather row */}
                <View style={styles.weatherMainRow}>
                  <Text style={styles.weatherEmoji}>{weather.current.condition}</Text>
                  <View style={styles.weatherTempGroup}>
                    <Text style={styles.weatherTemp}>{weather.current.temp}°</Text>
                    <Text style={styles.weatherCondition}>{weather.current.conditionText}</Text>
                  </View>
                  <View style={styles.weatherFeelsLike}>
                    <Text style={styles.weatherFeelsLikeLabel}>Feels like</Text>
                    <Text style={styles.weatherFeelsLikeValue}>{weather.current.feelsLike}°</Text>
                  </View>
                </View>

                {/* Stats row */}
                <View style={styles.weatherStatsRow}>
                  <View style={styles.weatherStat}>
                    <Ionicons name="arrow-up-outline" size={14} color="#007aff" style={{ transform: [{ rotate: `${45}deg` }] }} />
                    <Text style={styles.weatherStatValue}>{weather.current.wind.speed} mph {weather.current.wind.direction}</Text>
                    <Text style={styles.weatherStatLabel}>Wind</Text>
                  </View>
                  <View style={styles.weatherStatDivider} />
                  <View style={styles.weatherStat}>
                    <Ionicons name="water-outline" size={14} color="#007aff" />
                    <Text style={styles.weatherStatValue}>{weather.current.humidity}%</Text>
                    <Text style={styles.weatherStatLabel}>Humidity</Text>
                  </View>
                  <View style={styles.weatherStatDivider} />
                  <View style={styles.weatherStat}>
                    <Ionicons name="rainy-outline" size={14} color="#007aff" />
                    <Text style={styles.weatherStatValue}>{weather.current.precipitation}%</Text>
                    <Text style={styles.weatherStatLabel}>Rain</Text>
                  </View>
                </View>

                {/* Hourly forecast */}
                {weather.forecast && weather.forecast.length > 0 && (
                  <View style={styles.weatherForecastRow}>
                    {weather.forecast.map((hour, i) => (
                      <View key={i} style={styles.weatherHourItem}>
                        <Text style={styles.weatherHourTime}>{hour.time}</Text>
                        <Text style={styles.weatherHourIcon}>{hour.icon}</Text>
                        <Text style={styles.weatherHourTemp}>{hour.temp}°</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* AI Weather Advice */}
              {getWeatherAdvice(weather).length > 0 && (
                <AICaddieCard title="Playing Conditions" style={styles.weatherAdviceCard}>
                  <View style={styles.weatherAdviceList}>
                    {getWeatherAdvice(weather).map((tip, i) => (
                      <View key={i} style={styles.weatherAdviceItem}>
                        <Text style={styles.weatherAdviceIcon}>{tip.icon}</Text>
                        <Text style={styles.weatherAdviceText}>{tip.text}</Text>
                      </View>
                    ))}
                  </View>
                </AICaddieCard>
              )}
            </>
          ) : null}
        </View>

        {/* Course Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Course Info</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color="#1DB954" />
              <Text style={styles.infoValue} numberOfLines={2}>
                {courseDetails.full_address || courseDetails.location}
              </Text>
            </View>

            {courseDetails.phone && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color="#1DB954" />
                <Text style={styles.infoValue}>{courseDetails.phone}</Text>
              </View>
            )}

            {courseDetails.website && (
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Ionicons name="globe-outline" size={20} color="#1DB954" />
                <Text style={[styles.infoValue, styles.infoValueLink]} numberOfLines={1}>
                  {courseDetails.website}
                </Text>
                <Ionicons name="open-outline" size={14} color="#007aff" />
              </View>
            )}
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={styles.bottomCTA}>
        <TouchableOpacity
          style={styles.bottomCTAButton}
          onPress={onStartRound}
          activeOpacity={0.8}
        >
          <Text style={styles.bottomCTAText}>Select Tees</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Hero Section — full bleed
  heroContainer: {
    height: 360,
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
  backButton: {},
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
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },

  // Course title overlay
  heroContent: {
    position: 'absolute',
    bottom: 84,
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
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: -0.3,
    flex: 1,
    marginLeft: 6,
  },

  // Quick Stats — dark glass bar overlaid on hero
  quickStatsBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  quickStatValueMissing: {
    fontSize: 20,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: -0.5,
  },
  quickStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  quickStatDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 4,
  },

  // Sections
  section: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.4,
    marginBottom: 14,
  },

  // History Loading
  historyLoadingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  historyLoadingText: {
    fontSize: 15,
    color: '#8e8e93',
    marginLeft: 10,
  },

  // History Card
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // Last played
  lastPlayedRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  lastPlayedText: {
    fontSize: 13,
    color: '#8e8e93',
    letterSpacing: -0.2,
  },

  // Main stats grid (3 big numbers)
  historyStatsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  historyMainStat: {
    flex: 1,
    alignItems: 'center',
  },
  historyMainStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.5,
  },
  historyMainStatLabel: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  bestScoreValue: {
    color: '#34c759',
  },

  // Secondary stats row
  secondaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  secondaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  secondaryStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },
  secondaryStatLabel: {
    fontSize: 11,
    color: '#8e8e93',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  secondaryStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e5e5',
  },

  // Score trend mini-chart
  trendContainer: {
    marginHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  trendLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 12,
    height: 70,
  },
  trendBarWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  trendBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8e8e93',
    marginBottom: 4,
  },
  trendBarLabelLatest: {
    color: '#007aff',
    fontWeight: '700',
  },
  trendBar: {
    width: 28,
    borderRadius: 6,
  },
  trendBarOld: {
    backgroundColor: '#e5e5ea',
  },
  trendBarLatest: {
    backgroundColor: '#007aff',
  },

  // Hole insights
  holeInsightSection: {
    marginHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  holeInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  holeInsightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  holeInsightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },
  holeInsightRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  holeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  troubleHoleBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  bestHoleBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  holeBadgeNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  holeBadgeStat: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff3b30',
  },

  // Recent rounds
  recentRoundsSection: {
    marginHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  recentRoundsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  recentRoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  recentRoundLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    width: 80,
  },
  recentRoundScore: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.4,
  },
  recentRoundToPar: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  recentRoundMiddle: {
    flex: 1,
  },
  recentRoundDate: {
    fontSize: 14,
    color: '#000',
    letterSpacing: -0.2,
  },
  recentRoundTee: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 1,
  },
  recentRoundRight: {
    alignItems: 'flex-end',
  },
  recentRoundStat: {
    fontSize: 13,
    color: '#8e8e93',
    letterSpacing: -0.2,
  },

  // No History
  noHistoryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  noHistoryIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noHistoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  noHistorySubtitle: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Weather Section
  weatherLoadingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  weatherLoadingText: {
    fontSize: 15,
    color: '#8e8e93',
    marginLeft: 10,
  },
  weatherCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  weatherMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  weatherEmoji: {
    fontSize: 40,
    marginRight: 14,
  },
  weatherTempGroup: {
    flex: 1,
  },
  weatherTemp: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.5,
  },
  weatherCondition: {
    fontSize: 14,
    color: '#8e8e93',
    letterSpacing: -0.2,
    marginTop: 1,
  },
  weatherFeelsLike: {
    alignItems: 'flex-end',
  },
  weatherFeelsLikeLabel: {
    fontSize: 12,
    color: '#8e8e93',
    letterSpacing: -0.2,
  },
  weatherFeelsLikeValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },
  weatherStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  weatherStat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  weatherStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },
  weatherStatLabel: {
    fontSize: 11,
    color: '#8e8e93',
    letterSpacing: -0.2,
  },
  weatherStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e5e5e5',
  },
  weatherForecastRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    justifyContent: 'space-around',
  },
  weatherHourItem: {
    alignItems: 'center',
    gap: 4,
  },
  weatherHourTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8e8e93',
    letterSpacing: -0.2,
  },
  weatherHourIcon: {
    fontSize: 20,
  },
  weatherHourTemp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },

  // AI Weather Advice
  weatherAdviceCard: {
    marginTop: 14,
  },
  weatherAdviceList: {
    gap: 12,
  },
  weatherAdviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherAdviceIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  weatherAdviceText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },

  // Course Info — clean, refined
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    gap: 14,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: 15,
    color: '#1c1c1e',
    letterSpacing: -0.2,
  },
  infoValueLink: {
    color: '#007aff',
  },

  // Bottom CTA
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f2f2f7',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#c6c6c8',
  },
  bottomCTAButton: {
    backgroundColor: '#34c759',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34c759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  bottomCTAText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.4,
  },
});
