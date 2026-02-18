/**
 * BottomTabBar Component
 *
 * iOS-style bottom tab bar with icon above label.
 * All labels always visible. Active tab uses filled icon + primary color.
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const TABS = [
  { key: 'home', label: 'Home', icon: 'home', iconOutline: 'home-outline' },
  { key: 'myBag', label: 'My Bag', icon: 'bag-handle', iconOutline: 'bag-handle-outline' },
  { key: 'roundHistory', label: 'History', icon: 'time', iconOutline: 'time-outline' },
  { key: 'playerInsights', label: 'Insights', icon: 'stats-chart', iconOutline: 'stats-chart-outline' },
  { key: 'settings', label: 'Settings', icon: 'settings', iconOutline: 'settings-outline' },
];

function TabItem({ tab, isActive, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconName = isActive ? tab.icon : tab.iconOutline;
  const color = isActive ? theme.colors.primary[500] : theme.colors.text.tertiary;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(tab.key);
  };

  return (
    <Pressable
      style={styles.tab}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      <Animated.View
        style={[
          styles.tabInner,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons name={iconName} size={22} color={color} />
        <Text
          style={[styles.tabLabel, isActive && styles.tabLabelActive]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function BottomTabBar({ currentScreen, onNavigate }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);

  const tabBarContent = (
    <View style={[styles.innerContainer, { paddingBottom: bottomPadding }]}>
      {TABS.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          isActive={currentScreen === tab.key}
          onPress={onNavigate}
        />
      ))}
    </View>
  );

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.floatingWrapper}>
        <BlurView intensity={80} tint="light" style={styles.blurContainer}>
          {tabBarContent}
        </BlurView>
      </View>
    );
  }

  // Android fallback
  return (
    <View style={[styles.floatingWrapper, styles.androidContainer]}>
      {tabBarContent}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  androidContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.neutral.gray[200],
  },
  innerContainer: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    color: theme.colors.text.tertiary,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.primary[500],
  },
});
