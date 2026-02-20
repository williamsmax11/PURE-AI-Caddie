/**
 * QuickActionCard Component
 *
 * Prominent action cards for primary CTAs like "Start Round" and "Resume Round".
 * Supports primary (green gradient), warning (amber), and hero (image-backed) variants.
 * Now with press-scale animation and Inter typography.
 */

import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import theme from '../theme';

export default function QuickActionCard({
  title,
  subtitle,
  icon = 'golf',
  onPress,
  variant = 'primary', // 'primary' | 'warning' | 'hero'
  backgroundImage,
}) {
  // Hero variant: image-backed card with gradient overlay
  if (variant === 'hero' && backgroundImage) {
    return (
      <PressableScale onPress={onPress} haptic="light" scaleValue={0.975}>
        <View style={styles.heroWrapper}>
          <ImageBackground
            source={backgroundImage}
            style={styles.heroImage}
            imageStyle={styles.heroImageInner}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.82)']}
              locations={[0, 0.35, 1]}
              style={styles.heroGradient}
            >
              <View style={styles.heroContent}>
                <View style={styles.heroTextSection}>
                  <Text style={styles.heroTitle}>{title}</Text>
                  {subtitle && (
                    <Text style={styles.heroSubtitle}>{subtitle}</Text>
                  )}
                </View>
                <View style={styles.heroPlayButton}>
                  <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>
      </PressableScale>
    );
  }

  const isPrimary = variant === 'primary';

  const cardContent = (
    <>
      <View style={[styles.iconContainer, !isPrimary && styles.iconContainerWarning]}>
        <Ionicons
          name={icon}
          size={26}
          color={isPrimary ? '#fff' : theme.colors.accent.amber}
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, !isPrimary && styles.titleWarning]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, !isPrimary && styles.subtitleWarning]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={22}
        color={isPrimary ? 'rgba(255,255,255,0.7)' : theme.colors.accent.amber}
      />
    </>
  );

  if (isPrimary) {
    return (
      <PressableScale onPress={onPress} haptic="light">
        <LinearGradient
          colors={[theme.colors.primary[500], theme.colors.primary[600]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.container}
        >
          {cardContent}
        </LinearGradient>
      </PressableScale>
    );
  }

  return (
    <PressableScale onPress={onPress} haptic="light">
      <View style={[styles.container, styles.warningContainer]}>
        {cardContent}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  warningContainer: {
    backgroundColor: theme.colors.accent.amber + '12',
    borderWidth: 1,
    borderColor: theme.colors.accent.amber + '30',
    shadowColor: theme.colors.accent.amber,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  iconContainerWarning: {
    backgroundColor: theme.colors.accent.amber + '18',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: '#fff',
  },
  titleWarning: {
    color: theme.colors.text.primary,
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  subtitleWarning: {
    color: theme.colors.text.secondary,
  },

  // Hero variant styles
  heroWrapper: {
    height: 170,
    borderRadius: theme.borderRadius['2xl'],
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  heroImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  heroImageInner: {
    borderRadius: theme.borderRadius['2xl'],
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroTextSection: {
    flex: 1,
    marginRight: 16,
  },
  heroTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    color: '#fff',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  heroPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary[700],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});
