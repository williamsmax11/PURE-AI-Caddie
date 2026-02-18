/**
 * Shot Entry Panel
 *
 * Two-mode bottom panel for the shot logging flow:
 * - preshot: Club → Lie → Feel → Felt Good → Start Tracking
 * - result: Result → Save Shot
 *
 * Design matches ShotDetailPanel dark glass style.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import theme from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PRESHOT_PANEL_HEIGHT = SCREEN_HEIGHT * 0.48;
const RESULT_PANEL_HEIGHT = SCREEN_HEIGHT * 0.28;

// Club display names (short form for chips)
const CLUB_LABELS = {
  driver: 'Driver',
  '3_wood': '3W',
  '5_wood': '5W',
  '4_hybrid': '4H',
  '5_hybrid': '5H',
  '3_iron': '3i',
  '4_iron': '4i',
  '5_iron': '5i',
  '6_iron': '6i',
  '7_iron': '7i',
  '8_iron': '8i',
  '9_iron': '9i',
  pw: 'PW',
  gw: 'GW',
  sw: 'SW',
  lw: 'LW',
  putter: 'Putter',
};

// Lie options
const LIE_OPTIONS = [
  { key: 'tee', label: 'Tee' },
  { key: 'fairway', label: 'Fairway' },
  { key: 'rough', label: 'Rough' },
  { key: 'bunker', label: 'Bunker' },
  { key: 'other', label: 'Other' },
];

// Feel options (where on the club face the ball was struck)
const FEEL_OPTIONS = [
  { key: 'solid', label: 'Solid' },
  { key: 'thin', label: 'Thin' },
  { key: 'fat', label: 'Fat' },
  { key: 'toe', label: 'Toe' },
  { key: 'heel', label: 'Heel' },
];

// Shot results with display info
const SHOT_RESULTS = [
  { key: 'fairway', label: 'Fairway', icon: 'checkmark-circle', color: '#10b981' },
  { key: 'green', label: 'Green', icon: 'flag', color: '#10b981' },
  { key: 'rough_left', label: 'Rough L', icon: 'arrow-back', color: '#f59e0b' },
  { key: 'rough_right', label: 'Rough R', icon: 'arrow-forward', color: '#f59e0b' },
  { key: 'bunker', label: 'Bunker', icon: 'remove-circle', color: '#f59e0b' },
  { key: 'fringe', label: 'Fringe', icon: 'ellipse', color: '#22d3ee' },
  { key: 'water', label: 'Water', icon: 'water', color: '#ef4444' },
  { key: 'ob', label: 'OB', icon: 'close-circle', color: '#ef4444' },
];

/**
 * @param {Object} props
 * @param {boolean} props.visible - Whether panel is shown
 * @param {'preshot'|'result'} props.mode - Panel mode
 * @param {number} props.holeNumber - Current hole number
 * @param {number} props.shotNumber - Shot number to log (1-based)
 * @param {Object} props.userClubs - User's bag { clubId: distance } or { clubId: { name, distance } }
 * @param {string} props.recommendedClub - AI-recommended club id (pre-selected)
 * @param {string} props.defaultLie - Auto-detected lie type to pre-select
 * @param {function} props.onStartTracking - Callback with pre-shot data { club, lieType, shotFeel, feltGood }
 * @param {function} props.onSaveResult - Callback with result data { result }
 * @param {function} props.onCancel - Dismiss without logging
 */
