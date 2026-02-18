import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

export default function StepIndicator({ currentStep = 1, totalSteps = 2 }) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const isLast = index === steps.length - 1;

        return (
          <View key={step} style={styles.stepGroup}>
            {/* Circle */}
            <View
              style={[
                styles.circle,
                (isActive || isCompleted) && styles.circleActive,
              ]}
            >
              {isCompleted ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.circleText,
                    (isActive || isCompleted) && styles.circleTextActive,
                  ]}
                >
                  {step}
                </Text>
              )}
            </View>

            {/* Connecting line */}
            {!isLast && (
              <View
                style={[
                  styles.line,
                  isCompleted && styles.lineActive,
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.neutral.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  circleActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[500],
  },
  circleText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.neutral.gray[400],
  },
  circleTextActive: {
    color: '#fff',
  },
  line: {
    width: 32,
    height: 2,
    backgroundColor: theme.colors.neutral.gray[300],
    marginHorizontal: 4,
  },
  lineActive: {
    backgroundColor: theme.colors.primary[500],
  },
});
