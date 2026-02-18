import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, AICaddieCard } from '../components';
import theme from '../theme';

const { width } = Dimensions.get('window');

// Mock hole data - replace with real course data
const MOCK_HOLE_DATA = {
  holeNumber: 1,
  par: 4,
  yardage: 389,
  handicap: 9,
  description: 'A slight dogleg right with bunkers guarding the left side of the fairway. Green slopes back to front.',
  hazards: ['Bunkers left', 'Out of bounds right'],
  aiTip: 'Driver aimed at left bunker will leave you 150-160 yards. Green accepts a high approach shot.',
};

export default function HoleViewScreen({
  course,
  selectedTee,
  currentHole = 1,
  onEndRound,
  onNextHole,
}) {
  const [score, setScore] = useState(null);

  const holeData = MOCK_HOLE_DATA;

  const handleScoreSelect = (selectedScore) => {
    setScore(selectedScore);
  };

  const handleNextHole = () => {
    if (currentHole < 18) {
      onNextHole(score);
      setScore(null);
    } else {
      onEndRound(score);
    }
  };

  // Generate score buttons (par - 2 to par + 3)
  const getScoreButtons = () => {
    const scores = [];
    for (let i = holeData.par - 2; i <= holeData.par + 3; i++) {
      if (i > 0) {
        scores.push(i);
      }
    }
    return scores;
  };

  const getScoreLabel = (scoreValue) => {
    const diff = scoreValue - holeData.par;
    if (diff === -2) return 'Eagle';
    if (diff === -1) return 'Birdie';
    if (diff === 0) return 'Par';
    if (diff === 1) return 'Bogey';
    if (diff === 2) return 'Double';
    if (diff === 3) return 'Triple';
    return '';
  };

  const getScoreColor = (scoreValue) => {
    const diff = scoreValue - holeData.par;
    if (diff <= -2) return theme.golfTheme.score.eagle;
    if (diff === -1) return theme.golfTheme.score.birdie;
    if (diff === 0) return theme.golfTheme.score.par;
    if (diff === 1) return theme.golfTheme.score.bogey;
    return theme.golfTheme.score.doubleBogey;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onEndRound} style={styles.endRoundButton}>
          <Text style={styles.endRoundText}>End Round</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>HOLE {holeData.holeNumber}</Text>
          <Text style={styles.headerSubtitle}>
            Par {holeData.par} • {holeData.yardage} yds
          </Text>
        </View>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Satellite View Placeholder */}
        <View style={styles.satelliteContainer}>
          <LinearGradient
            colors={['#4a7c59', '#5c8f6a', '#6ea57b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.satellitePlaceholder}
          >
            <Text style={styles.satelliteIcon}>🗺️</Text>
            <Text style={styles.satelliteText}>Satellite View</Text>
            <Text style={styles.satelliteSubtext}>Hole {holeData.holeNumber} Layout</Text>

            {/* Mock hole elements */}
            <View style={styles.mockHoleElements}>
              <View style={styles.teeBox}>
                <Text style={styles.elementLabel}>Tee</Text>
              </View>
              <View style={styles.fairway} />
              <View style={styles.green}>
                <Text style={styles.elementLabel}>Green</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Hole Information Card */}
        <Card variant="elevated" style={styles.holeInfoCard}>
          <View style={styles.holeStats}>
            <View style={styles.statItem}>
              <Text style={theme.typography.styles.caption}>Par</Text>
              <Text style={theme.typography.styles.h3}>{holeData.par}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={theme.typography.styles.caption}>Yardage</Text>
              <Text style={theme.typography.styles.h3}>{holeData.yardage}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={theme.typography.styles.caption}>Handicap</Text>
              <Text style={theme.typography.styles.h3}>{holeData.handicap}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={theme.typography.styles.body}>
            {holeData.description}
          </Text>

          {holeData.hazards.length > 0 && (
            <View style={styles.hazardsContainer}>
              <Text style={[theme.typography.styles.label, { marginBottom: theme.spacing.xs }]}>
                ⚠️ Hazards:
              </Text>
              {holeData.hazards.map((hazard, index) => (
                <Text key={index} style={theme.typography.styles.bodySmall}>
                  • {hazard}
                </Text>
              ))}
            </View>
          )}
        </Card>

        {/* Pure AI Tip */}
        <AICaddieCard title="Strategy" style={styles.aiTipCard}>
          {holeData.aiTip}
        </AICaddieCard>

        {/* Score Entry */}
        <View style={styles.scoreSection}>
          <Text style={theme.typography.styles.h4}>Enter Your Score</Text>

          <View style={styles.scoreButtons}>
            {getScoreButtons().map((scoreValue) => (
              <TouchableOpacity
                key={scoreValue}
                style={[
                  styles.scoreButton,
                  score === scoreValue && styles.scoreButtonSelected,
                ]}
                onPress={() => handleScoreSelect(scoreValue)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.scoreButtonNumber,
                    score === scoreValue && { color: theme.colors.text.inverse },
                  ]}
                >
                  {scoreValue}
                </Text>
                <Text
                  style={[
                    styles.scoreButtonLabel,
                    score === scoreValue && { color: theme.colors.text.inverse },
                  ]}
                >
                  {getScoreLabel(scoreValue)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            title={currentHole < 18 ? 'Next Hole →' : 'Finish Round'}
            onPress={handleNextHole}
            disabled={!score}
            size="large"
            fullWidth
            style={{ marginTop: theme.spacing.lg }}
          />
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: theme.spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.base,
    backgroundColor: theme.colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  endRoundButton: {
    paddingVertical: theme.spacing.sm,
  },
  endRoundText: {
    ...theme.typography.styles.body,
    color: theme.colors.semantic.error,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...theme.typography.styles.h4,
    fontWeight: theme.typography.weights.bold,
  },
  headerSubtitle: {
    ...theme.typography.styles.caption,
    color: theme.colors.text.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  satelliteContainer: {
    width: '100%',
    height: 250,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  satellitePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  satelliteIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.sm,
  },
  satelliteText: {
    ...theme.typography.styles.h4,
    color: theme.colors.text.inverse,
  },
  satelliteSubtext: {
    ...theme.typography.styles.bodySmall,
    color: theme.colors.text.inverse,
    opacity: 0.8,
  },
  mockHoleElements: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
  },
  teeBox: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  fairway: {
    width: '60%',
    height: 80,
    backgroundColor: 'rgba(76, 124, 89, 0.5)',
    alignSelf: 'center',
    borderRadius: theme.borderRadius.base,
  },
  green: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  elementLabel: {
    ...theme.typography.styles.caption,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  holeInfoCard: {
    marginBottom: theme.spacing.lg,
  },
  holeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.lg,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.neutral.gray[300],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.neutral.gray[200],
    marginVertical: theme.spacing.lg,
  },
  hazardsContainer: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.light,
    borderRadius: theme.borderRadius.base,
  },
  aiTipCard: {
    marginBottom: theme.spacing.lg,
  },
  scoreSection: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    ...theme.shadows.md,
  },
  scoreButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  scoreButton: {
    width: (width - theme.spacing.lg * 2 - theme.spacing.xl * 2 - theme.spacing.sm * 2) / 3,
    aspectRatio: 1,
    backgroundColor: theme.colors.background.light,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.neutral.gray[300],
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.sm,
  },
  scoreButtonSelected: {
    borderColor: theme.colors.primary[500],
    backgroundColor: theme.colors.primary[500] + '10',
  },
  scoreButtonNumber: {
    fontFamily: theme.fonts.bold,
    fontSize: 24,
    color: theme.colors.text.primary,
  },
  scoreButtonLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing.xs,
  },
});
