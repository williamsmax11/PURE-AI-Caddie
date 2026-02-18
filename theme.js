/**
 * Pure Design System
 * Premium golf-oriented theme with Inter typography
 */

// ========================================
// FONT FAMILIES (Inter - loaded in App.js)
// ========================================

export const fonts = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

// ========================================
// COLOR PALETTE
// ========================================

export const colors = {
  // Primary Colors - Premium Golf Green
  primary: {
    50: '#ECFDF5',    // Lightest green
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',   // Fairway green
    500: '#1DB954',   // Main brand green (richer, warmer)
    600: '#179443',
    700: '#0F6B31',   // Deep golf green
    800: '#0A4F24',   // Forest green for dark surfaces
    900: '#064E1B',   // Darkest
  },

  // Secondary Colors - Sky & Earth
  secondary: {
    50: '#f0f9ff',    // Sky blue
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',   // Clear sky
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },

  // Gold System - Masters/Trophy/Premium
  gold: {
    light: '#FFF8E1',     // Lightest gold tint
    100: '#FFECB3',
    200: '#FFE082',
    300: '#FFD54F',
    base: '#F5C518',      // Rich warm gold (Masters jacket)
    dark: '#C49B0E',      // Deep gold
    darker: '#8B6914',    // Darkest gold
  },

  // Accent Colors - Sunrise & Trophy
  accent: {
    amber: '#f59e0b',    // Sunrise/trophy gold
    orange: '#f97316',   // Energy orange
    teal: '#14b8a6',     // Water hazard
    emerald: '#10b981',  // Victory green
  },

  // Dark Palette - For AI cards, premium sections, overlays
  dark: {
    surface: '#1A1F2E',          // Deep navy-charcoal
    card: '#242938',              // Card surface on dark
    elevated: '#2E3445',          // Elevated elements on dark
    border: 'rgba(255,255,255,0.08)',  // Subtle borders on dark
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.7)',
      tertiary: 'rgba(255,255,255,0.4)',
    },
  },

  // Neutral Colors - Clean & Professional
  neutral: {
    white: '#ffffff',
    gray: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#e5e5e5',
      300: '#d4d4d4',
      400: '#a3a3a3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
    },
    black: '#0a0a0a',
  },

  // Semantic Colors
  semantic: {
    success: '#1DB954',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  // Background Colors
  background: {
    light: '#fafafa',      // Main light background
    white: '#ffffff',       // Card backgrounds
    cream: '#fefefe',       // Subtle variation
    green: {
      light: '#ECFDF5',     // Light green tint
      extraLight: '#f7fef9', // Very subtle green
    },
  },

  // Text Colors
  text: {
    primary: '#171717',     // Main text
    secondary: '#525252',   // Secondary text
    tertiary: '#a3a3a3',    // Disabled/placeholder
    inverse: '#ffffff',     // Text on dark backgrounds
    brand: '#0F6B31',       // Brand text (deep green)
  },
};

// ========================================
// GRADIENTS
// ========================================

