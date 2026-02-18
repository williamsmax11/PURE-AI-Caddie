/**
 * EXAMPLE: OnboardingScreen Refactored with Design System
 *
 * This is a refactored version of OnboardingScreen.js that demonstrates
 * how to use the new design system (theme.js) for consistent, professional styling.
 *
 * Compare this with the original OnboardingScreen.js to see the improvements:
 * - Cleaner, more maintainable code
 * - Consistent spacing and colors from theme
 * - Reusable components (Button, Input, Card)
 * - Better adherence to design system
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Input, Card } from '../components';
import theme from '../theme';

const { width, height } = Dimensions.get('window');

const handicapOptions = [
  '0-5',
  '6-10',
  '11-15',
  '16-20',
  '21-25',
  '26-30',
  '30+',
  "Don't know",
];

const frequencyOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: '2-3x', label: '2-3x/month' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'occasionally', label: 'Occasionally' },
];

const goalOptions = [
  { value: 'lower', label: 'Lower score', icon: '🎯' },
  { value: 'fun', label: 'Have fun', icon: '😊' },
  { value: 'both', label: 'Both', icon: '🏆' },
];

export default function OnboardingScreenRefactored({ onComplete }) {
  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [frequency, setFrequency] = useState('');
  const [goal, setGoal] = useState('');
  const [showHandicapDropdown, setShowHandicapDropdown] = useState(false);
  const [showFrequencyDropdown, setShowFrequencyDropdown] = useState(false);

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const logoScale = useState(new Animated.Value(0.8))[0];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isFormValid = name.trim() && handicap && frequency && goal;

  const handleContinue = async () => {
    if (!isFormValid) return;

    const userProfile = {
      name,
      handicap,
      frequency,
      goal,
      onboardingCompleted: true,
    };

    await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
    onComplete();
  };

  const getFrequencyLabel = (value) => {
    const option = frequencyOptions.find((f) => f.value === value);
    return option ? option.label : 'Select frequency';
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#f0fdf4', '#dcfce7', '#bbf7d0']}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Branding - Using theme */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: logoScale }],
              },
            ]}
          >
            <LinearGradient
              colors={theme.gradients.primary.colors}
              start={theme.gradients.primary.start}
              end={theme.gradients.primary.end}
              style={styles.logo}
            >
              <Text style={styles.logoIcon}>⛳</Text>
            </LinearGradient>

            <Text style={[theme.typography.styles.displayMedium, styles.title]}>
              Pure
            </Text>
            <Text style={[theme.typography.styles.bodySmall, styles.subtitle]}>
              Your intelligent golf companion
            </Text>
          </Animated.View>

          {/* Main Form - Using Card component */}
          <Animated.View
            style={[
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Card variant="elevated" style={styles.formCard}>
              <Text style={theme.typography.styles.h3}>
                Let's Get to Know Your Game
              </Text>
              <Text
                style={[
                  theme.typography.styles.bodySmall,
                  { marginTop: theme.spacing.xs, marginBottom: theme.spacing.xl },
                ]}
              >
                Help us personalize your experience
              </Text>

              {/* Name Input - Using Input component */}
              <Input
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
              />

              {/* Handicap Dropdown */}
              <View style={{ marginBottom: theme.spacing.base }}>
                <Text style={theme.inputs.base.label}>Handicap</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowHandicapDropdown(true)}
                >
                  <Text
                    style={[
                      theme.typography.styles.body,
                      !handicap && { color: theme.colors.text.tertiary },
                    ]}
                  >
                    {handicap || 'Select your handicap'}
                  </Text>
                  <Text style={{ color: theme.colors.text.secondary }}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Frequency Dropdown */}
              <View style={{ marginBottom: theme.spacing.base }}>
                <Text style={theme.inputs.base.label}>How often do you play?</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowFrequencyDropdown(true)}
                >
                  <Text
                    style={[
                      theme.typography.styles.body,
                      !frequency && { color: theme.colors.text.tertiary },
                    ]}
                  >
                    {getFrequencyLabel(frequency)}
                  </Text>
                  <Text style={{ color: theme.colors.text.secondary }}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Goal Selection - Using theme colors */}
              <View style={{ marginBottom: theme.spacing.base }}>
                <Text style={theme.inputs.base.label}>Primary goal?</Text>
                <View style={styles.goalContainer}>
                  {goalOptions.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.goalButton,
                        goal === option.value && styles.goalButtonSelected,
                      ]}
                      onPress={() => setGoal(option.value)}
                    >
                      <Text style={styles.goalIcon}>{option.icon}</Text>
                      <Text style={theme.typography.styles.label}>
                        {option.label}
                      </Text>
                      {goal === option.value && (
                        <View style={styles.checkmark}>
                          <Text style={styles.checkmarkText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Continue Button - Using Button component */}
              <Button
                title="Continue"
                onPress={handleContinue}
                disabled={!isFormValid}
                fullWidth
                size="large"
                style={{ marginTop: theme.spacing.xl }}
              />
            </Card>
          </Animated.View>
        </ScrollView>

        {/* Handicap Modal - Using theme */}
        <Modal
          visible={showHandicapDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHandicapDropdown(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowHandicapDropdown(false)}
          >
            <View style={styles.modalContent}>
              <Text style={theme.typography.styles.h4}>Select Handicap</Text>
              <View style={theme.components.divider} />
              <ScrollView style={styles.modalScroll}>
                {handicapOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.modalOption,
                      handicap === option && styles.modalOptionSelected,
                    ]}
                    onPress={() => {
                      setHandicap(option);
                      setShowHandicapDropdown(false);
                    }}
                  >
                    <Text style={theme.typography.styles.body}>{option}</Text>
                    {handicap === option && (
                      <Text style={{ color: theme.colors.primary[600], fontSize: 20 }}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Frequency Modal - Using theme */}
        <Modal
          visible={showFrequencyDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFrequencyDropdown(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowFrequencyDropdown(false)}
          >
            <View style={styles.modalContent}>
              <Text style={theme.typography.styles.h4}>How Often Do You Play?</Text>
              <View style={theme.components.divider} />
              <ScrollView style={styles.modalScroll}>
                {frequencyOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.modalOption,
                      frequency === option.value && styles.modalOptionSelected,
                    ]}
                    onPress={() => {
                      setFrequency(option.value);
                      setShowFrequencyDropdown(false);
                    }}
                  >
                    <Text style={theme.typography.styles.body}>{option.label}</Text>
                    {frequency === option.value && (
                      <Text style={{ color: theme.colors.primary[600], fontSize: 20 }}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.xl,
    paddingTop: theme.spacing['5xl'],
    paddingBottom: theme.spacing['3xl'],
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing['4xl'],
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
    ...theme.shadows.primaryGlow,
  },
  logoIcon: {
    fontSize: 56,
  },
  title: {
    color: theme.colors.text.brand,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.text.secondary,
  },
  formCard: {
    backgroundColor: theme.colors.background.white,
  },
  dropdown: {
    backgroundColor: theme.colors.background.white,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[300],
    borderRadius: theme.borderRadius.base,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  goalButton: {
    flex: 1,
    backgroundColor: theme.colors.background.white,
    borderWidth: 2,
    borderColor: theme.colors.neutral.gray[300],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    position: 'relative',
  },
  goalButtonSelected: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.primary[500],
  },
  goalIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.sm,
  },
  checkmark: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    fontSize: 12,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.weights.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    width: width * 0.85,
    maxHeight: height * 0.6,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  modalScroll: {
    maxHeight: height * 0.4,
  },
  modalOption: {
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.base,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background.light,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOptionSelected: {
    backgroundColor: theme.colors.primary[50],
  },
});
