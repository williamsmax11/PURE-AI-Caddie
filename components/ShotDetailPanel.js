import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.5;

const BASE_TABS = [
  { key: 'caddie', label: 'Caddie', icon: 'golf-outline' },
  { key: 'playsLike', label: 'Plays Like', icon: 'analytics-outline' },
  { key: 'hazards', label: 'Hazards', icon: 'warning-outline' },
  { key: 'analytics', label: 'Analytics', icon: 'lock-closed-outline' },
];

// Hazard type to color mapping
const HAZARD_COLORS = {
  water: '#ef4444',
  ob: '#ef4444',
  penalty: '#ef4444',
  bunker: '#f59e0b',
  waste_area: '#f59e0b',
};

export default function ShotDetailPanel({ shot, visible, onClose, playerInsights = null }) {
  // Determine if analytics are unlocked for the current club
  const clubId = shot ? normalizeClubIdForLookup(shot.club) : null;
  const clubAnalytics = clubId && playerInsights?.clubStats?.[clubId];
  const analyticsUnlocked = clubAnalytics && clubAnalytics.totalShots >= 5;

  // Dynamic tabs - swap lock icon when analytics are available
  const TABS = BASE_TABS.map(tab =>
    tab.key === 'analytics' && analyticsUnlocked
      ? { ...tab, icon: 'bar-chart-outline' }
      : tab
  );

  const [activeTab, setActiveTab] = useState('caddie');
  const [rendered, setRendered] = useState(false);
  const slideAnim = useRef(new Animated.Value(PANEL_HEIGHT)).current;
  const lastShotRef = useRef(null);

  // Keep a reference to the last valid shot so we can show it during close animation
  if (shot) {
    lastShotRef.current = shot;
  }

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(slideAnim, {
        toValue: PANEL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setRendered(false);
        lastShotRef.current = null;
      });
    }
  }, [visible]);

  // Reset to caddie tab when shot changes
  useEffect(() => {
    setActiveTab('caddie');
  }, [shot?.shotNumber]);

  // Use current shot or last valid shot (for close animation)
  const displayShot = shot || lastShotRef.current;
  if (!rendered || !displayShot) return null;

  const delta = (displayShot.effectiveDistance || displayShot.distance) - displayShot.distance;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Drag handle */}
      <View style={styles.handleRow}>
        <View style={styles.handle} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.shotBadge}>
            <Text style={styles.shotBadgeText}>{displayShot.shotNumber}</Text>
          </View>
          <Text style={styles.headerClub}>{displayShot.club}</Text>
          <Text style={styles.headerDivider}>·</Text>
          <Text style={styles.headerDistance}>{displayShot.distance} yds</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.6}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabLabel,
              activeTab === tab.key && styles.tabLabelActive,
            ]}>
              {tab.label}
            </Text>
            {activeTab === tab.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'caddie' && <CaddieTab shot={displayShot} />}
        {activeTab === 'playsLike' && <PlaysLikeTab shot={displayShot} delta={delta} />}
        {activeTab === 'hazards' && <HazardsTab shot={displayShot} />}
        {activeTab === 'analytics' && <AnalyticsTab clubStats={clubAnalytics} clubName={displayShot?.club} tendencies={playerInsights?.tendencies} />}
      </ScrollView>
    </Animated.View>
  );
}

// ============================================================================
// TAB: CADDIE
// ============================================================================

