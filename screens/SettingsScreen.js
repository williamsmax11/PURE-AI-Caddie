import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Linking,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../config/supabase';
import { updateProfile } from '../services/authService';
import { useTraining } from '../components/TrainingProvider';
import theme from '../theme';

const SETTINGS_KEY = '@appSettings';

const DEFAULT_SETTINGS = {
  distanceUnit: 'yards',
  ttsEnabled: false,
  aiAdviceDetail: 'standard',
  roundReminders: false,
  weeklySummary: false,
};

const TYPICAL_SCORE_OPTIONS = [
  { label: 'Under 72', value: '<72' },
  { label: '72 \u2013 79', value: '72-79' },
  { label: '80 \u2013 89', value: '80-89' },
  { label: '90 \u2013 99', value: '90-99' },
  { label: '100+', value: '100+' },
  { label: 'Not sure', value: 'not_sure' },
];

const DRIVER_DISTANCE_OPTIONS = [
  { label: '290+ yards', value: '290+' },
  { label: '265 \u2013 290 yards', value: '265-290' },
  { label: '240 \u2013 264 yards', value: '240-264' },
  { label: '215 \u2013 239 yards', value: '215-239' },
  { label: '190 \u2013 214 yards', value: '190-214' },
  { label: 'Under 190 yards', value: '<190' },
  { label: "Don't know", value: 'dont_know' },
];

const MISS_PATTERN_OPTIONS = [
  { label: 'Slice / Fade', value: 'slice_fade' },
  { label: 'Hook / Draw', value: 'hook_draw' },
  { label: 'Both ways', value: 'both' },
  { label: 'Pretty straight', value: 'straight' },
];

const DISTANCE_CONTROL_OPTIONS = [
  { label: 'Usually short', value: 'short' },
  { label: 'Usually long', value: 'long' },
  { label: 'Pretty good', value: 'good' },
  { label: 'All over the place', value: 'all_over' },
];

const ADVICE_DETAIL_OPTIONS = [
  { label: 'Brief', value: 'brief' },
  { label: 'Standard', value: 'standard' },
  { label: 'Detailed', value: 'detailed' },
];

