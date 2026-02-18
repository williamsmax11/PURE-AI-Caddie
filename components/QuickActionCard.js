/**
 * QuickActionCard Component
 *
 * Prominent action cards for primary CTAs like "Start Round" and "Resume Round".
 * Supports primary (green gradient) and warning (amber) variants.
 * Now with press-scale animation and Inter typography.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import theme from '../theme';

export default function QuickActionCard({
  title,
  subtitle,
  icon = 'golf',
  onPress,
  variant = 'primary', // 'primary' | 'warning'
}) {
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
});