export const gradients = {
  // Primary gradient - Golf course feel
  primary: {
    colors: ['#1DB954', '#179443'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Sky gradient - Clean and airy
  sky: {
    colors: ['#f0f9ff', '#e0f2fe'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Sunrise gradient - Warmth and energy
  sunrise: {
    colors: ['#fef3c7', '#fde68a', '#fbbf24'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  // Fairway gradient - Natural green
  fairway: {
    colors: ['#6EE7B7', '#34D399', '#1DB954'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Subtle gradient - Light backgrounds
  subtle: {
    colors: ['#ffffff', '#fafafa'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Premium gradient - Trophy/achievement feel (richer gold)
  premium: {
    colors: ['#F5C518', '#C49B0E'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Premium gold - For CTAs and special elements
  premiumGold: {
    colors: ['#FFD54F', '#F5C518', '#C49B0E'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Dark surface - For AI cards and premium sections
  darkSurface: {
    colors: ['#242938', '#1A1F2E'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Glass light - Frosted glass on light backgrounds
  glassLight: {
    colors: ['rgba(255, 255, 255, 0.8)', 'rgba(255, 255, 255, 0.6)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Glass dark - Frosted glass on dark backgrounds
  glassDark: {
    colors: ['rgba(0, 0, 0, 0.6)', 'rgba(0, 0, 0, 0.8)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Card overlay - Subtle depth
  cardOverlay: {
    colors: ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
};

// ========================================
// TYPOGRAPHY
// ========================================

export const typography = {
  // Font Families (Inter - loaded via expo-font in App.js)
  fonts: {
    primary: {
      light: fonts.light,
      regular: fonts.regular,
      medium: fonts.medium,
      semibold: fonts.semibold,
      bold: fonts.bold,
      extrabold: fonts.extrabold,
    },
    display: fonts.bold,
  },

  // Font Weights
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },

  // Font Sizes - Modular scale
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 40,
    '6xl': 48,
    '7xl': 56,
  },

  // Line Heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: -0.5,
    tight: -0.25,
    normal: 0,
    wide: 0.25,
    wider: 0.5,
    widest: 1,
    logo: 3,          // Elegant logo spacing
  },

  // Text Styles - Pre-configured combinations
  styles: {
    // Display text (hero sections)
    displayLarge: {
      fontFamily: fonts.bold,
      fontSize: 48,
      lineHeight: 56,
      letterSpacing: -0.5,
      color: colors.text.brand,
    },
    displayMedium: {
      fontFamily: fonts.bold,
      fontSize: 40,
      lineHeight: 48,
      letterSpacing: -0.25,
      color: colors.text.brand,
    },
    displaySmall: {
      fontFamily: fonts.bold,
      fontSize: 32,
      lineHeight: 40,
      color: colors.text.brand,
    },

    // Headings
    h1: {
      fontFamily: fonts.bold,
      fontSize: 32,
      lineHeight: 40,
      letterSpacing: -0.25,
      color: colors.text.primary,
    },
    h2: {
      fontFamily: fonts.semibold,
      fontSize: 28,
      lineHeight: 36,
      color: colors.text.primary,
    },
    h3: {
      fontFamily: fonts.semibold,
      fontSize: 24,
      lineHeight: 32,
      color: colors.text.primary,
    },
    h4: {
      fontFamily: fonts.semibold,
      fontSize: 20,
      lineHeight: 28,
      color: colors.text.primary,
    },
    h5: {
      fontFamily: fonts.semibold,
      fontSize: 18,
      lineHeight: 24,
      color: colors.text.primary,
    },

    // Body text
    bodyLarge: {
      fontFamily: fonts.regular,
      fontSize: 18,
      lineHeight: 28,
      color: colors.text.primary,
    },
    body: {
      fontFamily: fonts.regular,
      fontSize: 16,
      lineHeight: 24,
      color: colors.text.primary,
    },
    bodySmall: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.secondary,
    },

    // Labels and captions
    label: {
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.primary,
    },
    caption: {
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.text.tertiary,
    },

    // Special text
    buttonText: {
      fontFamily: fonts.semibold,
      fontSize: 16,
      lineHeight: 24,
      letterSpacing: 0.25,
    },

    // Logo wordmark - elegant, letter-spaced
    logo: {
      fontFamily: fonts.light,
      fontSize: 28,
      letterSpacing: 3,
      color: colors.text.inverse,
    },
  },
};

// ========================================
// SPACING
// ========================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
  '6xl': 80,
};

// ========================================
// BORDER RADIUS
// ========================================

export const borderRadius = {
  none: 0,
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  full: 9999,
};

// ========================================
// SHADOWS
// ========================================

export const shadows = {
  // Subtle shadow for cards
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  // Medium shadow for elevated cards
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  // Large shadow for modals and floating elements
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  // Extra large shadow for special emphasis
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },

  // Colored shadow for primary actions
  primaryGlow: {
    shadowColor: colors.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  // Gold glow for premium/achievement elements
  goldGlow: {
    shadowColor: colors.gold.base,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

// ========================================
// BUTTON STYLES
// ========================================

export const buttons = {
  // Primary button - Main actions
  primary: {
    base: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.md,
    },
    background: {
      colors: gradients.primary.colors,
      start: gradients.primary.start,
      end: gradients.primary.end,
    },
    text: {
      ...typography.styles.buttonText,
      color: colors.text.inverse,
    },
    disabled: {
      opacity: 0.5,
    },
  },

  // Secondary button - Alternative actions
  secondary: {
    base: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
      borderWidth: 2,
      borderColor: colors.primary[500],
      backgroundColor: colors.background.white,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      ...typography.styles.buttonText,
      color: colors.primary[600],
    },
    disabled: {
      opacity: 0.5,
    },
  },

  // Tertiary button - Subtle actions
  tertiary: {
    base: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.neutral.gray[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      ...typography.styles.buttonText,
      color: colors.text.primary,
    },
    disabled: {
      opacity: 0.5,
    },
  },

  // Ghost button - Minimal style
  ghost: {
    base: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      ...typography.styles.buttonText,
      color: colors.primary[600],
    },
    disabled: {
      opacity: 0.5,
    },
  },

  // Small button variant
  small: {
    base: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.base,
      borderRadius: borderRadius.base,
    },
    text: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
  },

  // Large button variant
  large: {
    base: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing['2xl'],
      borderRadius: borderRadius.xl,
    },
    text: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
    },
  },

  // Icon button
  icon: {
    base: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background.white,
      ...shadows.sm,
    },
  },

  // Floating action button
  fab: {
    base: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      bottom: spacing['2xl'],
      right: spacing['2xl'],
      ...shadows.lg,
    },
    background: {
      colors: gradients.primary.colors,
      start: gradients.primary.start,
      end: gradients.primary.end,
    },
  },
};

// ========================================
// CARD STYLES
// ========================================

export const cards = {
  // Standard card
  base: {
    backgroundColor: colors.background.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },

  // Elevated card
  elevated: {
    backgroundColor: colors.background.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },

  // Outlined card
  outlined: {
    backgroundColor: colors.background.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.gray[200],
    padding: spacing.lg,
  },

  // Feature card (for highlighting)
  feature: {
    backgroundColor: colors.background.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.md,
  },

  // Stats card
  stats: {
    backgroundColor: colors.background.green.light,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[500],
    ...shadows.sm,
  },

  // AI Caddie card - dark surface for AI-generated content
  ai: {
    backgroundColor: colors.dark.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[500],
    ...shadows.md,
  },
};

// ========================================
// INPUT STYLES
// ========================================

export const inputs = {
  base: {
    container: {
      marginBottom: spacing.base,
    },
    label: {
      ...typography.styles.label,
      marginBottom: spacing.xs,
      color: colors.text.secondary,
    },
    input: {
      fontFamily: fonts.regular,
      backgroundColor: colors.background.white,
      borderWidth: 1,
      borderColor: colors.neutral.gray[300],
      borderRadius: borderRadius.base,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      fontSize: typography.sizes.base,
      color: colors.text.primary,
    },
    inputFocused: {
      borderColor: colors.primary[500],
      borderWidth: 2,
    },
    error: {
      borderColor: colors.semantic.error,
    },
    errorText: {
      ...typography.styles.caption,
      color: colors.semantic.error,
      marginTop: spacing.xs,
    },
  },
};

// ========================================
// COMMON COMPONENT STYLES
// ========================================

export const components = {
  // Screen container
  screen: {
    flex: 1,
    backgroundColor: colors.background.light,
  },

  // Content container with padding
  container: {
    flex: 1,
    padding: spacing.lg,
  },

  // Section spacing
  section: {
    marginBottom: spacing.xl,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.neutral.gray[200],
    marginVertical: spacing.lg,
  },

  // Badge
  badge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[100],
  },
  badgeText: {
    ...typography.styles.caption,
    color: colors.primary[700],
    fontWeight: typography.weights.semibold,
  },

  // Chip
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.gray[100],
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Avatar
  avatar: {
    small: {
      width: 32,
      height: 32,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary[100],
    },
    medium: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary[100],
    },
    large: {
      width: 64,
      height: 64,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary[100],
    },
  },
};

// ========================================
// ANIMATION TIMINGS
// ========================================

export const animations = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
  },
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
};

// ========================================
// GOLF-SPECIFIC CONSTANTS
// ========================================

export const golfTheme = {
  // Course elements colors
  course: {
    fairway: colors.primary[400],
    green: colors.primary[600],
    rough: colors.primary[700],
    sand: '#f4d03f',
    water: colors.secondary[400],
    teeBox: colors.primary[300],
  },

  // Score colors
  score: {
    eagle: '#9333ea',      // Purple - excellent
    birdie: '#1DB954',     // Green - good
    par: '#3b82f6',        // Blue - neutral
    bogey: '#f59e0b',      // Orange - caution
    doubleBogey: '#ef4444', // Red - needs work
  },

  // Club type colors (for visualization)
  clubs: {
    driver: '#dc2626',
    woods: '#ea580c',
    irons: '#2563eb',
    wedges: '#16a34a',
    putter: '#7c3aed',
  },
};

// Export default theme object
export default {
  fonts,
  colors,
  gradients,
  typography,
  spacing,
  borderRadius,
  shadows,
  buttons,
  cards,
  inputs,
  components,
  animations,
  golfTheme,
};