export default function SettingsScreen({ onBack, userProfile, session, onProfileUpdate, onSignOut }) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [editName, setEditName] = useState(userProfile?.name || '');
  const [profileFields, setProfileFields] = useState({
    typical_score: userProfile?.typical_score || userProfile?.typicalScore || '',
    driver_distance: userProfile?.driver_distance || userProfile?.driverDistance || '',
    miss_pattern: userProfile?.miss_pattern || userProfile?.missPattern || '',
    distance_control: userProfile?.distance_control || userProfile?.distanceControl || '',
    target_score: userProfile?.target_score || userProfile?.targetScore || '',
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [activePickerModal, setActivePickerModal] = useState(null);
  const { resetTraining, resetAllTrainings } = useTraining('settings');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  };

  const updateSetting = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save setting:', e);
    }
  };

  const saveProfileField = async (key, value) => {
    setProfileFields(prev => ({ ...prev, [key]: value }));

    const updatedProfile = { ...userProfile, [key]: value };

    // Save to AsyncStorage
    try {
      await AsyncStorage.setItem('userProfile', JSON.stringify(updatedProfile));
    } catch (e) {
      console.warn('Failed to save profile locally:', e);
    }

    // Save to Supabase
    if (session?.user?.id) {
      const { error } = await updateProfile(session.user.id, { [key]: value });
      if (error) {
        console.warn('Failed to save profile to server:', error.message);
      }
    }

    onProfileUpdate?.(updatedProfile);
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === userProfile?.name) return;
    await saveProfileField('name', trimmed);
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess('Password updated successfully');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowPasswordChange(false);
          setPasswordSuccess('');
        }, 2000);
      }
    } catch (e) {
      setPasswordError('Failed to update password');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete profile from Supabase
              if (session?.user?.id) {
                await supabase.from('profiles').delete().eq('id', session.user.id);
              }
              // Clear local data
              await AsyncStorage.multiRemove(['userProfile', '@myGolfBag', SETTINGS_KEY]);
              // Sign out
              onSignOut?.();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
        },
      ],
    );
  };

  const getPickerConfig = () => {
    switch (activePickerModal) {
      case 'typical_score':
        return { title: 'Typical Score', options: TYPICAL_SCORE_OPTIONS, current: profileFields.typical_score, onSelect: (v) => saveProfileField('typical_score', v) };
      case 'driver_distance':
        return { title: 'Driver Distance', options: DRIVER_DISTANCE_OPTIONS, current: profileFields.driver_distance, onSelect: (v) => saveProfileField('driver_distance', v) };
      case 'miss_pattern':
        return { title: 'Miss Pattern', options: MISS_PATTERN_OPTIONS, current: profileFields.miss_pattern, onSelect: (v) => saveProfileField('miss_pattern', v) };
      case 'distance_control':
        return { title: 'Distance Control', options: DISTANCE_CONTROL_OPTIONS, current: profileFields.distance_control, onSelect: (v) => saveProfileField('distance_control', v) };
      case 'adviceDetail':
        return { title: 'AI Advice Detail', options: ADVICE_DETAIL_OPTIONS, current: settings.aiAdviceDetail, onSelect: (v) => updateSetting('aiAdviceDetail', v) };
      default:
        return null;
    }
  };

  const getDisplayLabel = (options, value) => {
    const found = options.find(o => o.value === value);
    return found ? found.label : 'Not set';
  };

  const pickerConfig = getPickerConfig();

  // Compute user initials for avatar
  const userName = userProfile?.name || '';
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header with gradient background */}
      <LinearGradient
        colors={[theme.colors.primary[700], theme.colors.primary[600]]}
        style={[styles.headerGradient, { paddingTop: insets.top + theme.spacing.sm }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.backButton} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ===== PROFILE HEADER CARD ===== */}
          <View style={styles.profileCard}>
            <LinearGradient
              colors={[theme.colors.primary[500], theme.colors.primary[600]]}
              style={styles.avatarCircle}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{userName || 'Golfer'}</Text>
              <Text style={styles.profileEmail}>{session?.user?.email || ''}</Text>
              {profileFields.typical_score && profileFields.typical_score !== 'not_sure' && (
                <View style={styles.handicapBadge}>
                  <Text style={styles.handicapBadgeText}>Shoots {profileFields.typical_score}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ===== PROFILE ===== */}
          <Text style={styles.sectionTitle}>PROFILE</Text>

          {/* Name */}
          <View style={styles.settingRow}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary[50] }]}>
                <Ionicons name="person-outline" size={16} color={theme.colors.primary[600]} />
              </View>
              <Text style={styles.settingLabel}>Name</Text>
            </View>
            <TextInput
              style={styles.settingTextInput}
              value={editName}
              onChangeText={setEditName}
              onBlur={handleSaveName}
              placeholder="Your name"
              placeholderTextColor={theme.colors.text.tertiary}
              returnKeyType="done"
            />
          </View>

          {/* Typical Score */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setActivePickerModal('typical_score')}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.gold.light }]}>
                <Ionicons name="trophy-outline" size={16} color={theme.colors.gold.dark} />
              </View>
              <Text style={styles.settingLabel}>Typical Score</Text>
            </View>
            <View style={styles.settingValueRow}>
              <Text style={styles.settingValue}>{getDisplayLabel(TYPICAL_SCORE_OPTIONS, profileFields.typical_score)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          {/* Driver Distance */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setActivePickerModal('driver_distance')}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.secondary[50] }]}>
                <Ionicons name="speedometer-outline" size={16} color={theme.colors.secondary[600]} />
              </View>
              <Text style={styles.settingLabel}>Driver Distance</Text>
            </View>
            <View style={styles.settingValueRow}>
              <Text style={styles.settingValue}>{getDisplayLabel(DRIVER_DISTANCE_OPTIONS, profileFields.driver_distance)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          {/* Miss Pattern */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setActivePickerModal('miss_pattern')}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.accent.amber + '15' }]}>
                <Ionicons name="arrow-redo-outline" size={16} color={theme.colors.accent.amber} />
              </View>
              <Text style={styles.settingLabel}>Miss Pattern</Text>
            </View>
            <View style={styles.settingValueRow}>
              <Text style={styles.settingValue}>{getDisplayLabel(MISS_PATTERN_OPTIONS, profileFields.miss_pattern)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          {/* Distance Control */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setActivePickerModal('distance_control')}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary[50] }]}>
                <Ionicons name="analytics-outline" size={16} color={theme.colors.primary[600]} />
              </View>
              <Text style={styles.settingLabel}>Distance Control</Text>
            </View>
            <View style={styles.settingValueRow}>
              <Text style={styles.settingValue}>{getDisplayLabel(DISTANCE_CONTROL_OPTIONS, profileFields.distance_control)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          {/* Email (display-only) */}
          <View style={styles.settingRow}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.neutral.gray[100] }]}>
                <Ionicons name="mail-outline" size={16} color={theme.colors.text.secondary} />
              </View>
              <Text style={styles.settingLabel}>Email</Text>
            </View>
            <Text style={styles.settingValueMuted}>{session?.user?.email || '—'}</Text>
          </View>

          {/* ===== UNITS & DISPLAY ===== */}
          <Text style={styles.sectionTitle}>UNITS & DISPLAY</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.secondary[50] }]}>
                <Ionicons name="resize-outline" size={16} color={theme.colors.secondary[600]} />
              </View>
              <Text style={styles.settingLabel}>Distance Unit</Text>
            </View>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segment, settings.distanceUnit === 'yards' && styles.segmentActive]}
                onPress={() => updateSetting('distanceUnit', 'yards')}
              >
                <Text style={[styles.segmentText, settings.distanceUnit === 'yards' && styles.segmentTextActive]}>Yards</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, settings.distanceUnit === 'meters' && styles.segmentActive]}
                onPress={() => updateSetting('distanceUnit', 'meters')}
              >
                <Text style={[styles.segmentText, settings.distanceUnit === 'meters' && styles.segmentTextActive]}>Meters</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ===== PURE ===== */}
          <Text style={styles.sectionTitle}>PURE AI</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconRow}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary[50] }]}>
                  <Ionicons name="volume-high-outline" size={16} color={theme.colors.primary[600]} />
                </View>
                <Text style={styles.settingLabel}>Text-to-Speech</Text>
              </View>
              <Text style={[styles.settingDescription, { marginLeft: 36 }]}>Hear AI advice read aloud during your round</Text>
            </View>
            <Switch
              value={settings.ttsEnabled}
              onValueChange={(value) => updateSetting('ttsEnabled', value)}
              trackColor={{ false: theme.colors.neutral.gray[300], true: theme.colors.primary[300] }}
              thumbColor={settings.ttsEnabled ? theme.colors.primary[500] : theme.colors.neutral.gray[100]}
            />
          </View>

          <TouchableOpacity style={styles.settingRow} onPress={() => setActivePickerModal('adviceDetail')}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconRow}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.dark.surface + '12' }]}>
                  <Ionicons name="sparkles-outline" size={16} color={theme.colors.dark.surface} />
                </View>
                <Text style={styles.settingLabel}>Advice Detail</Text>
              </View>
              <Text style={[styles.settingDescription, { marginLeft: 36 }]}>Controls how detailed AI responses are</Text>
            </View>
            <View style={styles.settingValueRow}>
              <Text style={styles.settingValue}>{getDisplayLabel(ADVICE_DETAIL_OPTIONS, settings.aiAdviceDetail)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          {/* ===== NOTIFICATIONS ===== */}
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconRow}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.accent.orange + '15' }]}>
                  <Ionicons name="notifications-outline" size={16} color={theme.colors.accent.orange} />
                </View>
                <Text style={styles.settingLabel}>Round Reminders</Text>
              </View>
              <Text style={[styles.settingDescription, { marginLeft: 36 }]}>Get reminders about upcoming rounds</Text>
            </View>
            <Switch
              value={settings.roundReminders}
              onValueChange={(value) => updateSetting('roundReminders', value)}
              trackColor={{ false: theme.colors.neutral.gray[300], true: theme.colors.primary[300] }}
              thumbColor={settings.roundReminders ? theme.colors.primary[500] : theme.colors.neutral.gray[100]}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconRow}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary[50] }]}>
                  <Ionicons name="stats-chart-outline" size={16} color={theme.colors.primary[600]} />
                </View>
                <Text style={styles.settingLabel}>Weekly Summary</Text>
              </View>
              <Text style={[styles.settingDescription, { marginLeft: 36 }]}>Receive a weekly recap of your rounds</Text>
            </View>
            <Switch
              value={settings.weeklySummary}
              onValueChange={(value) => updateSetting('weeklySummary', value)}
              trackColor={{ false: theme.colors.neutral.gray[300], true: theme.colors.primary[300] }}
              thumbColor={settings.weeklySummary ? theme.colors.primary[500] : theme.colors.neutral.gray[100]}
            />
          </View>

          {/* ===== TUTORIALS ===== */}
          <Text style={styles.sectionTitle}>TUTORIALS</Text>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await resetTraining('home_intro');
              Alert.alert('Tutorial Reset', 'The Home tour will replay next time you visit the Home screen.');
            }}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary[50] }]}>
                <Ionicons name="home-outline" size={16} color={theme.colors.primary[600]} />
              </View>
              <Text style={styles.settingLabel}>Replay Home Tour</Text>
            </View>
            <Ionicons name="refresh-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await resetTraining('hole_view_intro');
              Alert.alert('Tutorial Reset', 'The Hole View tour will replay next time you start a round.');
            }}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.secondary[50] }]}>
                <Ionicons name="map-outline" size={16} color={theme.colors.secondary[600]} />
              </View>
              <Text style={styles.settingLabel}>Replay Hole View Tour</Text>
            </View>
            <Ionicons name="refresh-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await resetTraining('my_bag_intro');
              Alert.alert('Tutorial Reset', 'The My Bag tour will replay next time you visit My Bag.');
            }}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.gold.light }]}>
                <Ionicons name="bag-handle-outline" size={16} color={theme.colors.gold.dark} />
              </View>
              <Text style={styles.settingLabel}>Replay My Bag Tour</Text>
            </View>
            <Ionicons name="refresh-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await resetTraining('player_insights_intro');
              Alert.alert('Tutorial Reset', 'The Insights tour will replay next time you visit Player Insights.');
            }}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.accent.teal + '15' }]}>
                <Ionicons name="analytics-outline" size={16} color={theme.colors.accent.teal} />
              </View>
              <Text style={styles.settingLabel}>Replay Insights Tour</Text>
            </View>
            <Ionicons name="refresh-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await resetAllTrainings();
              Alert.alert('All Tutorials Reset', 'All tutorials will replay as you navigate the app.');
            }}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.gold.light }]}>
                <Ionicons name="refresh-outline" size={16} color={theme.colors.gold.dark} />
              </View>
              <Text style={styles.settingLabel}>Replay All Tutorials</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          {/* ===== ACCOUNT ===== */}
          <Text style={styles.sectionTitle}>ACCOUNT</Text>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              setShowPasswordChange(!showPasswordChange);
              setPasswordError('');
              setPasswordSuccess('');
              setNewPassword('');
              setConfirmPassword('');
            }}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.neutral.gray[100] }]}>
                <Ionicons name="lock-closed-outline" size={16} color={theme.colors.text.secondary} />
              </View>
              <Text style={styles.settingLabel}>Change Password</Text>
            </View>
            <Ionicons
              name={showPasswordChange ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={theme.colors.text.tertiary}
            />
          </TouchableOpacity>

          {showPasswordChange && (
            <View style={styles.passwordSection}>
              <TextInput
                style={styles.passwordInput}
                placeholder="New password"
                placeholderTextColor={theme.colors.text.tertiary}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm password"
                placeholderTextColor={theme.colors.text.tertiary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
              {passwordSuccess ? <Text style={styles.successText}>{passwordSuccess}</Text> : null}
              <TouchableOpacity style={styles.changePasswordButton} onPress={handleChangePassword}>
                <Text style={styles.changePasswordButtonText}>Update Password</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.settingRow} onPress={onSignOut}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.neutral.gray[100] }]}>
                <Ionicons name="log-out-outline" size={16} color={theme.colors.text.secondary} />
              </View>
              <Text style={styles.settingLabel}>Sign Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} onPress={handleDeleteAccount}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.semantic.error + '12' }]}>
                <Ionicons name="trash-outline" size={16} color={theme.colors.semantic.error} />
              </View>
              <Text style={styles.destructiveText}>Delete Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.semantic.error} />
          </TouchableOpacity>

          {/* ===== ABOUT ===== */}
          <Text style={styles.sectionTitle}>ABOUT</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.neutral.gray[100] }]}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.text.secondary} />
              </View>
              <Text style={styles.settingLabel}>App Version</Text>
            </View>
            <Text style={styles.settingValueMuted}>1.0.0</Text>
          </View>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => Linking.openURL('https://puregolf.app/terms')}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.neutral.gray[100] }]}>
                <Ionicons name="document-text-outline" size={16} color={theme.colors.text.secondary} />
              </View>
              <Text style={styles.settingLabel}>Terms of Service</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => Linking.openURL('https://puregolf.app/privacy')}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.neutral.gray[100] }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.text.secondary} />
              </View>
              <Text style={styles.settingLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => Linking.openURL('mailto:support@puregolf.app?subject=Pure%20Feedback')}
          >
            <View style={styles.settingIconRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary[50] }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.primary[600]} />
              </View>
              <Text style={styles.settingLabel}>Send Feedback</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Picker Modal */}
      <Modal
        visible={activePickerModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActivePickerModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{pickerConfig?.title || ''}</Text>
              <TouchableOpacity onPress={() => setActivePickerModal(null)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerConfig?.options || []}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerOption,
                    item.value === pickerConfig?.current && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    pickerConfig?.onSelect(item.value);
                    setActivePickerModal(null);
                  }}
                >
                  <Text style={[
                    styles.pickerOptionText,
                    item.value === pickerConfig?.current && styles.pickerOptionTextSelected,
                  ]}>
                    {item.label}
                  </Text>
                  {item.value === pickerConfig?.current && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  // Header
  headerGradient: {
    paddingBottom: theme.spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
  },
  headerTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: '#fff',
  },
  backButton: {
    width: 40,
  },
  // Profile Card
  profileCard: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.md,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    color: '#fff',
  },
  profileInfo: {
    marginLeft: theme.spacing.base,
    flex: 1,
  },
  profileName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.primary,
  },
  profileEmail: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.tertiary,
    marginTop: 2,
  },
  handicapBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary[50],
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 3,
    marginTop: theme.spacing.sm,
  },
  handicapBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: theme.colors.primary[700],
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.base,
    paddingTop: theme.spacing.xs,
  },
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    letterSpacing: 1.2,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  settingRow: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...theme.shadows.sm,
    marginBottom: theme.spacing.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  settingIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  settingLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  settingDescription: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.text.tertiary,
    marginTop: 2,
  },
  settingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  settingValue: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  settingValueMuted: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.tertiary,
  },
  settingTextInput: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.primary,
    textAlign: 'right',
    flex: 1,
    marginLeft: theme.spacing.md,
    padding: 0,
  },
  // Segmented control
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.base,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[300],
    overflow: 'hidden',
  },
  segment: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.base,
    backgroundColor: theme.colors.background.white,
  },
  segmentActive: {
    backgroundColor: theme.colors.primary[500],
  },
  segmentText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  segmentTextActive: {
    color: '#fff',
  },
  // Password change
  passwordSection: {
    backgroundColor: theme.colors.background.white,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  passwordInput: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[300],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.primary,
  },
  changePasswordButton: {
    backgroundColor: theme.colors.primary[500],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  changePasswordButtonText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: '#fff',
  },
  errorText: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.semantic.error,
    marginBottom: theme.spacing.sm,
  },
  successText: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.semantic.success,
    marginBottom: theme.spacing.sm,
  },
  destructiveText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.semantic.error,
  },
  // Picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background.white,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: '50%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[200],
  },
  modalTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.colors.text.primary,
  },
  modalClose: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.primary[600],
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[100],
  },
  pickerOptionSelected: {
    backgroundColor: theme.colors.primary[50],
  },
  pickerOptionText: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  pickerOptionTextSelected: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.primary[700],
  },
  checkmark: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary[500],
    fontSize: 18,
  },
});
