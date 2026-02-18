import React from 'react';
import { View, Text } from 'react-native';
import theme from '../theme';

/**
 * Reusable Card Component
 * Usage examples at the bottom of this file
 */
const Card = ({
  children,
  variant = 'base', // base, elevated, outlined, feature, stats
  title,
  subtitle,
  style,
}) => {
  // Get card configuration based on variant
  const getCardStyle = () => {
    switch (variant) {
      case 'elevated':
        return theme.cards.elevated;
      case 'outlined':
        return theme.cards.outlined;
      case 'feature':
        return theme.cards.feature;
      case 'stats':
        return theme.cards.stats;
      default:
        return theme.cards.base;
    }
  };

  const cardStyle = getCardStyle();

  return (
    <View style={[cardStyle, style]}>
      {title && (
        <View style={{ marginBottom: theme.spacing.md }}>
          <Text style={theme.typography.styles.h4}>{title}</Text>
          {subtitle && (
            <Text style={[theme.typography.styles.bodySmall, { marginTop: theme.spacing.xs }]}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
};

export default Card;

/**
 * USAGE EXAMPLES:
 *
 * // Basic card
 * <Card>
 *   <Text>Card content goes here</Text>
 * </Card>
 *
 * // Card with title and subtitle
 * <Card
 *   title="Recent Rounds"
 *   subtitle="Your last 5 golf rounds"
 * >
 *   <Text>Content here</Text>
 * </Card>
 *
 * // Elevated card (more shadow)
 * <Card variant="elevated">
 *   <Text>Important content</Text>
 * </Card>
 *
 * // Feature card (larger, more prominent)
 * <Card variant="feature" title="AI Recommendations">
 *   <Text>Premium feature content</Text>
 * </Card>
 *
 * // Stats card (colored border, light background)
 * <Card variant="stats" title="Average Score">
 *   <Text style={theme.typography.styles.displayMedium}>72</Text>
 * </Card>
 *
 * // Custom styled card
 * <Card style={{ marginTop: 20, backgroundColor: theme.colors.primary[50] }}>
 *   <Text>Custom card</Text>
 * </Card>
 */
