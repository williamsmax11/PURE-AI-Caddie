import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import theme from '../theme';

/**
 * EffectiveDistanceDisplay Component
 *
 * Shows the adjusted "plays like" distance with a tappable breakdown.
 * Displays: Actual → Effective with adjustment details.
 *
 * Props:
 * - actualDistance: Raw distance in yards
 * - preCalculated: Shot context from calculateShotContext()
 * - style: Additional container styles
 * - compact: Show compact version (just the number)
 */
const EffectiveDistanceDisplay = ({
  actualDistance,
  preCalculated,
  style,
  compact = false,
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // If no pre-calculated data, just show actual distance
  if (!preCalculated || !preCalculated.effectiveDistance) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.actualDistanceLarge}>{actualDistance}</Text>
        <Text style={styles.yardLabel}>yds</Text>
      </View>
    );
  }

  const { effectiveDistance, adjustments } = preCalculated;
  const totalAdjustment = effectiveDistance - actualDistance;
  const hasAdjustments = Math.abs(totalAdjustment) >= 1;

  // Build adjustment items for the modal
  const adjustmentItems = [];

  // Wind adjustment
  if (adjustments?.wind && Math.abs(adjustments.wind.distanceEffect) >= 1) {
    const windEffect = adjustments.wind.distanceEffect;
    adjustmentItems.push({
      label: `Wind (${adjustments.wind.windEffect})`,
      value: windEffect,
      icon: windEffect > 0 ? '💨' : '🍃',
      detail: adjustments.wind.description,
    });
  }

  // Temperature adjustment
  if (adjustments?.temperature && Math.abs(adjustments.temperature.distanceEffect) >= 1) {
    const tempEffect = adjustments.temperature.distanceEffect;
    adjustmentItems.push({
      label: `Temperature`,
      value: tempEffect,
      icon: tempEffect > 0 ? '❄️' : '☀️',
      detail: adjustments.temperature.description,
    });
  }

  // Elevation adjustment
  if (adjustments?.elevation && Math.abs(adjustments.elevation.slopeEffect) >= 1) {
    const elevEffect = adjustments.elevation.slopeEffect;
    adjustmentItems.push({
      label: `Elevation (${Math.abs(adjustments.elevation.elevationDelta)}ft ${elevEffect > 0 ? 'uphill' : 'downhill'})`,
      value: elevEffect,
      icon: elevEffect > 0 ? '⬆️' : '⬇️',
      detail: adjustments.elevation.description,
    });
  }

  // Altitude effect (thinner air at elevation)
  if (adjustments?.elevation && Math.abs(adjustments.elevation.altitudeEffect) >= 1) {
    adjustmentItems.push({
      label: 'Altitude (thinner air)',
      value: -adjustments.elevation.altitudeEffect, // Negative because ball goes further
      icon: '🏔️',
      detail: `Ball carries further at elevation`,
    });
  }

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, style]}
        onPress={() => setShowBreakdown(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.effectiveDistanceCompact}>{effectiveDistance}</Text>
        {hasAdjustments && (
          <View style={styles.adjustmentBadge}>
            <Text style={styles.adjustmentBadgeText}>
              {totalAdjustment > 0 ? '+' : ''}{totalAdjustment}
            </Text>
          </View>
        )}

        {/* Breakdown Modal */}
        <BreakdownModal
          visible={showBreakdown}
          onClose={() => setShowBreakdown(false)}
          actualDistance={actualDistance}
          effectiveDistance={effectiveDistance}
          adjustmentItems={adjustmentItems}
          clubRecommendation={preCalculated.club}
          aimAdjustment={adjustments?.wind?.aimOffsetYards}
          aimDirection={adjustments?.wind?.aimDirection}
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={() => setShowBreakdown(true)}
      activeOpacity={0.7}
    >
      {/* Main actual distance (big text) */}
      <View style={styles.mainRow}>
        <Text style={styles.actualDistanceLarge}>{actualDistance}</Text>
        <Text style={styles.yardLabel}>yds</Text>
        {hasAdjustments && (
          <View style={styles.infoButton}>
            <Text style={styles.infoIcon}>ℹ️</Text>
          </View>
        )}
      </View>

      {/* "Playing X (+Y)" without repeating actual distance */}
      {hasAdjustments && (
        <View style={styles.playsLikeRow}>
          <Text style={styles.playsLikeText}>
            Playing {effectiveDistance} ({totalAdjustment > 0 ? '+' : ''}{totalAdjustment})
          </Text>
        </View>
      )}

      {/* Breakdown Modal */}
      <BreakdownModal
        visible={showBreakdown}
        onClose={() => setShowBreakdown(false)}
        actualDistance={actualDistance}
        effectiveDistance={effectiveDistance}
        adjustmentItems={adjustmentItems}
        clubRecommendation={preCalculated.club}
        aimAdjustment={adjustments?.wind?.aimOffsetYards}
        aimDirection={adjustments?.wind?.aimDirection}
      />
    </TouchableOpacity>
  );
};

/**
 * Breakdown Modal Component
 * Shows detailed calculation breakdown
 */
