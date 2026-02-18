/**
 * AnimatedNumber Component
 *
 * Animates a number counting up from 0 to the target value.
 * Used for stats display (handicap, average score, round count).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated } from 'react-native';

export default function AnimatedNumber({
  value,
  decimals = 0,
  duration = 800,
  prefix = '',
  suffix = '',
  style,
  placeholder = '--',
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(placeholder);
  const previousValue = useRef(null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplayValue(placeholder);
      return;
    }

    const numValue = Number(value);
    if (isNaN(numValue)) {
      setDisplayValue(placeholder);
      return;
    }

    const startFrom = previousValue.current !== null ? previousValue.current : 0;
    previousValue.current = numValue;

    animatedValue.setValue(startFrom);

    const listener = animatedValue.addListener(({ value: v }) => {
      if (decimals > 0) {
        setDisplayValue(`${prefix}${v.toFixed(decimals)}${suffix}`);
      } else {
        setDisplayValue(`${prefix}${Math.round(v)}${suffix}`);
      }
    });

    Animated.timing(animatedValue, {
      toValue: numValue,
      duration,
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [value, decimals, duration, prefix, suffix, placeholder]);

  return <Text style={style}>{displayValue}</Text>;
}
