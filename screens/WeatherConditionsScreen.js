import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchWeather } from '../services/weatherService';
import AICaddieCard from '../components/AICaddieCard';
import PressableScale from '../components/PressableScale';
import theme from '../theme';

export default function WeatherConditionsScreen({
  course,
  selectedTee,
  onBack,
  onStartRound,
  onQuickPlay,
}) {
  const [weatherData, setWeatherData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(null);

  useEffect(() => {
    const loadWeather = async () => {
      setIsLoading(true);
      setWeatherError(null);

      const lat = course?.latitude || course?.coordinates?.latitude;
      const lng = course?.longitude || course?.coordinates?.longitude;

      if (!lat || !lng) {
        setWeatherError('No location data available for this course');
        setIsLoading(false);
        return;
      }

      const weather = await fetchWeather(lat, lng);
      if (weather) {
        setWeatherData(weather);
      } else {
        setWeatherError('Unable to load weather data');
      }
      setIsLoading(false);
    };

    loadWeather();
  }, [course]);

  const getConditionEmoji = (condition) => {
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
  };

  const generateAINotes = () => {
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
  };

  const hasGoodConditions = weatherData &&
    weatherData.current.temp >= 55 &&
    weatherData.current.temp <= 80 &&
    weatherData.current.wind.speed < 15;

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
        <Text style={styles.headerTitle}>Conditions</Text>
        <TouchableOpacity
          onPress={onQuickPlay}
          style={styles.skipButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipButtonText}>Quick Start</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Course Info Header */}
        <View style={styles.courseHeader}>
          <Text style={styles.courseName} numberOfLines={1}>{course.name}</Text>
          <View style={styles.teeInfoRow}>
            <View style={[styles.teeColorDot, { backgroundColor: getTeeColor(selectedTee?.color) }]} />
            <Text style={styles.teeInfoText}>
              {selectedTee?.color} Tees • {selectedTee?.yardage?.toLocaleString()} yards
            </Text>
          </View>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007aff" />
            <Text style={styles.loadingText}>Loading weather...</Text>
          </View>
        )}

        {/* Weather Card */}
        {!isLoading && weatherData && (
          <View style={styles.weatherCard}>
            {/* Main Weather Display */}
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

            {/* Weather Stats Grid */}
            <View style={styles.weatherStatsGrid}>
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatIcon}>💨</Text>
                <Text style={styles.weatherStatValue}>
                  {weatherData.current.wind.speed} mph
                </Text>
                <Text style={styles.weatherStatLabel}>
                  {weatherData.current.wind.direction}
                </Text>
              </View>
              <View style={styles.weatherStatDivider} />
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatIcon}>💧</Text>
                <Text style={styles.weatherStatValue}>
                  {weatherData.current.humidity}%
                </Text>
                <Text style={styles.weatherStatLabel}>Humidity</Text>
              </View>
              <View style={styles.weatherStatDivider} />
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatIcon}>🌧️</Text>
                <Text style={styles.weatherStatValue}>
                  {weatherData.current.precipitation}%
                </Text>
                <Text style={styles.weatherStatLabel}>Rain</Text>
              </View>
            </View>
          </View>
        )}

        {/* Hourly Forecast */}
        {!isLoading && weatherData?.forecast && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next 4 Hours</Text>
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

        {/* Pure AI Notes */}
        {!isLoading && weatherData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Caddie Notes</Text>
            <AICaddieCard title="Weather Impact">
              <View style={styles.aiNotesList}>
                {generateAINotes().map((note, index) => (
                  <View key={index} style={styles.aiNoteItem}>
                    <Text style={styles.aiNoteIcon}>{note.icon}</Text>
                    <Text style={styles.aiNoteText}>{note.text}</Text>
                  </View>
                ))}
              </View>
            </AICaddieCard>
          </View>
        )}

        {/* Weather Unavailable State */}
        {!isLoading && !weatherData && weatherError && (
          <View style={styles.unavailableCard}>
            <Text style={styles.unavailableIcon}>🌤️</Text>
            <Text style={styles.unavailableTitle}>Weather Unavailable</Text>
            <Text style={styles.unavailableSubtitle}>{weatherError}</Text>
          </View>
        )}

        {/* Bottom Spacing for fixed button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={styles.bottomCTA}>
        <PressableScale onPress={onStartRound} haptic="light">
          <LinearGradient
            colors={[theme.colors.primary[500], theme.colors.primary[600]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.startButton}
          >
            <Text style={styles.startButtonText}>Preview Round</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

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
  headerTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: theme.colors.text.primary,
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

  // Course Header
  courseHeader: {
    paddingVertical: 20,
  },
  courseName: {
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    color: theme.colors.text.primary,
    marginBottom: 8,
  },
  teeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.text.secondary,
    marginTop: 12,
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

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    color: theme.colors.text.primary,
    marginBottom: 12,
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

  // AI Notes (inside AICaddieCard)
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

  // Weather Unavailable
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

  // Bottom CTA
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.light,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.neutral.gray[200],
  },
  startButton: {
    borderRadius: theme.borderRadius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    shadowColor: theme.colors.primary[500],
  },
  startButtonText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    color: '#fff',
  },
});
