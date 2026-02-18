import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../theme';

export default function RoundStartTransition({ onTransitionComplete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Animate entrance
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Wait 2.5 seconds then transition to hole view
    const timer = setTimeout(() => {
      // Fade out animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onTransitionComplete();
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.gradients.fairway.colors}
        start={theme.gradients.fairway.start}
        end={theme.gradients.fairway.end}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim },
              ],
            },
          ]}
        >
          <Image
            source={require('../assets/Pure_Logo.png')}
            style={styles.logoImage}
          />

          <Text style={styles.title}>ROUND STARTED!</Text>

          <View style={styles.messageContainer}>
            <Text style={styles.message}>Good luck out there.</Text>
            <Text style={styles.message}>I'll be with you every shot.</Text>
          </View>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: theme.spacing['2xl'],
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: theme.spacing['2xl'],
  },
  title: {
    fontFamily: theme.fonts.light,
    fontSize: 28,
    color: theme.colors.text.inverse,
    letterSpacing: 4,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  messageContainer: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    color: theme.colors.text.inverse,
    textAlign: 'center',
    opacity: 0.85,
    lineHeight: 26,
  },
});
