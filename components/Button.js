import React, { useRef } from 'react';
import { Text, View, Animated, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

/**
 * Reusable Button Component
 * Now with press-scale animation and haptic feedback.
 */
const Button = ({
  title,
  onPress,
  variant = 'primary', // primary, secondary, tertiary, ghost
  size = 'medium',     // small, medium, large
  disabled = false,
  icon = null,
  fullWidth = false,
  haptic = true,
  style,
  textStyle,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
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
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  // Get button configuration based on variant
  const getButtonConfig = () => {
    switch (variant) {
      case 'primary':
        return theme.buttons.primary;
      case 'secondary':
        return theme.buttons.secondary;
      case 'tertiary':
        return theme.buttons.tertiary;
      case 'ghost':
        return theme.buttons.ghost;
      default:
        return theme.buttons.primary;
    }
  };

  // Get size configuration
  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return theme.buttons.small;
      case 'large':
        return theme.buttons.large;
      default:
        return { base: {}, text: {} };
    }
  };

  const buttonConfig = getButtonConfig();
  const sizeConfig = getSizeConfig();

  // Combine styles
  const buttonStyle = [
    buttonConfig.base,
    sizeConfig.base,
    fullWidth && { width: '100%' },
    style,
  ];

  const textStyleCombined = [
    buttonConfig.text,
    sizeConfig.text,
    textStyle,
  ];

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon && <View style={{ marginRight: theme.spacing.sm }}>{icon}</View>}
      <Text style={textStyleCombined}>{title}</Text>
    </View>
  );

  // Render primary button with gradient
  if (variant === 'primary') {
    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
      >
        <Animated.View
          style={[
            buttonStyle,
            { overflow: 'hidden', transform: [{ scale: scaleAnim }] },
            disabled && buttonConfig.disabled,
          ]}
        >
          <LinearGradient
            colors={buttonConfig.background.colors}
            start={buttonConfig.background.start}
            end={buttonConfig.background.end}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          />
          {content}
        </Animated.View>
      </Pressable>
    );
  }

  // Render other button variants
  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View
        style={[
          buttonStyle,
          { transform: [{ scale: scaleAnim }] },
          disabled && buttonConfig.disabled,
        ]}
      >
        {content}
      </Animated.View>
    </Pressable>
  );
};

export default Button;