function CaddieTab({ shot }) {
  const windDetail = shot.adjustments?.windDetail;
  const hasAimGuidance = windDetail?.aimOffsetYards >= 3 && windDetail?.aimDirection;

  return (
    <View style={styles.tabContent}>
      {/* Pure AI Badge */}
      <View style={styles.aiBadgeRow}>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={10} color={theme.colors.primary[400]} />
          <Text style={styles.aiBadgeText}>Pure AI</Text>
        </View>
      </View>

      {/* Strategy advice */}
      <View style={styles.caddieAdviceBlock}>
        <LinearGradient
          colors={[theme.colors.primary[400], theme.colors.primary[600]]}
          style={styles.caddieAccentBar}
        />
        <View style={styles.caddieAdviceContent}>
          {shot.target ? (
            <Text style={styles.caddieHeadline}>{shot.target}</Text>
          ) : null}
          {shot.reasoning ? (
            <Text style={styles.caddieReasoning}>{shot.reasoning}</Text>
          ) : null}
        </View>
      </View>

      {/* Wind aim guidance */}
      {hasAimGuidance && (
        <View style={styles.caddieRow}>
          <Ionicons name="navigate-outline" size={16} color="#3b82f6" />
          <Text style={styles.caddieRowText}>
            Aim {windDetail.aimOffsetYards} yards {windDetail.aimDirection} for wind
          </Text>
        </View>
      )}

      {/* Next shot preview */}
      {shot.nextShotDistance > 0 && (
        <View style={styles.caddieRow}>
          <Ionicons name="flag-outline" size={16} color="rgba(255,255,255,0.4)" />
          <Text style={styles.caddieRowText}>
            Leaves {Math.round(shot.nextShotDistance)} yards to the green
          </Text>
        </View>
      )}

      {/* Confidence */}
      {shot.confidence && (
        <View style={styles.confidenceRow}>
          <Text style={styles.sectionLabel}>CONFIDENCE</Text>
          <View style={[
            styles.confidenceBadge,
            shot.confidence === 'high' && styles.confidenceHigh,
            shot.confidence === 'medium' && styles.confidenceMedium,
            shot.confidence === 'low' && styles.confidenceLow,
          ]}>
            <Text style={[
              styles.confidenceText,
              shot.confidence === 'high' && styles.confidenceTextHigh,
              shot.confidence === 'medium' && styles.confidenceTextMedium,
              shot.confidence === 'low' && styles.confidenceTextLow,
            ]}>
              {shot.confidence.toUpperCase()}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// TAB: PLAYS LIKE
// ============================================================================

function PlaysLikeTab({ shot, delta }) {
  const effectiveDist = shot.effectiveDistance || shot.distance;
  const windDetail = shot.adjustments?.windDetail;
  const tempDetail = shot.adjustments?.temperatureDetail;
  const elevDetail = shot.adjustments?.elevationDetail;

  const adjustmentRows = [];

  // Wind
  if (windDetail && Math.abs(windDetail.distanceEffect) >= 1) {
    adjustmentRows.push({
      key: 'wind',
      icon: 'cloudy-outline',
      label: 'Wind',
      detail: windDetail.windEffect || '',
      value: windDetail.distanceEffect,
    });
  }

  // Temperature
  if (tempDetail && Math.abs(tempDetail.distanceEffect) >= 1) {
    adjustmentRows.push({
      key: 'temp',
      icon: 'thermometer-outline',
      label: 'Temperature',
      detail: tempDetail.description || '',
      value: tempDetail.distanceEffect,
    });
  }

  // Elevation (slope)
  if (elevDetail && Math.abs(elevDetail.slopeEffect) >= 1) {
    adjustmentRows.push({
      key: 'elev',
      icon: elevDetail.elevationDelta > 0 ? 'trending-up' : 'trending-down',
      label: 'Elevation',
      detail: `${Math.abs(elevDetail.elevationDelta)}ft ${elevDetail.elevationDelta > 0 ? 'uphill' : 'downhill'}`,
      value: elevDetail.slopeEffect,
    });
  }

  // Altitude
  if (elevDetail && Math.abs(elevDetail.altitudeEffect) >= 1) {
    adjustmentRows.push({
      key: 'alt',
      icon: 'earth-outline',
      label: 'Altitude',
      detail: 'Thinner air at elevation',
      value: -elevDetail.altitudeEffect,
    });
  }

  return (
    <View style={styles.tabContent}>
      {/* Header: Actual -> Effective */}
      <View style={styles.plDistanceHeader}>
        <Text style={styles.plActualDist}>{shot.distance}</Text>
        <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" style={{ marginHorizontal: 8 }} />
        <Text style={styles.plEffectiveDist}>{effectiveDist}</Text>
        <Text style={styles.plYdsLabel}> yds</Text>
        {Math.abs(delta) >= 1 && (
          <View style={[styles.plDeltaBadge, delta > 0 ? styles.plDeltaPlus : styles.plDeltaMinus]}>
            <Text style={[styles.plDeltaText, delta > 0 ? styles.plDeltaTextPlus : styles.plDeltaTextMinus]}>
              {delta > 0 ? '+' : ''}{delta}
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Adjustment rows */}
      {adjustmentRows.length > 0 ? (
        <>
          {adjustmentRows.map((row) => (
            <View key={row.key} style={styles.plRow}>
              <View style={styles.plRowLeft}>
                <Ionicons name={row.icon} size={16} color="rgba(255,255,255,0.4)" />
                <View style={styles.plRowLabels}>
                  <Text style={styles.plRowLabel}>{row.label}</Text>
                  <Text style={styles.plRowDetail}>{row.detail}</Text>
                </View>
              </View>
              <Text style={[
                styles.plRowValue,
                row.value > 0 ? styles.plValuePlus : styles.plValueMinus,
              ]}>
                {row.value > 0 ? '+' : ''}{Math.round(row.value)} yds
              </Text>
            </View>
          ))}

          {/* Total */}
          <View style={styles.plTotalRow}>
            <Text style={styles.plTotalLabel}>TOTAL ADJUSTMENT</Text>
            <Text style={[
              styles.plTotalValue,
              delta > 0 ? styles.plValuePlus : delta < 0 ? styles.plValueMinus : null,
            ]}>
              {delta > 0 ? '+' : ''}{delta} yds
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={24} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyText}>No significant adjustments</Text>
          <Text style={styles.emptySubtext}>Conditions are neutral for this shot</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// TAB: HAZARDS
// ============================================================================

function HazardsTab({ shot }) {
  const avoidZones = shot.avoidZones || [];
  const safeZone = shot.safeZone;
  const warnings = shot.warnings || [];

  if (avoidZones.length === 0 && warnings.length === 0) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.emptyState}>
          <Ionicons name="shield-checkmark-outline" size={28} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyText}>No hazards in play</Text>
          <Text style={styles.emptySubtext}>Clear path to target</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      {/* Hazard list */}
      {avoidZones.map((zone, i) => {
        const dotColor = HAZARD_COLORS[zone.type] || '#f59e0b';
        return (
          <View key={i} style={styles.hazardRow}>
            <View style={[styles.hazardDot, { backgroundColor: dotColor }]} />
            <View style={styles.hazardInfo}>
              <Text style={styles.hazardName}>
                {zone.name}
                <Text style={styles.hazardType}> · {formatHazardType(zone.type)}</Text>
              </Text>
              <Text style={styles.hazardDistance}>{zone.distanceToEdge} yds to edge</Text>
            </View>
            <View style={[styles.directionBadge, { borderColor: dotColor + '40' }]}>
              <Text style={[styles.directionText, { color: dotColor }]}>
                {zone.direction.toUpperCase()}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Warnings */}
      {warnings.map((w, i) => (
        <View key={`w-${i}`} style={styles.warningRow}>
          <Ionicons name="alert-circle" size={14} color="#f59e0b" />
          <Text style={styles.warningText}>{w}</Text>
        </View>
      ))}

      {/* Safe zone recommendation */}
      {safeZone && safeZone.direction && (
        <>
          <View style={styles.divider} />
          <View style={styles.safeZoneBlock}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#10b981" />
            <View style={styles.safeZoneContent}>
              <Text style={styles.safeZoneHeadline}>
                Favor {safeZone.direction} side
              </Text>
              {safeZone.description && (
                <Text style={styles.safeZoneDetail}>{safeZone.description}</Text>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ============================================================================
// TAB: ANALYTICS (DYNAMIC - locked or data)
// ============================================================================

function AnalyticsTab({ clubStats, clubName, tendencies }) {
  // If no data, show locked state
  if (!clubStats || clubStats.totalShots < 5) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.lockedState}>
          <Ionicons name="lock-closed-outline" size={36} color="rgba(255,255,255,0.15)" />
          <Text style={styles.lockedTitle}>Shot Analytics</Text>
          <Text style={styles.lockedMessage}>
            Log at least 5 shots with this club to unlock analytics
          </Text>
          <View style={styles.lockedFeatures}>
            <LockedFeatureRow icon="analytics-outline" label="Dispersion patterns" />
            <LockedFeatureRow icon="trending-up" label="Miss tendencies" />
            <LockedFeatureRow icon="bar-chart-outline" label="Club performance" />
            <LockedFeatureRow icon="golf-outline" label="Scoring averages by distance" />
          </View>
        </View>
      </View>
    );
  }

  // Unlocked: show real data
  const missDirection = clubStats.avgOffline != null
    ? (clubStats.avgOffline > 2 ? 'Right' : clubStats.avgOffline < -2 ? 'Left' : 'Center')
    : 'N/A';
  const missColor = missDirection === 'Center' ? '#10b981' : '#f59e0b';

  // Find relevant club tendencies
  const clubId = normalizeClubIdForLookup(clubName);
  const clubTendency = (tendencies || []).find(
    t => t.type === 'club_bias' && t.key === `${clubId}_miss` && t.confidence >= 0.3
  );

  return (
    <View style={styles.tabContent}>
      {/* Club Performance Header */}
      <View style={styles.analyticsHeader}>
        <Text style={styles.analyticsClubName}>{clubName || 'Club'}</Text>
        <Text style={styles.analyticsShotCount}>{clubStats.totalShots} shots tracked</Text>
      </View>

      {/* Distance Stats */}
      <View style={styles.analyticsSection}>
        <Text style={styles.analyticsSectionTitle}>DISTANCE</Text>
        <View style={styles.analyticsGrid}>
          <AnalyticsStat label="Average" value={`${Math.round(clubStats.avgDistance)}y`} />
          <AnalyticsStat label="Median" value={`${Math.round(clubStats.medianDistance)}y`} />
          <AnalyticsStat label="Last 10" value={clubStats.last10Avg ? `${Math.round(clubStats.last10Avg)}y` : '--'} />
          <AnalyticsStat label="Range" value={`${Math.round(clubStats.minDistance)}-${Math.round(clubStats.maxDistance)}`} />
        </View>
      </View>

      {/* Miss Tendencies */}
      <View style={styles.analyticsSection}>
        <Text style={styles.analyticsSectionTitle}>MISS PATTERN</Text>
        <View style={styles.missPatternRow}>
          <View style={styles.missBarContainer}>
            <View style={styles.missBarLabel}>
              <Text style={styles.missBarText}>Left</Text>
              <Text style={styles.missBarPct}>{clubStats.missLeftPct || 0}%</Text>
            </View>
            <View style={styles.missBarTrack}>
              <View style={[styles.missBarFill, { width: `${clubStats.missLeftPct || 0}%`, backgroundColor: '#f59e0b' }]} />
            </View>
          </View>
          <View style={styles.missBarContainer}>
            <View style={styles.missBarLabel}>
              <Text style={styles.missBarText}>Right</Text>
              <Text style={styles.missBarPct}>{clubStats.missRightPct || 0}%</Text>
            </View>
            <View style={styles.missBarTrack}>
              <View style={[styles.missBarFill, { width: `${clubStats.missRightPct || 0}%`, backgroundColor: '#f59e0b' }]} />
            </View>
          </View>
          <View style={styles.missBarContainer}>
            <View style={styles.missBarLabel}>
              <Text style={styles.missBarText}>Short</Text>
              <Text style={styles.missBarPct}>{clubStats.missShortPct || 0}%</Text>
            </View>
            <View style={styles.missBarTrack}>
              <View style={[styles.missBarFill, { width: `${clubStats.missShortPct || 0}%`, backgroundColor: '#3b82f6' }]} />
            </View>
          </View>
          <View style={styles.missBarContainer}>
            <View style={styles.missBarLabel}>
              <Text style={styles.missBarText}>Long</Text>
              <Text style={styles.missBarPct}>{clubStats.missLongPct || 0}%</Text>
            </View>
            <View style={styles.missBarTrack}>
              <View style={[styles.missBarFill, { width: `${clubStats.missLongPct || 0}%`, backgroundColor: '#3b82f6' }]} />
            </View>
          </View>
        </View>
        {clubStats.avgOffline != null && (
          <View style={styles.missBiasRow}>
            <Text style={styles.missBiasLabel}>Avg. Lateral Miss</Text>
            <Text style={[styles.missBiasValue, { color: missColor }]}>
              {Math.abs(clubStats.avgOffline).toFixed(1)}y {missDirection}
            </Text>
          </View>
        )}
        {clubTendency && (
          <Text style={styles.tendencyNote}>{clubTendency.data?.description}</Text>
        )}
      </View>

      {/* Dispersion */}
      <View style={styles.analyticsSection}>
        <Text style={styles.analyticsSectionTitle}>DISPERSION</Text>
        <View style={styles.analyticsGrid}>
          <AnalyticsStat label="Radius" value={clubStats.dispersionRadius ? `${clubStats.dispersionRadius}y` : '--'} />
          <AnalyticsStat label="Lateral" value={clubStats.lateralDispersion ? `${clubStats.lateralDispersion.toFixed(1)}y` : '--'} />
          <AnalyticsStat label="Distance" value={clubStats.distanceDispersion ? `${clubStats.distanceDispersion.toFixed(1)}y` : '--'} />
          <AnalyticsStat label="To Target" value={clubStats.avgDistanceToTarget ? `${clubStats.avgDistanceToTarget.toFixed(1)}y` : '--'} />
        </View>
      </View>
    </View>
  );
}

function AnalyticsStat({ label, value }) {
  return (
    <View style={styles.analyticsStatBox}>
      <Text style={styles.analyticsStatValue}>{value}</Text>
      <Text style={styles.analyticsStatLabel}>{label}</Text>
    </View>
  );
}

function LockedFeatureRow({ icon, label }) {
  return (
    <View style={styles.lockedFeatureRow}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.15)" />
      <Text style={styles.lockedFeatureText}>{label}</Text>
    </View>
  );
}

/**
 * Normalize display club name to club_id for stats lookup.
 */
function normalizeClubIdForLookup(clubName) {
  if (!clubName) return null;
  const mapping = {
    'driver': 'driver',
    '3 wood': '3_wood',
    '5 wood': '5_wood',
    '4 hybrid': '4_hybrid',
    '5 hybrid': '5_hybrid',
    '3 iron': '3_iron',
    '4 iron': '4_iron',
    '5 iron': '5_iron',
    '6 iron': '6_iron',
    '7 iron': '7_iron',
    '8 iron': '8_iron',
    '9 iron': '9_iron',
    'pitching wedge': 'pw',
    'gap wedge': 'gw',
    'sand wedge': 'sw',
    'lob wedge': 'lw',
  };
  return mapping[clubName.toLowerCase()] || clubName.toLowerCase().replace(/\s+/g, '_');
}

// ============================================================================
// HELPERS
// ============================================================================

function formatHazardType(type) {
  const labels = {
    water: 'Water',
    ob: 'Out of Bounds',
    penalty: 'Penalty Area',
    bunker: 'Bunker',
    waste_area: 'Waste Area',
  };
  return labels[type] || type;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    backgroundColor: 'rgba(8, 10, 16, 0.96)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    zIndex: 2000,
    elevation: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
    }),
  },

  // Handle
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shotBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accent.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotBadgeText: {
    fontFamily: theme.fonts.bold,
    color: '#fff',
    fontSize: 12,
  },
  headerClub: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
  },
  headerDivider: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 15,
  },
  headerDistance: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
    position: 'relative',
  },
  tabLabel: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: '#fff',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: theme.colors.primary[400],
    borderRadius: 1,
  },

  // Content area
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 20,
  },
  tabContent: {
    padding: 16,
  },

  // Shared
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  sectionLabel: {
    fontFamily: theme.fonts.semibold,
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    letterSpacing: 1,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
  },
  emptySubtext: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 12,
  },

  // ── AI Badge ──
  aiBadgeRow: {
    marginBottom: 12,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  aiBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 10,
    color: theme.colors.primary[400],
    letterSpacing: 0.5,
  },

  // ── Caddie tab ──
  caddieAdviceBlock: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  caddieAccentBar: {
    width: 3,
    borderRadius: 1.5,
    marginRight: 12,
  },
  caddieAdviceContent: {
    flex: 1,
    gap: 4,
  },
  caddieHeadline: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },
  caddieReasoning: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    lineHeight: 18,
  },
  caddieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  caddieRowText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    flex: 1,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  confidenceHigh: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  confidenceMedium: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  confidenceLow: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  confidenceTextHigh: { color: '#10b981' },
  confidenceTextMedium: { color: '#f59e0b' },
  confidenceTextLow: { color: '#ef4444' },

  // ── Plays Like tab ──
  plDistanceHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  plActualDist: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 22,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  plEffectiveDist: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  plYdsLabel: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 13,
    fontWeight: '400',
  },
  plDeltaBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  plDeltaPlus: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  plDeltaMinus: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  plDeltaText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  plDeltaTextPlus: { color: '#ef4444' },
  plDeltaTextMinus: { color: '#10b981' },
  plRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  plRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  plRowLabels: {
    flex: 1,
  },
  plRowLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  plRowDetail: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    marginTop: 1,
  },
  plRowValue: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  plValuePlus: { color: '#ef4444' },
  plValueMinus: { color: '#10b981' },
  plTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  plTotalLabel: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  plTotalValue: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ── Hazards tab ──
  hazardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  hazardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hazardInfo: {
    flex: 1,
  },
  hazardName: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  hazardType: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontWeight: '400',
  },
  hazardDistance: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    marginTop: 1,
  },
  directionBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  directionText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 12,
    flex: 1,
  },
  safeZoneBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  safeZoneContent: {
    flex: 1,
  },
  safeZoneHeadline: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  safeZoneDetail: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    marginTop: 2,
  },

  // ── Analytics tab (locked) ──
  lockedState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  lockedTitle: {
    fontFamily: theme.fonts.semibold,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    marginTop: 4,
  },
  lockedMessage: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  lockedFeatures: {
    marginTop: 16,
    gap: 8,
  },
  lockedFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockedFeatureText: {
    color: 'rgba(255, 255, 255, 0.2)',
    fontSize: 12,
  },

  // Analytics tab (unlocked) styles
  analyticsHeader: {
    marginBottom: 16,
  },
  analyticsClubName: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 16,
  },
  analyticsShotCount: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  analyticsSection: {
    marginBottom: 16,
  },
  analyticsSectionTitle: {
    fontFamily: theme.fonts.semibold,
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 8,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  analyticsStatBox: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  analyticsStatValue: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
  },
  analyticsStatLabel: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    marginTop: 2,
  },
  missPatternRow: {
    gap: 6,
  },
  missBarContainer: {
    gap: 2,
  },
  missBarLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missBarText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
  },
  missBarPct: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
  },
  missBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  missBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  missBiasRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  missBiasLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
  missBiasValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  tendencyNote: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },
});