const BreakdownModal = ({
  visible,
  onClose,
  actualDistance,
  effectiveDistance,
  adjustmentItems,
  clubRecommendation,
  aimAdjustment,
  aimDirection,
}) => {
  const totalAdjustment = effectiveDistance - actualDistance;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Distance Breakdown</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Distance Summary */}
          <View style={styles.distanceSummary}>
            <View style={styles.distanceColumn}>
              <Text style={styles.distanceColumnLabel}>Actual</Text>
              <Text style={styles.distanceColumnValue}>{actualDistance}</Text>
              <Text style={styles.distanceColumnUnit}>yards</Text>
            </View>

            <View style={styles.arrowContainer}>
              <Text style={styles.arrow}>→</Text>
            </View>

            <View style={styles.distanceColumn}>
              <Text style={styles.distanceColumnLabel}>Plays Like</Text>
              <Text style={[styles.distanceColumnValue, styles.effectiveValue]}>
                {effectiveDistance}
              </Text>
              <Text style={styles.distanceColumnUnit}>yards</Text>
            </View>
          </View>

          {/* Adjustment Items */}
          {adjustmentItems.length > 0 ? (
            <View style={styles.adjustmentsList}>
              <Text style={styles.adjustmentsTitle}>Adjustments</Text>
              {adjustmentItems.map((item, index) => (
                <View key={index} style={styles.adjustmentItem}>
                  <View style={styles.adjustmentLeft}>
                    <Text style={styles.adjustmentIcon}>{item.icon}</Text>
                    <View style={styles.adjustmentLabelContainer}>
                      <Text style={styles.adjustmentLabel}>{item.label}</Text>
                      {item.detail && (
                        <Text style={styles.adjustmentDetail}>{item.detail}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={[
                    styles.adjustmentValue,
                    item.value > 0 ? styles.positiveValue : styles.negativeValue
                  ]}>
                    {item.value > 0 ? '+' : ''}{item.value} yds
                  </Text>
                </View>
              ))}

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Adjustment</Text>
                <Text style={[
                  styles.totalValue,
                  totalAdjustment > 0 ? styles.positiveValue : styles.negativeValue
                ]}>
                  {totalAdjustment > 0 ? '+' : ''}{totalAdjustment} yds
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.noAdjustments}>
              <Text style={styles.noAdjustmentsText}>
                No significant adjustments needed
              </Text>
            </View>
          )}

          {/* Aim Adjustment */}
          {aimAdjustment && aimAdjustment >= 3 && aimDirection && (
            <View style={styles.aimSection}>
              <Text style={styles.aimTitle}>🎯 Aim Adjustment</Text>
              <Text style={styles.aimText}>
                Aim {aimAdjustment} yards {aimDirection} to compensate for crosswind
              </Text>
            </View>
          )}

          {/* Club Recommendation */}
          {clubRecommendation?.primary && (
            <View style={styles.clubSection}>
              <Text style={styles.clubTitle}>🏌️ Club Recommendation</Text>
              <View style={styles.clubRow}>
                <Text style={styles.clubName}>
                  {formatClubName(clubRecommendation.primary.club)}
                </Text>
                <Text style={styles.clubDistance}>
                  ({clubRecommendation.primary.distance} yds)
                </Text>
                <View style={[
                  styles.confidenceBadge,
                  clubRecommendation.primary.confidence === 'high' && styles.confidenceHigh,
                  clubRecommendation.primary.confidence === 'medium' && styles.confidenceMedium,
                  clubRecommendation.primary.confidence === 'low' && styles.confidenceLow,
                ]}>
                  <Text style={styles.confidenceText}>
                    {clubRecommendation.primary.confidence}
                  </Text>
                </View>
              </View>
              {clubRecommendation.alternate && (
                <Text style={styles.alternateClub}>
                  Alt: {formatClubName(clubRecommendation.alternate.club)} ({clubRecommendation.alternate.distance} yds)
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/**
 * Format club name for display
 */
function formatClubName(clubId) {
  if (!clubId) return '';
  if (clubId.startsWith('w_')) {
    return `${clubId.slice(2)}° Wedge`;
  }
  return clubId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  // Main container styles
  container: {
    alignItems: 'center',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  actualDistanceLarge: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  effectiveDistance: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  effectiveDistanceCompact: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  yardLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginLeft: 4,
  },
  infoButton: {
    marginLeft: 6,
    opacity: 0.8,
  },
  infoIcon: {
    fontSize: 14,
  },
  playsLikeRow: {
    marginTop: 4,
  },
  playsLikeText: {
    color: theme.colors.accent.amber,
    fontSize: 12,
    fontWeight: '500',
  },
  adjustmentBadge: {
    backgroundColor: theme.colors.accent.amber,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  adjustmentBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 20,
  },

  // Distance summary
  distanceSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  distanceColumn: {
    alignItems: 'center',
    flex: 1,
  },
  distanceColumnLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginBottom: 4,
  },
  distanceColumnValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  effectiveValue: {
    color: theme.colors.accent.amber,
  },
  distanceColumnUnit: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
  arrowContainer: {
    paddingHorizontal: 12,
  },
  arrow: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 24,
  },

  // Adjustments list
  adjustmentsList: {
    marginBottom: 16,
  },
  adjustmentsTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  adjustmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  adjustmentLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  adjustmentIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  adjustmentLabelContainer: {
    flex: 1,
  },
  adjustmentLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  adjustmentDetail: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  adjustmentValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  positiveValue: {
    color: '#ef4444', // Red for "plays longer"
  },
  negativeValue: {
    color: '#22c55e', // Green for "plays shorter"
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  noAdjustments: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noAdjustmentsText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
  },

  // Aim section
  aimSection: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  aimTitle: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  aimText: {
    color: '#ffffff',
    fontSize: 13,
  },

  // Club section
  clubSection: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 8,
    padding: 12,
  },
  clubTitle: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clubName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clubDistance: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginLeft: 6,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  confidenceHigh: {
    backgroundColor: '#22c55e',
  },
  confidenceMedium: {
    backgroundColor: '#f59e0b',
  },
  confidenceLow: {
    backgroundColor: '#ef4444',
  },
  confidenceText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  alternateClub: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 6,
  },
});

export default EffectiveDistanceDisplay;
