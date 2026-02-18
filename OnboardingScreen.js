/**
 * Onboarding Screen — Unified Multi-Step Wizard
 *
 * Replaces the old 3-screen onboarding (OnboardingScreen + CaddieSetupScreen + BagSetupScreen)
 * with a single cohesive flow:
 *   0. Welcome + Name
 *   1. Big Picture (typical score)
 *   2. Your Driver (distance)
 *   3. Miss Pattern
 *   4. Distance Control
 *   5. Setup Your Bag (club selection)
 *  5b. Setup Your Bag (auto-calculated distances)
 *   6. Your Goal (target score)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  Image,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { updateProfile } from './services/authService';
import { supabase } from './config/supabase';
import {
  CLUB_DATA,
  ALL_CLUBS_FLAT,
  ALL_CLUBS_MAP,
  DEFAULT_ONBOARDING_BAG,
  MAX_CLUBS,
  STORAGE_KEY,
  CLUB_DISTANCE_PERCENTAGES,
  calculateDistancesFromDriver,
  createCustomWedge,
} from './data/clubData';
import { scoreRangeToHandicap, driverRangeToDistance } from './utils/onboardingUtils';
import theme from './theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.22;

const CLUB_COLORS = {
  woods:   theme.golfTheme?.clubs?.woods   || '#ea580c',
  hybrids: theme.golfTheme?.clubs?.woods   || '#ea580c',
  irons:   theme.golfTheme?.clubs?.irons   || '#2563eb',
  wedges:  theme.golfTheme?.clubs?.wedges  || '#16a34a',
  putter:  theme.golfTheme?.clubs?.putter  || '#7c3aed',
};

// Step labels for the progress indicator
const STEP_LABELS = [
  'Welcome',
  'Big Picture',
  'Your Driver',
  'Miss Pattern',
  'Distance',
  'Your Bag',
  'Your Goal',
];

// ──────────────────────────────────────────
// Option data for Steps 1-4
// ──────────────────────────────────────────

const SCORE_OPTIONS = [
  { value: '<72',      label: 'Under 72',     desc: 'Scratch or better' },
  { value: '72-79',    label: '72 – 79',      desc: 'Single digit handicap' },
  { value: '80-89',    label: '80 – 89',      desc: 'Solid player' },
  { value: '90-99',    label: '90 – 99',      desc: 'Getting there' },
  { value: '100+',     label: '100+',         desc: 'Working on it' },
  { value: 'not_sure', label: 'Not sure',     desc: 'First time or just starting' },
];

const DRIVER_OPTIONS = [
  { value: '290+',     label: '290+ yards' },
  { value: '265-290',  label: '265 – 290 yards' },
  { value: '240-264',  label: '240 – 264 yards' },
  { value: '215-239',  label: '215 – 239 yards' },
  { value: '190-214',  label: '190 – 214 yards' },
  { value: '<190',     label: 'Under 190 yards' },
  { value: 'dont_know', label: "Don't know" },
];

const MISS_OPTIONS = [
  { value: 'slice_fade', label: 'Slice / Fade',   desc: 'Curves right (for righties)' },
  { value: 'hook_draw',  label: 'Hook / Draw',    desc: 'Curves left (for righties)' },
  { value: 'both',       label: 'Both Ways',      desc: 'Could go either way' },
  { value: 'straight',   label: 'Pretty Straight', desc: 'Keeps it in play' },
];

const DISTANCE_CONTROL_OPTIONS = [
  { value: 'short',    label: 'Usually Short',       desc: 'Tend to come up short of the green' },
  { value: 'long',     label: 'Usually Long',        desc: 'Tend to fly it past' },
  { value: 'good',     label: 'Pretty Good',         desc: 'Generally dial in the right distance' },
  { value: 'all_over', label: 'All Over the Place',  desc: 'Distance is inconsistent' },
];

export default function OnboardingScreen({ onComplete, userId }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);

  // Navigation state
  const [currentStep, setCurrentStep] = useState(0);
  const [showDistanceStep, setShowDistanceStep] = useState(false); // 5b sub-step

  // Step 0: Welcome
  const [name, setName] = useState('');

  // Step 1: Big Picture
  const [typicalScore, setTypicalScore] = useState('');

  // Step 2: Your Driver
  const [driverDistance, setDriverDistance] = useState('');

  // Step 3: Miss Pattern
  const [missPattern, setMissPattern] = useState('');

  // Step 4: Distance Control
  const [distanceControl, setDistanceControl] = useState('');

  // Step 5: Bag Setup
  const [selectedClubs, setSelectedClubs] = useState([...DEFAULT_ONBOARDING_BAG]);
  const [customWedges, setCustomWedges] = useState([]);
  const [showCustomWedgeInput, setShowCustomWedgeInput] = useState(false);
  const [customWedgeDegree, setCustomWedgeDegree] = useState('');

  // Step 5b: Distances
  const [clubDistances, setClubDistances] = useState({});
  const [isCalculating, setIsCalculating] = useState(false);

  // Step 6: Goal
  const [targetScore, setTargetScore] = useState('');

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Scroll to top when step changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentStep, showDistanceStep]);

  // ──────────────────────────────────────────
  // Navigation
  // ──────────────────────────────────────────

  const animateTransition = (callback) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const goNext = () => {
    if (currentStep === 5 && !showDistanceStep) {
      // Move to 5b (distance sub-step)
      animateTransition(() => {
        setShowDistanceStep(true);
        triggerDistanceCalculation();
      });
    } else if (currentStep === 5 && showDistanceStep) {
      // Move from 5b to 6
      animateTransition(() => {
        setShowDistanceStep(false);
        setCurrentStep(6);
      });
    } else {
      animateTransition(() => setCurrentStep(currentStep + 1));
    }
  };

  const goBack = () => {
    if (currentStep === 5 && showDistanceStep) {
      animateTransition(() => setShowDistanceStep(false));
    } else if (currentStep > 0) {
      animateTransition(() => setCurrentStep(currentStep - 1));
    }
  };

  const handleOptionSelect = (setter, value) => {
    setter(value);
    // Auto-advance after a short delay
    setTimeout(() => goNext(), 350);
  };

  // ──────────────────────────────────────────
  // Distance calculation (Step 5b)
  // ──────────────────────────────────────────

  const triggerDistanceCalculation = () => {
    setIsCalculating(true);
    const numericDriver = driverRangeToDistance(driverDistance);
    const distances = calculateDistancesFromDriver(numericDriver, selectedClubs);

    // Estimate custom wedge distances
    for (const cw of customWedges) {
      const loft = parseInt(cw.id.replace('w_', ''), 10);
      const basePW = numericDriver * (CLUB_DISTANCE_PERCENTAGES.pw || 0.49);
      const reduction = Math.max(0, (loft - 45) * 2.5);
      distances[cw.id] = Math.round(Math.max(30, basePW - reduction));
    }

    setTimeout(() => {
      setClubDistances(distances);
      setIsCalculating(false);
    }, 1500);
  };

  const updateClubDistance = (clubId, value) => {
    const numeric = value.replace(/[^0-9]/g, '');
    setClubDistances(prev => ({ ...prev, [clubId]: numeric ? parseInt(numeric, 10) : '' }));
  };

  // ──────────────────────────────────────────
  // Club selection (Step 5)
  // ──────────────────────────────────────────

  const toggleClub = (clubId) => {
    setSelectedClubs(prev => {
      if (prev.includes(clubId)) {
        return prev.filter(id => id !== clubId);
      }
      if (prev.length >= MAX_CLUBS) return prev;
      return [...prev, clubId];
    });
  };

  const addCustomWedge = () => {
    const deg = parseInt(customWedgeDegree, 10);
    if (isNaN(deg) || deg < 40 || deg > 70) {
      Alert.alert('Invalid Degree', 'Please enter a degree between 40 and 70.');
      return;
    }
    const existing = customWedges.find(w => w.id === `w_${deg}`);
    if (existing || ALL_CLUBS_MAP[`w_${deg}`]) {
      Alert.alert('Already Exists', `A ${deg}\u00b0 wedge is already in the list.`);
      return;
    }
    if (selectedClubs.length >= MAX_CLUBS) {
      Alert.alert('Bag Full', `You can have at most ${MAX_CLUBS} clubs.`);
      return;
    }
    const newWedge = createCustomWedge(deg);
    setCustomWedges(prev => [...prev, newWedge]);
    setSelectedClubs(prev => [...prev, newWedge.id]);
    setCustomWedgeDegree('');
    setShowCustomWedgeInput(false);
  };

  // ──────────────────────────────────────────
  // Save & Complete
  // ──────────────────────────────────────────

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      const handicapEstimate = scoreRangeToHandicap(typicalScore);

      // 1. Save profile to Supabase
      if (userId) {
        const { error: profileError } = await updateProfile(userId, {
          name,
          typical_score: typicalScore,
          driver_distance: driverDistance,
          miss_pattern: missPattern,
          distance_control: distanceControl,
          target_score: targetScore ? parseInt(targetScore, 10) : null,
          handicap: String(handicapEstimate),
          onboarding_completed: true,
          caddie_setup_completed: true,
          bag_setup_completed: true,
        });
        if (profileError) {
          console.error('Profile save failed:', profileError.message, profileError.details, profileError.hint);
        }
      }

      // 2. Save profile to AsyncStorage
      await AsyncStorage.setItem('userProfile', JSON.stringify({
        name,
        typicalScore,
        driverDistance,
        missPattern,
        distanceControl,
        targetScore,
        handicap: String(handicapEstimate),
        onboardingCompleted: true,
        caddieSetupCompleted: true,
        bagSetupCompleted: true,
      }));

      // 3. Save clubs to AsyncStorage
      const allClubDefs = [...ALL_CLUBS_FLAT, ...customWedges];
      const bagData = {};
      const dbRows = [];
      for (const clubId of selectedClubs) {
        const clubDef = allClubDefs.find(c => c.id === clubId);
        if (!clubDef) continue;
        const dist = clubDistances[clubId];
        bagData[clubId] = {
          id: clubId,
          name: clubDef.name,
          category: clubDef.category,
          distance: dist != null && dist !== '' ? String(dist) : '',
          defaultDistance: dist || null,
        };
        dbRows.push({
          user_id: userId,
          club_id: clubId,
          name: clubDef.name,
          category: clubDef.category,
          distance: dist != null && dist !== '' ? parseInt(dist, 10) : null,
        });
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bagData));

      // 4. Save clubs to Supabase
      if (userId && dbRows.length > 0) {
        await supabase.from('user_clubs').delete().eq('user_id', userId);
        await supabase.from('user_clubs').insert(dbRows);
      }

      onComplete();
    } catch (err) {
      console.error('Onboarding save error:', err);
      // Still complete — AsyncStorage has the data
      onComplete();
    } finally {
      setIsSaving(false);
    }
  };

  // ──────────────────────────────────────────
  // Progress indicator
  // ──────────────────────────────────────────

  const displayStep = showDistanceStep ? 5 : currentStep;

  const renderProgressBar = () => (
    <View style={[styles.progressContainer, { paddingTop: insets.top + 8 }]}>
      {STEP_LABELS.map((_label, i) => {
        const isActive = i === displayStep;
        const isCompleted = i < displayStep;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={[styles.progressConnector, isCompleted && styles.progressConnectorDone]} />
            )}
            <View style={[
              styles.progressDot,
              isActive && styles.progressDotActive,
              isCompleted && styles.progressDotDone,
            ]}>
              {isCompleted ? (
                <Ionicons name="checkmark" size={10} color="#fff" />
              ) : (
                <Text style={[
                  styles.progressDotText,
                  (isActive || isCompleted) && styles.progressDotTextActive,
                ]}>{i + 1}</Text>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );

  // ──────────────────────────────────────────
  // Step renderers
  // ──────────────────────────────────────────

  const renderStep0Welcome = () => (
    <View style={styles.stepContent}>
      <Text style={styles.caddieGreeting}>
        Hey there! I'm Pure, your AI Caddie.
      </Text>
      <Text style={styles.stepTitle}>Your AI Caddie is Ready</Text>
      <Text style={styles.stepSubtitle}>
        I'll help you play smarter golf. Let me learn a few things about your game so I can give you the best advice on the course.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>What should I call you?</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.colors.text.tertiary}
          autoFocus
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, !name.trim() && styles.buttonDisabled]}
        onPress={goNext}
        disabled={!name.trim()}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={name.trim()
            ? [theme.colors.primary[500], theme.colors.primary[600]]
            : [theme.colors.neutral.gray[300], theme.colors.neutral.gray[300]]}
          style={styles.buttonGradient}
        >
          <Text style={[styles.buttonText, !name.trim() && styles.buttonTextDisabled]}>
            Let's Go
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderOptionStep = (question, caddieText, options, selectedValue, setter) => (
    <View style={styles.stepContent}>
      <Text style={styles.caddieGreeting}>{caddieText}</Text>
      <Text style={styles.stepTitle}>{question}</Text>

      <View style={styles.optionsGrid}>
        {options.map((opt) => {
          const isSelected = selectedValue === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => handleOptionSelect(setter, opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {opt.label}
              </Text>
              {opt.desc && (
                <Text style={[styles.optionDesc, isSelected && styles.optionDescSelected]}>
                  {opt.desc}
                </Text>
              )}
              {isSelected && (
                <View style={styles.optionCheck}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep5ClubSelection = () => {
    const allCategories = Object.entries(CLUB_DATA);
    return (
      <View style={styles.stepContent}>
        <Text style={styles.caddieGreeting}>
          Now let's set up your bag.
        </Text>
        <Text style={styles.stepTitle}>What's in Your Bag?</Text>
        <Text style={styles.stepSubtitle}>
          Select the clubs you carry. You can have up to {MAX_CLUBS} clubs.
        </Text>

        <View style={styles.clubCountBadge}>
          <Text style={[
            styles.clubCountText,
            selectedClubs.length >= MAX_CLUBS && styles.clubCountFull,
          ]}>
            {selectedClubs.length} / {MAX_CLUBS} clubs
          </Text>
        </View>

        {allCategories.map(([category, clubs]) => (
          <View key={category} style={styles.clubCategory}>
            <View style={styles.clubCategoryHeader}>
              <View style={[styles.clubCategoryDot, { backgroundColor: CLUB_COLORS[clubs[0]?.category] || theme.colors.primary[500] }]} />
              <Text style={styles.clubCategoryTitle}>{category}</Text>
            </View>
            <View style={styles.clubGrid}>
              {clubs.map((club) => {
                const isSelected = selectedClubs.includes(club.id);
                const isFull = selectedClubs.length >= MAX_CLUBS && !isSelected;
                return (
                  <TouchableOpacity
                    key={club.id}
                    style={[
                      styles.clubChip,
                      isSelected && styles.clubChipSelected,
                      isFull && styles.clubChipDisabled,
                    ]}
                    onPress={() => toggleClub(club.id)}
                    disabled={isFull}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.clubChipText,
                      isSelected && styles.clubChipTextSelected,
                      isFull && styles.clubChipTextDisabled,
                    ]}>
                      {club.shortName}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary[500]} style={{ marginLeft: 4 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom wedge button in Wedges section */}
            {category === 'Wedges' && (
              <View style={styles.customWedgeSection}>
                {customWedges.map((cw) => {
                  const isSelected = selectedClubs.includes(cw.id);
                  const isFull = selectedClubs.length >= MAX_CLUBS && !isSelected;
                  return (
                    <TouchableOpacity
                      key={cw.id}
                      style={[
                        styles.clubChip,
                        isSelected && styles.clubChipSelected,
                        isFull && styles.clubChipDisabled,
                        { marginRight: 8, marginBottom: 8 },
                      ]}
                      onPress={() => toggleClub(cw.id)}
                      disabled={isFull}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.clubChipText,
                        isSelected && styles.clubChipTextSelected,
                      ]}>
                        {cw.shortName}\u00b0
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary[500]} style={{ marginLeft: 4 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {showCustomWedgeInput ? (
                  <View style={styles.customWedgeInputRow}>
                    <TextInput
                      style={styles.customWedgeInput}
                      value={customWedgeDegree}
                      onChangeText={setCustomWedgeDegree}
                      placeholder="Deg (40-70)"
                      placeholderTextColor={theme.colors.text.tertiary}
                      keyboardType="number-pad"
                      maxLength={2}
                      autoFocus
                    />
                    <TouchableOpacity style={styles.customWedgeAdd} onPress={addCustomWedge}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.customWedgeCancel}
                      onPress={() => { setShowCustomWedgeInput(false); setCustomWedgeDegree(''); }}
                    >
                      <Ionicons name="close" size={20} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addCustomButton}
                    onPress={() => setShowCustomWedgeInput(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary[500]} />
                    <Text style={styles.addCustomText}>Add Custom Wedge</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity
          style={[styles.primaryButton, selectedClubs.length === 0 && styles.buttonDisabled]}
          onPress={goNext}
          disabled={selectedClubs.length === 0}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={selectedClubs.length > 0
              ? [theme.colors.primary[500], theme.colors.primary[600]]
              : [theme.colors.neutral.gray[300], theme.colors.neutral.gray[300]]}
            style={styles.buttonGradient}
          >
            <Text style={[styles.buttonText, selectedClubs.length === 0 && styles.buttonTextDisabled]}>
              Set Distances
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderStep5bDistances = () => {
    if (isCalculating) {
      return (
        <View style={styles.calculatingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
          <Text style={styles.calculatingText}>Calculating your distances...</Text>
          <Text style={styles.calculatingSubtext}>
            Based on your {driverDistance === 'dont_know' ? 'estimated' : driverDistance} driver distance
          </Text>
        </View>
      );
    }

    const allClubDefs = [...ALL_CLUBS_FLAT, ...customWedges];
    const orderedClubs = allClubDefs
      .filter(c => selectedClubs.includes(c.id));

    return (
      <View style={styles.stepContent}>
        <Text style={styles.caddieGreeting}>
          Here are your estimated distances. Adjust any that don't look right.
        </Text>
        <Text style={styles.stepTitle}>Your Distances</Text>

        {orderedClubs.map((club) => {
          if (club.id === 'putter') return null;
          const dist = clubDistances[club.id];
          return (
            <View key={club.id} style={styles.distanceRow}>
              <View style={styles.distanceClubInfo}>
                <View style={[styles.distanceDot, { backgroundColor: CLUB_COLORS[club.category] || theme.colors.primary[500] }]} />
                <Text style={styles.distanceClubName}>{club.name}</Text>
              </View>
              <View style={styles.distanceInputWrapper}>
                <TextInput
                  style={styles.distanceInput}
                  value={dist != null && dist !== '' ? String(dist) : ''}
                  onChangeText={(v) => updateClubDistance(club.id, v)}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="\u2014"
                  placeholderTextColor={theme.colors.text.tertiary}
                />
                <Text style={styles.distanceUnit}>yds</Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={goNext}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[theme.colors.primary[500], theme.colors.primary[600]]}
            style={styles.buttonGradient}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderStep6Goal = () => (
    <View style={styles.stepContent}>
      <Text style={styles.caddieGreeting}>
        Last one! Let's set a target to work toward.
      </Text>
      <Text style={styles.stepTitle}>What Score Do You Want to Break?</Text>
      <Text style={styles.stepSubtitle}>
        Having a clear goal helps me give you better advice during your round.
      </Text>

      <View style={styles.goalInputContainer}>
        <TextInput
          style={styles.goalInput}
          value={targetScore}
          onChangeText={(v) => setTargetScore(v.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 90"
          placeholderTextColor={theme.colors.text.tertiary}
          keyboardType="number-pad"
          maxLength={3}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
        onPress={handleComplete}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={!isSaving
            ? [theme.colors.primary[500], theme.colors.primary[600]]
            : [theme.colors.neutral.gray[300], theme.colors.neutral.gray[300]]}
          style={styles.buttonGradient}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Finish Setup</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // ──────────────────────────────────────────
  // Main render
  // ──────────────────────────────────────────

  const renderCurrentStep = () => {
    if (currentStep === 5 && showDistanceStep) return renderStep5bDistances();

    switch (currentStep) {
      case 0: return renderStep0Welcome();
      case 1: return renderOptionStep(
        'What do you typically shoot for 18 holes?',
        `Nice to meet you, ${name}! Let's start with the big picture.`,
        SCORE_OPTIONS, typicalScore, setTypicalScore
      );
      case 2: return renderOptionStep(
        'How far does your driver typically go?',
        'Great. Now let me get a sense of your power.',
        DRIVER_OPTIONS, driverDistance, setDriverDistance
      );
      case 3: return renderOptionStep(
        'When you miss, which way does it usually go?',
        "Good to know. Now let's talk about your miss pattern.",
        MISS_OPTIONS, missPattern, setMissPattern
      );
      case 4: return renderOptionStep(
        'With your irons, do you tend to miss short or long?',
        "Almost there with the questions. One more about your irons.",
        DISTANCE_CONTROL_OPTIONS, distanceControl, setDistanceControl
      );
      case 5: return renderStep5ClubSelection();
      case 6: return renderStep6Goal();
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Hero background */}
      <ImageBackground
        source={require('./assets/golf-course-landscape.jpg')}
        style={styles.heroContainer}
        resizeMode="cover"
        imageStyle={styles.heroImage}
      >
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
          style={styles.heroOverlay}
        >
          {renderProgressBar()}
          <View style={styles.heroContent}>
            <Image
              source={require('./assets/Pure_Logo_white.png')}
              style={styles.logoImage}
            />
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* Form card */}
      <KeyboardAvoidingView
        style={styles.formWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.formCard}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Back button */}
          {(currentStep > 0 || showDistanceStep) && (
            <TouchableOpacity style={styles.backButton} onPress={goBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color={theme.colors.text.secondary} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          )}

          <Animated.View style={{ opacity: fadeAnim }}>
            {renderCurrentStep()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ──────────────────────────────────────────
// Styles
// ──────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },

  // Hero
  heroContainer: {
    height: HERO_HEIGHT,
    width: '100%',
  },
  heroImage: {
    top: -20,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  heroContent: {
    alignItems: 'center',
    paddingBottom: theme.spacing['2xl'],
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  // Progress
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    backgroundColor: '#fff',
    ...theme.shadows.sm,
  },
  progressDotDone: {
    backgroundColor: theme.colors.primary[500],
  },
  progressDotText: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  progressDotTextActive: {
    color: theme.colors.primary[700],
  },
  progressConnector: {
    width: 16,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 2,
  },
  progressConnectorDone: {
    backgroundColor: theme.colors.primary[400],
  },

  // Form card
  formWrapper: {
    flex: 1,
    marginTop: -24,
  },
  formCard: {
    flex: 1,
    backgroundColor: theme.colors.background.white,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
  },
  formContent: {
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: 60,
  },

  // Back button
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  backText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.text.secondary,
    marginLeft: 4,
  },

  // Step content
  stepContent: {
    flex: 1,
  },
  caddieGreeting: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.primary[600],
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  stepTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    lineHeight: 32,
  },
  stepSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },

  // Input
  inputGroup: {
    marginBottom: theme.spacing.xl,
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    fontFamily: theme.fonts.regular,
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.base,
    fontSize: 16,
    color: theme.colors.text.primary,
  },

  // Option cards (Steps 1-4)
  optionsGrid: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 2,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.lg,
    position: 'relative',
  },
  optionCardSelected: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.primary[500],
  },
  optionLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  optionLabelSelected: {
    color: theme.colors.primary[700],
  },
  optionDesc: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.tertiary,
    marginTop: 2,
  },
  optionDescSelected: {
    color: theme.colors.primary[600],
  },
  optionCheck: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Club selection (Step 5)
  clubCountBadge: {
    backgroundColor: theme.colors.neutral.gray[100],
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.xs,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  clubCountText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  clubCountFull: {
    color: theme.colors.semantic.warning,
  },
  clubCategory: {
    marginBottom: theme.spacing.lg,
  },
  clubCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  clubCategoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.sm,
  },
  clubCategoryTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  clubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 1.5,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  clubChipSelected: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.primary[500],
  },
  clubChipDisabled: {
    opacity: 0.4,
  },
  clubChipText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  clubChipTextSelected: {
    color: theme.colors.primary[700],
  },
  clubChipTextDisabled: {
    color: theme.colors.text.tertiary,
  },

  // Custom wedge
  customWedgeSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  addCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  addCustomText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primary[500],
    marginLeft: 4,
  },
  customWedgeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customWedgeInput: {
    fontFamily: theme.fonts.regular,
    width: 90,
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  customWedgeAdd: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  customWedgeCancel: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.neutral.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Distance step (5b)
  calculatingContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing['4xl'],
  },
  calculatingText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    color: theme.colors.text.primary,
    marginTop: theme.spacing.lg,
  },
  calculatingSubtext: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing.sm,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.gray[100],
  },
  distanceClubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  distanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
  },
  distanceClubName: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  distanceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceInput: {
    fontFamily: theme.fonts.semibold,
    width: 65,
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 1,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  distanceUnit: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.text.tertiary,
    marginLeft: 6,
    width: 24,
  },

  // Goal (Step 6)
  goalInputContainer: {
    alignItems: 'center',
    marginVertical: theme.spacing['2xl'],
  },
  goalInput: {
    fontFamily: theme.fonts.bold,
    width: 140,
    backgroundColor: theme.colors.neutral.gray[50],
    borderWidth: 2,
    borderColor: theme.colors.neutral.gray[200],
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    fontSize: 36,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },

  // Buttons
  primaryButton: {
    marginTop: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  buttonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonGradient: {
    paddingVertical: theme.spacing.base,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: '#fff',
  },
  buttonTextDisabled: {
    color: theme.colors.text.tertiary,
  },
});
