/**
 * Auth Screen — Login / Sign Up
 *
 * Modern design with hero image background matching the home screen.
 * Email + password authentication via Supabase Auth.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ImageBackground,
  Image,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signUp, signIn } from '../services/authService';
import theme from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.32;
const HERO_HEIGHT_COLLAPSED = SCREEN_HEIGHT * 0.12;

export default function AuthScreen({ onAuthSuccess }) {
  const insets = useSafeAreaInsets();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);

  // Slide-up animation for form card
  const formSlide = useRef(new Animated.Value(60)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const heroHeight = useRef(new Animated.Value(HERO_HEIGHT)).current;
  const scrollRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(formSlide, {
        toValue: 0,
        damping: 20,
        stiffness: 90,
        useNativeDriver: true,
      }),
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Collapse hero when keyboard opens, expand when it closes
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = () => {
      Animated.timing(heroHeight, {
        toValue: HERO_HEIGHT_COLLAPSED,
        duration: 250,
        useNativeDriver: false,
      }).start();
    };
    const onKeyboardHide = () => {
      Animated.timing(heroHeight, {
        toValue: HERO_HEIGHT,
        duration: 250,
        useNativeDriver: false,
      }).start();
    };

    const sub1 = Keyboard.addListener(showEvent, onKeyboardShow);
    const sub2 = Keyboard.addListener(hideEvent, onKeyboardHide);
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  const validateForm = () => {
    setErrorMessage('');
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return false;
    }
    if (!isLogin && password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (isLogin) {
        const { data, error } = await signIn(email.trim().toLowerCase(), password);
        if (error) {
          setErrorMessage(error.message);
        } else {
          onAuthSuccess(data.session);
        }
      } else {
        const { data, error } = await signUp(email.trim().toLowerCase(), password);
        if (error) {
          setErrorMessage(error.message);
        } else if (data.session) {
          onAuthSuccess(data.session);
        } else {
          setConfirmationSent(true);
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = email.trim() && password.length >= 6 && (isLogin || password === confirmPassword);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Hero Section with Background Image — collapses when keyboard opens */}
      <Animated.View style={{ height: heroHeight, overflow: 'hidden' }}>
        <ImageBackground
          source={require('../assets/golf-course-landscape.jpg')}
          style={styles.heroContainer}
          resizeMode="cover"
          imageStyle={styles.heroImage}
        >
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.7)']}
            style={[styles.heroOverlay, { paddingTop: insets.top + theme.spacing.lg }]}
          >
            <View style={styles.logoContainer}>
              <Image
                source={require('../assets/Pure_Logo_white.png')}
                style={styles.logoImage}
              />
              <Text style={styles.logoText}>PURE</Text>
              <Text style={styles.tagline}>AI Caddie</Text>
            </View>
          </LinearGradient>
        </ImageBackground>
      </Animated.View>

      {/* Form Card — animated slide-up */}
      <Animated.View
        style={[
          styles.formWrapper,
          { transform: [{ translateY: formSlide }], opacity: formOpacity },
        ]}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.formCard}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
          {confirmationSent ? (
            /* Email Confirmation Sent */
            <View style={styles.confirmationContainer}>
              <Text style={styles.confirmationIcon}>✉️</Text>
              <Text style={styles.confirmationTitle}>Check Your Email</Text>
              <Text style={styles.confirmationText}>
                We sent a confirmation link to{'\n'}
                <Text style={styles.confirmationEmail}>{email}</Text>
              </Text>
              <Text style={styles.confirmationHint}>
                Click the link in the email to verify your account, then come back here and log in.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  setConfirmationSent(false);
                  setIsLogin(true);
                  setPassword('');
                  setConfirmPassword('');
                  setErrorMessage('');
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.primary[500], theme.colors.primary[600]]}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Go to Log In</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            /* Login / Sign Up Form */
            <View>
              <Text style={styles.formTitle}>
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </Text>
              <Text style={styles.formSubtitle}>
                {isLogin ? 'Sign in to continue' : 'Join the Pure community'}
              </Text>

              {/* Login / Sign Up Tabs */}
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tab, isLogin && styles.tabActive]}
                  onPress={() => { setIsLogin(true); setErrorMessage(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
                    Log In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, !isLogin && styles.tabActive]}
                  onPress={() => { setIsLogin(false); setErrorMessage(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={theme.colors.text.tertiary}
                  secureTextEntry
                />
              </View>

              {/* Confirm Password (signup only) */}
              {!isLogin && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    placeholderTextColor={theme.colors.text.tertiary}
                    secureTextEntry
                  />
                </View>
              )}

              {/* Error Message */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryButton, (!isFormValid || isLoading) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!isFormValid || isLoading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={isFormValid && !isLoading
                    ? [theme.colors.primary[500], theme.colors.primary[600]]
                    : [theme.colors.neutral.gray[300], theme.colors.neutral.gray[300]]}
                  style={styles.buttonGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[
                      styles.buttonText,
                      (!isFormValid || isLoading) && styles.buttonTextDisabled,
                    ]}>
                      {isLogin ? 'Log In' : 'Create Account'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

            </View>
          )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  heroContainer: {
    height: HERO_HEIGHT,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  heroImage: {
    top: -20,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing['3xl'],
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: theme.spacing.md,
  },
  logoText: {
    fontFamily: theme.fonts.light,
    fontSize: 32,
    color: '#fff',
    letterSpacing: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tagline: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1,
    marginTop: theme.spacing.xs,
  },
  formWrapper: {
    flex: 1,
    marginTop: -24,
  },
  formCard: {
    flex: 1,
    backgroundColor: theme.colors.background.white,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
  },
  formContent: {
    padding: theme.spacing.xl,
    paddingTop: theme.spacing['2xl'],
    paddingBottom: 40,
  },
  formTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },
  formSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xl,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.neutral.gray[100],
    borderRadius: theme.borderRadius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.background.white,
    ...theme.shadows.sm,
  },
  tabText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.text.tertiary,
  },
  tabTextActive: {
    color: theme.colors.primary[600],
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    fontFamily: theme.fonts.regular,
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.base,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  errorContainer: {
    backgroundColor: theme.colors.semantic.error + '15',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.semantic.error,
  },
  errorText: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.semantic.error,
    fontSize: 14,
  },
  primaryButton: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  buttonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonGradient: {
    paddingVertical: theme.spacing.base,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: '#fff',
  },
  buttonTextDisabled: {
    color: theme.colors.text.tertiary,
  },
  confirmationContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  confirmationIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.lg,
  },
  confirmationTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 24,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  confirmationText: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.sm,
  },
  confirmationEmail: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.primary[600],
  },
  confirmationHint: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
});
