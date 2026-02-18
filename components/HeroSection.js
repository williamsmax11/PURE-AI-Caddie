/**
 * HeroSection Component
 *
 * Hero banner with golf course background image,
 * time-of-day adaptive gradient overlay, and dynamic greeting text.
 * Includes weather snippet when available.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../theme';
import { getGreeting } from '../utils/greetingUtils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.30;

/**
 * Returns gradient colors based on time of day for a natural feel.
 */
function getTimeOfDayGradient() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 8) {
    // Early morning - warm sunrise tint
    return ['rgba(255, 165, 0, 0.08)', 'rgba(0, 0, 0, 0.65)'];
  }
  if (hour >= 8 && hour < 11) {
    // Morning - fresh, bright
    return ['rgba(0, 0, 0, 0.02)', 'rgba(0, 0, 0, 0.6)'];
  }
  if (hour >= 11 && hour < 15) {
    // Midday - bright, slight blue
    return ['rgba(56, 189, 248, 0.05)', 'rgba(0, 0, 0, 0.55)'];
  }
  if (hour >= 15 && hour < 18) {
    // Afternoon - warm golden
    return ['rgba(245, 197, 24, 0.06)', 'rgba(0, 0, 0, 0.6)'];
  }
  if (hour >= 18 && hour < 20) {
    // Golden hour - rich amber
    return ['rgba(245, 158, 11, 0.1)', 'rgba(0, 0, 0, 0.7)'];
  }
  // Night
  return ['rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 0.75)'];
}

export default function HeroSection({
  userName,
  stats,
  weather,
}) {
  const insets = useSafeAreaInsets();
  const { greeting, subGreeting } = getGreeting(userName, stats);
  const gradientColors = useMemo(() => getTimeOfDayGradient(), []);

  // Format weather snippet if available
  const weatherSnippet = useMemo(() => {
    if (!weather?.current) return null;
    const temp = Math.round(weather.current.temp);
    const wind = weather.current.wind?.speed;
    let text = `${temp}°F`;
    if (wind != null) {
      if (wind < 5) text += ', calm';
      else if (wind < 12) text += ', light breeze';
      else if (wind < 20) text += ', breezy';
      else text += ', windy';
    }
    return text;
  }, [weather]);

  return (
    <ImageBackground
      source={require('../assets/golf-course-landscape.jpg')}
      style={styles.container}
      resizeMode="cover"
      imageStyle={styles.backgroundImage}
    >
      <LinearGradient
        colors={gradientColors}
        style={[styles.overlay, { paddingTop: insets.top + theme.spacing.sm }]}
      >
        {/* Header Row: Logo + Weather */}
        <View style={styles.header}>
          <Text style={styles.logoText}>PURE</Text>
          {weatherSnippet && (
            <View style={styles.weatherPill}>
              <Text style={styles.weatherText}>{weatherSnippet}</Text>
            </View>
          )}
        </View>

        {/* Greeting Section */}
        <View style={styles.greetingContainer}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subGreeting}>{subGreeting}</Text>
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HERO_HEIGHT,
    width: '100%',
    overflow: 'hidden',
  },
  backgroundImage: {
    top: -20,
  },
  overlay: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoText: {
    fontFamily: theme.fonts.light,
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 3,
  },
  weatherPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  weatherText: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  greetingContainer: {
    paddingBottom: theme.spacing['3xl'],
  },
  greeting: {
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    color: '#fff',
    marginBottom: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subGreeting: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