export default function ShotEntryPanel({
  visible,
  mode = 'preshot',
  holeNumber,
  shotNumber,
  userClubs,
  recommendedClub,
  defaultLie,
  onStartTracking,
  onSaveResult,
  onCancel,
}) {
  const panelHeight = mode === 'preshot' ? PRESHOT_PANEL_HEIGHT : RESULT_PANEL_HEIGHT;

  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedLie, setSelectedLie] = useState(null);
  const [selectedFeel, setSelectedFeel] = useState('solid');
  const [feltGood, setFeltGood] = useState(true);
  const [selectedResult, setSelectedResult] = useState(null);
  const [rendered, setRendered] = useState(false);
  const slideAnim = useRef(new Animated.Value(PRESHOT_PANEL_HEIGHT)).current;

  // Get sorted club list from user's bag
  const clubList = getClubList(userClubs, defaultLie);

  // Set default selections when panel opens
  useEffect(() => {
    if (visible) {
      if (mode === 'preshot') {
        setSelectedClub(recommendedClub || clubList[0]?.id || null);
        setSelectedLie(defaultLie || 'tee');
        setSelectedFeel('solid');
        setFeltGood(true);
      } else {
        setSelectedResult(getDefaultResult(defaultLie, shotNumber));
      }
      setRendered(true);
      slideAnim.setValue(panelHeight);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(slideAnim, {
        toValue: panelHeight,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setRendered(false);
      });
    }
  }, [visible, mode]);

  const handleStartTracking = useCallback(() => {
    if (!selectedClub) return;
    onStartTracking({
      club: selectedClub,
      lieType: selectedLie || 'fairway',
      shotFeel: selectedFeel,
      feltGood,
    });
  }, [selectedClub, selectedLie, selectedFeel, feltGood, onStartTracking]);

  const handleSaveResult = useCallback(() => {
    if (!selectedResult) return;
    onSaveResult({ result: selectedResult });
  }, [selectedResult, onSaveResult]);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { height: panelHeight, transform: [{ translateY: slideAnim }] },
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
            <Text style={styles.shotBadgeText}>{shotNumber}</Text>
          </View>
          <Text style={styles.headerTitle}>
            {mode === 'preshot' ? 'Shot' : 'Shot Result'}
          </Text>
          <Text style={styles.headerSubtitle}>Hole {holeNumber}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel} activeOpacity={0.6}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {mode === 'preshot' ? (
        <>
          {/* Club Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CLUB</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {clubList.map(club => (
                <TouchableOpacity
                  key={club.id}
                  style={[
                    styles.chip,
                    selectedClub === club.id && styles.chipSelected,
                    recommendedClub === club.id && selectedClub !== club.id && styles.chipRecommended,
                  ]}
                  onPress={() => setSelectedClub(club.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.chipText,
                    selectedClub === club.id && styles.chipTextSelected,
                  ]}>
                    {club.label}
                  </Text>
                  {recommendedClub === club.id && selectedClub !== club.id && (
                    <View style={styles.recommendedDot} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Lie Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LIE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {LIE_OPTIONS.map(lie => (
                <TouchableOpacity
                  key={lie.key}
                  style={[
                    styles.chip,
                    selectedLie === lie.key && styles.chipSelected,
                  ]}
                  onPress={() => setSelectedLie(lie.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.chipText,
                    selectedLie === lie.key && styles.chipTextSelected,
                  ]}>
                    {lie.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Feel Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FEEL</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {FEEL_OPTIONS.map(feel => (
                <TouchableOpacity
                  key={feel.key}
                  style={[
                    styles.chip,
                    selectedFeel === feel.key && styles.chipSelected,
                  ]}
                  onPress={() => setSelectedFeel(feel.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.chipText,
                    selectedFeel === feel.key && styles.chipTextSelected,
                  ]}>
                    {feel.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Felt Good Toggle */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CONFIDENCE</Text>
            <TouchableOpacity
              style={[styles.togglePill, feltGood && styles.togglePillActive]}
              onPress={() => setFeltGood(prev => !prev)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={feltGood ? 'thumbs-up' : 'thumbs-down'}
                size={16}
                color={feltGood ? '#10b981' : 'rgba(255,255,255,0.4)'}
              />
              <Text style={[styles.togglePillText, feltGood && styles.togglePillTextActive]}>
                {feltGood ? 'Felt Good' : 'Didn\'t Feel Good'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Start Tracking Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, !selectedClub && styles.confirmBtnDisabled]}
              onPress={handleStartTracking}
              activeOpacity={0.8}
              disabled={!selectedClub}
            >
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>Start Tracking</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          {/* Result Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RESULT</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {SHOT_RESULTS.map(result => (
                <TouchableOpacity
                  key={result.key}
                  style={[
                    styles.resultChip,
                    selectedResult === result.key && {
                      backgroundColor: result.color + '25',
                      borderColor: result.color,
                    },
                  ]}
                  onPress={() => setSelectedResult(result.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={result.icon}
                    size={14}
                    color={selectedResult === result.key ? result.color : 'rgba(255,255,255,0.35)'}
                  />
                  <Text style={[
                    styles.resultChipText,
                    selectedResult === result.key && { color: result.color },
                  ]}>
                    {result.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Save Shot Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, !selectedResult && styles.confirmBtnDisabled]}
              onPress={handleSaveResult}
              activeOpacity={0.8}
              disabled={!selectedResult}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>Save Shot</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Animated.View>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build sorted club list from user's bag data.
 */
function getClubList(userClubs, lieType) {
  if (!userClubs) return [];

  const clubOrder = [
    'driver', '3_wood', '5_wood',
    '4_hybrid', '5_hybrid',
    '3_iron', '4_iron', '5_iron', '6_iron', '7_iron', '8_iron', '9_iron',
    'pw', 'gw', 'sw', 'lw',
    'putter',
  ];

  const clubs = [];
  for (const clubId of clubOrder) {
    if (userClubs[clubId] != null) {
      if (lieType === 'green' && clubId !== 'putter') continue;
      if (lieType !== 'green' && clubId === 'putter') continue;

      clubs.push({
        id: clubId,
        label: CLUB_LABELS[clubId] || clubId,
        distance: typeof userClubs[clubId] === 'number'
          ? userClubs[clubId]
          : userClubs[clubId]?.distance || 0,
      });
    }
  }

  return clubs;
}

/**
 * Get default result based on context.
 */
function getDefaultResult(lieType, shotNumber) {
  if (lieType === 'tee' || shotNumber === 1) return 'fairway';
  return 'green';
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
    backgroundColor: 'rgba(8, 10, 16, 0.96)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    zIndex: 2100,
    elevation: 25,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
    }),
  },

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
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotBadgeText: {
    fontFamily: theme.fonts.bold,
    color: '#fff',
    fontSize: 12,
  },
  headerTitle: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
  },
  headerSubtitle: {
    fontFamily: theme.fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionLabel: {
    fontFamily: theme.fonts.semibold,
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
  },

  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
  },
  chipRecommended: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  chipText: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  chipTextSelected: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.accent.emerald,
  },
  recommendedDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10b981',
  },

  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  togglePillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  togglePillText: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
  },
  togglePillTextActive: {
    color: theme.colors.accent.emerald,
  },

  resultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  resultChipText: {
    fontFamily: theme.fonts.medium,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.accent.emerald,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.lg,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    fontSize: 15,
  },
});
