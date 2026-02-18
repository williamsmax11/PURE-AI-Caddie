import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import {
  CLUB_DATA,
  ALL_CLUBS_FLAT,
  ALL_CLUBS_MAP,
  MAX_CLUBS,
  STORAGE_KEY,
} from '../data/clubData';
import theme from '../theme';
import { useTraining } from '../components/TrainingProvider';
import TrainingOverlay from '../components/TrainingOverlay';

// Club category colors from theme
const CLUB_COLORS = {
  woods: theme.golfTheme.clubs.woods,
  hybrids: theme.golfTheme.clubs.woods,
  irons: theme.golfTheme.clubs.irons,
  wedges: theme.golfTheme.clubs.wedges,
  putter: theme.golfTheme.clubs.putter,
};

const CATEGORY_KEYS = Object.keys(CLUB_DATA);
const TABS = ['My Bag', 'All', ...CATEGORY_KEYS];

export default function MyBagScreen({ onBack, userId }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('My Bag');
  const [clubs, setClubs] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { trainingOverlayProps, triggerTraining } = useTraining('myBag');

  const clubCount = Object.values(clubs).filter(c => c.inBag).length;

  useEffect(() => {
    loadBag();
  }, []);

  // Trigger training overlay on first visit (after clubs load)
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => triggerTraining(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (hasChanges) {
      persistBag(clubs);
    }
  }, [clubs, hasChanges]);

  const loadBag = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const bagObj = saved ? JSON.parse(saved) : {};

      const state = {};
      for (const club of ALL_CLUBS_FLAT) {
        const savedClub = bagObj[club.id];
        state[club.id] = {
          inBag: !!savedClub,
          yards: savedClub?.distance
            ? parseInt(savedClub.distance, 10) || club.defaultDistance || 0
            : club.defaultDistance || 0,
        };
      }
      setClubs(state);
    } catch (error) {
      console.error('Error loading bag:', error);
      const state = {};
      for (const club of ALL_CLUBS_FLAT) {
        state[club.id] = { inBag: false, yards: club.defaultDistance || 0 };
      }
      setClubs(state);
    } finally {
      setIsLoading(false);
    }
  };

  const persistBag = async (clubState) => {
    try {
      const bagObj = {};
      for (const [clubId, state] of Object.entries(clubState)) {
        if (state.inBag) {
          const clubDef = ALL_CLUBS_MAP[clubId];
          if (clubDef) {
            bagObj[clubId] = {
              id: clubId,
              name: clubDef.name,
              category: clubDef.category,
              distance: state.yards > 0 ? String(state.yards) : '',
              defaultDistance: clubDef.defaultDistance,
            };
          }
        }
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bagObj));
    } catch (error) {
      console.error('Error saving bag:', error);
    }
  };

  const addClub = (clubId) => {
    const current = clubs[clubId];
    if (!current || current.inBag || clubCount >= MAX_CLUBS) return;

    setClubs(prev => ({
      ...prev,
      [clubId]: { ...prev[clubId], inBag: true },
    }));
    setHasChanges(true);
  };

  const removeClub = (clubId) => {
    const clubDef = ALL_CLUBS_MAP[clubId];
    const clubName = clubDef?.name || clubId;

    Alert.alert(
      'Remove Club',
      `Are you sure you want to remove ${clubName} from your bag?\n\nThis will permanently delete all saved data for this club, including distance settings and performance statistics. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setClubs(prev => ({
              ...prev,
              [clubId]: { ...prev[clubId], inBag: false },
            }));
            setHasChanges(true);

            // Delete club data from Supabase
            if (userId) {
              try {
                await Promise.all([
                  supabase
                    .from('user_clubs')
                    .delete()
                    .eq('user_id', userId)
                    .eq('club_id', clubId),
                  supabase
                    .from('user_club_stats')
                    .delete()
                    .eq('user_id', userId)
                    .eq('club', clubId),
                ]);
              } catch (error) {
                console.error('Error deleting club data:', error);
              }
            }
          },
        },
      ]
    );
  };

  const handleToggle = (clubId) => {
    const current = clubs[clubId];
    if (!current) return;

    if (current.inBag) {
      removeClub(clubId);
    } else {
      addClub(clubId);
    }
  };

  const updateYards = (clubId, yards) => {
    const clamped = Math.max(0, Math.min(400, yards));
    setClubs(prev => ({
      ...prev,
      [clubId]: { ...prev[clubId], yards: clamped },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await persistBag(clubs);

    // Sync to Supabase
    if (userId) {
      try {
        const dbRows = [];
        for (const [clubId, state] of Object.entries(clubs)) {
          if (state.inBag) {
            const clubDef = ALL_CLUBS_MAP[clubId];
            if (clubDef) {
              dbRows.push({
                user_id: userId,
                club_id: clubId,
                name: clubDef.name,
                category: clubDef.category,
                distance: state.yards > 0 ? state.yards : null,
              });
            }
          }
        }
        await supabase.from('user_clubs').delete().eq('user_id', userId);
        if (dbRows.length > 0) {
          await supabase.from('user_clubs').insert(dbRows);
        }
      } catch (error) {
        console.error('Error syncing bag to database:', error);
      }
    }

    setHasChanges(false);
    onBack();
  };

  // Build the list of clubs for the current tab
  const getVisibleClubs = () => {
    if (activeTab === 'My Bag') {
      return ALL_CLUBS_FLAT.filter(c => clubs[c.id]?.inBag);
    }
    if (activeTab === 'All') {
      if (!searchQuery.trim()) return ALL_CLUBS_FLAT;
      const q = searchQuery.toLowerCase().trim();
      return ALL_CLUBS_FLAT.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.shortName.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    }
    return CLUB_DATA[activeTab] || [];
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const visibleClubs = getVisibleClubs();

  const renderClubCard = (club) => {
    const state = clubs[club.id];
    const isInBag = state?.inBag ?? false;
    const yards = state?.yards ?? club.defaultDistance ?? 0;
    const isPutter = club.id === 'putter';

    return (
      <View key={club.id} style={[styles.clubCard, isInBag && styles.clubCardActive]}>
        {/* Main Row */}
        <View
          style={[
            styles.clubRow,
            !isInBag && clubCount >= MAX_CLUBS && styles.clubRowDisabled,
          ]}
        >
          {/* Club Badge — color per category */}
          {isInBag ? (
            <LinearGradient
              colors={[
                CLUB_COLORS[club.category] || theme.colors.primary[500],
                (CLUB_COLORS[club.category] || theme.colors.primary[600]) + 'CC',
              ]}
              style={styles.clubBadge}
            >
              <Text style={styles.badgeTextActive}>{club.shortName}</Text>
            </LinearGradient>
          ) : (
            <View style={styles.clubBadgeInactive}>
              <Text style={styles.badgeTextInactive}>{club.shortName}</Text>
            </View>
          )}

          {/* Club Info */}
          <View style={styles.clubInfo}>
            <Text style={[styles.clubName, !isInBag && styles.clubNameDim]}>
              {club.name}
            </Text>
            {isInBag && !isPutter && (
              <Text style={styles.yardsPreview}>{yards} yards</Text>
            )}
            {isInBag && isPutter && (
              <Text style={styles.putterLabel}>On the green</Text>
            )}
          </View>

          {/* Toggle Button — only way to add/remove */}
          <TouchableOpacity
            style={[styles.toggleBtn, isInBag && styles.toggleBtnActive]}
            onPress={() => handleToggle(club.id)}
            disabled={!isInBag && clubCount >= MAX_CLUBS}
            activeOpacity={0.6}
          >
            <Text style={[styles.toggleIcon, isInBag && styles.toggleIconActive]}>
              {isInBag ? '\u2713' : '+'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Yardage Editor */}
        {isInBag && !isPutter && (
          <View style={styles.yardageSection}>
            <View style={styles.yardageCard}>
              <View style={styles.yardageRow}>
                <Text style={styles.yardageLabel}>DISTANCE</Text>
                <View style={styles.yardageControls}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateYards(club.id, yards - 5)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.stepBtnText}>{'\u2212'}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.yardageInput}
                    value={String(yards)}
                    onChangeText={text => {
                      const val = parseInt(text, 10);
                      if (!isNaN(val)) updateYards(club.id, val);
                      else if (text === '') updateYards(club.id, 0);
                    }}
                    keyboardType="numeric"
                    maxLength={3}
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateYards(club.id, yards + 5)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.ydsUnit}>yds</Text>
                </View>
              </View>

              {/* Distance Bar */}
              <View style={styles.barTrack}>
                <LinearGradient
                  colors={[theme.colors.primary[400], theme.colors.primary[600]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.barFill,
                    { width: `${Math.min((yards / 300) * 100, 100)}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header with gradient */}
      <LinearGradient
        colors={[theme.colors.primary[700], theme.colors.primary[600]]}
        style={[styles.headerGradient, { paddingTop: insets.top + theme.spacing.sm }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Bag</Text>
          <View style={[
            styles.clubCountBadge,
            clubCount === MAX_CLUBS && styles.clubCountFull,
          ]}>
            <Text style={[
              styles.clubCountText,
              clubCount === MAX_CLUBS && styles.clubCountTextFull,
            ]}>
              {clubCount}/{MAX_CLUBS}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  setActiveTab(tab);
                  if (tab !== 'All') setSearchQuery('');
                }}
                style={[styles.tab, isActive && styles.tabActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Bar — only on "All" tab */}
      {activeTab === 'All' && (
        <View style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={theme.colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search clubs..."
              placeholderTextColor={theme.colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.6}>
                <Ionicons name="close-circle" size={18} color={theme.colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Club List */}
      <KeyboardAvoidingView
        style={styles.listFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty state for My Bag */}
          {activeTab === 'My Bag' && visibleClubs.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="golf-outline" size={36} color={theme.colors.neutral.gray[300]} />
              </View>
              <Text style={styles.emptyTitle}>Your bag is empty</Text>
              <Text style={styles.emptyDesc}>
                Tap the "All" tab or browse by category to add clubs to your bag.
              </Text>
            </View>
          )}

          {/* No search results */}
          {activeTab === 'All' && searchQuery.trim().length > 0 && visibleClubs.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No clubs found</Text>
              <Text style={styles.emptyDesc}>
                Try a different search term.
              </Text>
            </View>
          )}

          {visibleClubs.map(renderClubCard)}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed Save Button — sits above the bottom tab bar */}
      <View style={[styles.saveWrapper, { paddingBottom: 90 }]}>
        {hasChanges && (
          <Text style={styles.unsavedHint}>You have unsaved changes</Text>
        )}
        <TouchableOpacity onPress={handleSave} activeOpacity={0.8}>
          <LinearGradient
            colors={hasChanges
              ? [theme.colors.primary[500], theme.colors.primary[600]]
              : [theme.colors.neutral.gray[300], theme.colors.neutral.gray[400]]}
            style={styles.saveButton}
          >
            <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.saveText}>Save & Close</Text>
            <View style={styles.savePill}>
              <Text style={styles.savePillText}>{clubCount} clubs</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TrainingOverlay {...trainingOverlayProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.text.tertiary,
  },

  // ── Header ──────────────────────────────
  headerGradient: {
    paddingBottom: theme.spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: '#fff',
  },
  clubCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  clubCountFull: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  clubCountText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  clubCountTextFull: {
    color: '#fff',
  },

  // ── Tabs ────────────────────────────────
  tabsWrapper: {
    backgroundColor: theme.colors.background.white,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  tabsScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.neutral.gray[100],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
  },
  tabActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[500],
  },
  tabText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  tabTextActive: {
    color: '#fff',
  },

  // ── Search Bar ──────────────────────────
  searchWrapper: {
    backgroundColor: theme.colors.background.white,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.neutral.gray[100],
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 14,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.primary,
    paddingVertical: 0,
  },

  // ── Empty State ─────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['5xl'],
    paddingHorizontal: theme.spacing['2xl'],
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.neutral.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
  emptyDesc: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Club List ───────────────────────────
  listFlex: {
    flex: 1,
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingBottom: 120,
    gap: 10,
  },

  // ── Club Card ───────────────────────────
  clubCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  clubCardActive: {
    borderColor: theme.colors.primary[200],
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  clubRowDisabled: {
    opacity: 0.4,
  },

  // ── Club Badge ──────────────────────────
  clubBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubBadgeInactive: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.neutral.gray[100],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
  },
  badgeTextActive: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: '#fff',
  },
  badgeTextInactive: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.text.tertiary,
  },

  // ── Club Info ───────────────────────────
  clubInfo: {
    flex: 1,
  },
  clubName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  clubNameDim: {
    color: theme.colors.text.tertiary,
  },
  yardsPreview: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primary[600],
    marginTop: 2,
  },
  putterLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.text.tertiary,
    marginTop: 2,
  },

  // ── Toggle Button ───────────────────────
  toggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.neutral.gray[100],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.primary[300],
  },
  toggleIcon: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.tertiary,
  },
  toggleIconActive: {
    color: theme.colors.primary[600],
  },

  // ── Yardage Editor ──────────────────────
  yardageSection: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  yardageCard: {
    backgroundColor: theme.colors.neutral.gray[50],
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
  },
  yardageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  yardageLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    letterSpacing: 1,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
  },
  yardageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.background.white,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  yardageInput: {
    width: 68,
    height: 38,
    textAlign: 'center',
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.white,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[300],
    borderRadius: 10,
  },
  ydsUnit: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.text.tertiary,
    marginLeft: 2,
  },
  barTrack: {
    height: 6,
    backgroundColor: theme.colors.neutral.gray[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Save Button ─────────────────────────
  saveWrapper: {
    backgroundColor: theme.colors.background.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.gray[200],
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  unsavedHint: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.secondary[500] || '#f59e0b',
    textAlign: 'center',
    marginBottom: 8,
  },
  saveButton: {
    height: 56,
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...theme.shadows.primaryGlow,
  },
  saveText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: '#fff',
  },
  savePill: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  savePillText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: '#fff',
  },
});
