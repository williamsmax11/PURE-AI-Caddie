import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';

// Prevent auto-hide of splash screen until fonts are loaded
SplashScreen.preventAutoHideAsync();
import OnboardingScreen from './OnboardingScreen';
import SelectCourseScreen from './screens/SelectCourseScreen';
import CourseOverviewScreen from './screens/CourseOverviewScreen';
import TeeSelectionScreen from './screens/TeeSelectionScreen';
import GamePlanScreen from './screens/GamePlanScreen';
import RoundStartTransition from './screens/RoundStartTransition';
import HoleViewScreen from './screens/HoleViewSatellite';
import MyBagScreen from './screens/MyBagScreen';
import SettingsScreen from './screens/SettingsScreen';
import AuthScreen from './screens/AuthScreen';
import PostRoundSummary from './screens/PostRoundSummary';
import RoundHistoryScreen from './screens/RoundHistoryScreen';
import RoundDetailScreen from './screens/RoundDetailScreen';
import HomeScreen from './screens/HomeScreen';
import PlayerInsightsScreen from './screens/PlayerInsightsScreen';
import { fetchTeeBoxes } from './services/courseService';
import { getSession, getProfile, signOut, onAuthStateChange } from './services/authService';
import { fetchInProgressRound, fetchRoundDetail, submitCompleteRound } from './services/roundService';
import { fetchCourseById } from './services/courseService';
import { computeAndSaveAnalytics } from './services/shotAnalyticsService';
import { recalculateHandicap, logOnboardingHandicap } from './services/handicapService';
import {
  initCachedRound,
  saveHoleToCache,
  updateCurrentHole,
  getCacheDataForSubmission,
  clearRoundCache,
  getResumeInfo,
} from './services/roundCacheService';
import { BottomTabBar } from './components';
import { TrainingProvider } from './components/TrainingProvider';
import theme from './theme';

// Screens that should show the bottom tab bar
const TAB_VISIBLE_SCREENS = ['home', 'myBag', 'roundHistory', 'playerInsights', 'settings'];

function App() {
  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('home'); // 'home', 'selectCourse', 'courseOverview', 'teeSelection', 'gamePlan', 'roundTransition', 'holeView'
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTee, setSelectedTee] = useState(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [roundScores, setRoundScores] = useState([]);
  const [roundShots, setRoundShots] = useState([]);
  const [activeRoundId, setActiveRoundId] = useState(null);
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const [inProgressRound, setInProgressRound] = useState(null);

  useEffect(() => {
    initializeApp();

    const subscription = onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserProfile(null);
        setHasCompletedOnboarding(false);
        setCurrentScreen('home');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Check for existing Supabase session
      const { session: existingSession } = await getSession();

      if (existingSession) {
        setSession(existingSession);

        // Fetch profile from DB
        const { data: profile, error: profileError } = await getProfile(existingSession.user.id);

        if (profile) {
          setUserProfile(profile);
          setHasCompletedOnboarding(profile.onboarding_completed || false);

          // Sync DB profile to AsyncStorage for offline/fast access
          await AsyncStorage.setItem('userProfile', JSON.stringify({
            name: profile.name,
            handicap: profile.handicap,
            typicalScore: profile.typical_score,
            driverDistance: profile.driver_distance,
            missPattern: profile.miss_pattern,
            distanceControl: profile.distance_control,
            targetScore: profile.target_score,
            onboardingCompleted: profile.onboarding_completed,
            responseDepth: profile.response_depth,
          }));
        } else {
          // Profile not in DB yet — check AsyncStorage
          if (profileError) {
            console.warn('Could not fetch profile from DB:', profileError.message);
          }
          const userProfileData = await AsyncStorage.getItem('userProfile');
          if (userProfileData) {
            const cached = JSON.parse(userProfileData);
            setUserProfile(cached);
            setHasCompletedOnboarding(cached.onboardingCompleted || false);
          }
        }

        // Check for cached round first (local storage), then DB
        try {
          const cachedResumeInfo = await getResumeInfo();
          if (cachedResumeInfo) {
            console.log('Found cached round to resume:', cachedResumeInfo.tempId);
            setInProgressRound({
              ...cachedResumeInfo,
              isFromCache: true, // Flag to indicate this is from local cache
            });
          } else {
            // No cached round - check DB for in-progress round
            const { data: inProgress, error: inProgressError } = await fetchInProgressRound(existingSession.user.id);
            if (inProgressError) {
              console.warn('Error checking for in-progress round:', inProgressError);
            } else if (inProgress) {
              console.log('Found in-progress round in DB:', inProgress.id);
              setInProgressRound(inProgress);
            }
          }
        } catch (e) {
          console.warn('Failed to check for in-progress round:', e);
        }
      } else {
        // No session — still check AsyncStorage for offline profile
        const userProfileData = await AsyncStorage.getItem('userProfile');
        if (userProfileData) {
          const cached = JSON.parse(userProfileData);
          setUserProfile(cached);
          setHasCompletedOnboarding(cached.onboardingCompleted || false);
        }
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      // Fallback: try loading from AsyncStorage
      try {
        const userProfileData = await AsyncStorage.getItem('userProfile');
        if (userProfileData) {
          const profile = JSON.parse(userProfileData);
          setUserProfile(profile);
          setHasCompletedOnboarding(profile.onboardingCompleted || false);
        }
      } catch (e) {
        console.error('Error loading from AsyncStorage:', e);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async (newSession) => {
    setSession(newSession);
    const { data: profile, error } = await getProfile(newSession.user.id);

    if (error) {
      console.error('Failed to fetch profile on auth:', error.message);
      // Fallback to AsyncStorage
      const cached = await AsyncStorage.getItem('userProfile');
      if (cached) {
        const parsedProfile = JSON.parse(cached);
        setUserProfile(parsedProfile);
        setHasCompletedOnboarding(parsedProfile.onboardingCompleted || false);
      }
      return;
    }

    if (profile) {
      console.log('Profile loaded on auth:', profile.onboarding_completed);
      setUserProfile(profile);
      setHasCompletedOnboarding(profile.onboarding_completed || false);

      // Sync to AsyncStorage for offline access
      await AsyncStorage.setItem('userProfile', JSON.stringify({
        name: profile.name,
        handicap: profile.handicap,
        typicalScore: profile.typical_score,
        driverDistance: profile.driver_distance,
        missPattern: profile.miss_pattern,
        distanceControl: profile.distance_control,
        targetScore: profile.target_score,
        onboardingCompleted: profile.onboarding_completed,
        responseDepth: profile.response_depth,
      }));
    }
  };

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
    if (session?.user?.id) {
      getProfile(session.user.id).then(({ data }) => {
        if (data) {
          setUserProfile(data);
          // Log the onboarding estimate as the first handicap_history entry
          if (data.handicap) {
            logOnboardingHandicap(session.user.id, parseFloat(data.handicap));
          }
        }
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    await AsyncStorage.removeItem('userProfile');
    setSession(null);
    setUserProfile(null);
    setHasCompletedOnboarding(false);
    setCurrentScreen('home');
  };

  const handleStartRound = () => {
    setCurrentScreen('selectCourse');
  };

  const handleResumeRound = async () => {
    if (!inProgressRound) return;

    try {
      // Check if resuming from local cache or DB
      if (inProgressRound.isFromCache) {
        // Resume from local cache - data already in inProgressRound
        console.log('Resuming from local cache');

        // Fetch full course data
        const { data: course } = await fetchCourseById(inProgressRound.course.id);
        if (!course) {
          console.error('Could not load course for resume');
          return;
        }

        // Set state and navigate to hole view
        setSelectedCourse(course);
        setSelectedTee(inProgressRound.tee);
        setActiveRoundId(null); // No DB round ID yet
        setCurrentHole(inProgressRound.currentHole);
        setRoundScores(inProgressRound.holes || []);
        setInProgressRound(null);
        setCurrentScreen('holeView');
        return;
      }

      // Resume from DB (legacy path)
      // Fetch full round details including holes played
      const { data: roundData } = await fetchRoundDetail(inProgressRound.id);

      // Fetch the course
      const { data: course } = await fetchCourseById(inProgressRound.course_id);

      if (!course) {
        console.error('Could not load course for resume');
        return;
      }

      // Reconstruct tee data from round snapshot
      const tee = {
        id: inProgressRound.tee_box_id,
        color: inProgressRound.tee_color || 'White',
        name: inProgressRound.tee_color || 'White',
        yardage: inProgressRound.tee_yardage || 0,
        rating: inProgressRound.tee_rating || 72,
        slope: inProgressRound.tee_slope || 113,
      };

      // Determine which hole to resume from
      const holesPlayed = roundData?.holes?.length || 0;
      const resumeHole = Math.min(holesPlayed + 1, 18);

      // Reconstruct round scores from saved holes
      const scores = (roundData?.holes || []).map(h => ({
        hole: h.hole_number,
        score: h.score,
        putts: h.putts,
        fairwayHit: h.fairway_hit,
        girHit: h.gir,
        penalties: h.penalties || 0,
      }));

      // Set state and navigate to hole view
      setSelectedCourse(course);
      setSelectedTee(tee);
      setActiveRoundId(inProgressRound.id);
      setCurrentHole(resumeHole);
      setRoundScores(scores);
      setInProgressRound(null); // Clear the in-progress indicator
      setCurrentScreen('holeView');
    } catch (error) {
      console.error('Error resuming round:', error);
    }
  };

  const handleSelectRound = (roundId) => {
    setSelectedRoundId(roundId);
    setCurrentScreen('roundDetail');
  };

  const handleBackFromRoundDetail = () => {
    setSelectedRoundId(null);
    setCurrentScreen('roundHistory');
  };

  const handleBackToHome = () => {
    setCurrentScreen('home');
    setSelectedCourse(null);
  };

  const handleBackToCourseSelection = () => {
    setCurrentScreen('selectCourse');
    setSelectedCourse(null);
  };

  const handleBackToCourseOverview = () => {
    setCurrentScreen('courseOverview');
    setSelectedTee(null);
  };

  const handleBackToTeeSelection = () => {
    setCurrentScreen('teeSelection');
  };

  const handleSelectCourse = (course) => {
    setSelectedCourse(course);
    setCurrentScreen('courseOverview');
  };

  const handleStartRoundFromOverview = () => {
    setCurrentScreen('teeSelection');
  };

  const handleViewCourseMap = () => {
    // TODO: Navigate to course map view
    console.log('Viewing course map for:', selectedCourse?.name);
  };

  const handleSelectTee = (tee) => {
    setSelectedTee(tee);
    setCurrentScreen('gamePlan');
  };

  const handleStartRoundFromGamePlan = async () => {
    setCurrentHole(1);
    setRoundScores([]);

    // Initialize cached round locally (no DB call yet)
    if (session?.user?.id && selectedCourse && selectedTee) {
      const tempId = `round_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      await initCachedRound({
        tempId,
        userId: session.user.id,
        course: selectedCourse,
        tee: selectedTee,
        weather: { temp_f: 72, wind_mph: 5, condition: 'sunny' },
      });
      // No activeRoundId yet - will be created on submission
      setActiveRoundId(null);
    }

    setCurrentScreen('roundTransition');
  };

  const handleQuickPlay = async () => {
    let teeForRound = selectedTee;
    // Set default tee if none selected yet
    if (!selectedTee && selectedCourse) {
      // Try to fetch real tee data from DB
      const { data: tees } = await fetchTeeBoxes(selectedCourse.id);
      if (tees && tees.length > 0) {
        // Pick the "men's" or second tee as default
        const defaultTee = tees.find(t =>
          t.type?.toLowerCase().includes("men") ||
          t.type?.toLowerCase() === "regular"
        ) || tees[1] || tees[0];
        teeForRound = {
          id: defaultTee.id,
          name: `${defaultTee.color} Tees`,
          color: defaultTee.color,
          label: defaultTee.type || '',
          yardage: defaultTee.yardage,
          rating: defaultTee.rating,
          slope: defaultTee.slope,
        };
        setSelectedTee(teeForRound);
      } else {
        // Fallback for courses without Golfbert tee data
        teeForRound = {
          id: null,
          name: 'Blue Tees',
          color: 'Blue',
          label: 'Regular',
          yardage: 6325,
          rating: 72.8,
          slope: 140,
        };
        setSelectedTee(teeForRound);
      }
    }
    setCurrentHole(1);
    setRoundScores([]);

    // Initialize cached round locally (no DB call yet)
    if (session?.user?.id && selectedCourse && teeForRound) {
      const tempId = `round_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      await initCachedRound({
        tempId,
        userId: session.user.id,
        course: selectedCourse,
        tee: teeForRound,
        weather: { temp_f: 72, wind_mph: 5, condition: 'sunny' },
      });
      // No activeRoundId yet - will be created on submission
      setActiveRoundId(null);
    }

    setCurrentScreen('holeView');
  };

  const handleTransitionComplete = () => {
    setCurrentScreen('holeView');
  };

  const handleNextHole = async (holeData) => {
    setRoundScores([...roundScores, { hole: currentHole, ...holeData }]);

    // Save to local cache (no DB call during play)
    try {
      await saveHoleToCache(currentHole, holeData);
    } catch (err) {
      console.warn('Failed to save hole to cache:', err);
    }

    setCurrentHole(currentHole + 1);
  };

  const handlePauseRound = async () => {
    // Pause the round - data is already in cache, just update current hole
    try {
      await updateCurrentHole(currentHole);
      // Get resume info from cache to show Resume button
      const resumeInfo = await getResumeInfo();
      if (resumeInfo) {
        setInProgressRound({
          ...resumeInfo,
          isFromCache: true,
        });
      }
    } catch (err) {
      console.warn('Failed to update cache on pause:', err);
    }

    // Go back to home without ending the round
    setCurrentScreen('home');
  };

  const handleEndRound = async (finalHoleData) => {
    const updatedScores = finalHoleData
      ? [...roundScores, { hole: currentHole, ...finalHoleData }]
      : [...roundScores];

    if (finalHoleData) {
      setRoundScores(updatedScores);

      // Save final hole to cache
      try {
        await saveHoleToCache(currentHole, finalHoleData);
      } catch (err) {
        console.warn('Failed to save final hole to cache:', err);
      }
    }

    // Get all cached data and batch submit to Supabase
    try {
      const cacheData = await getCacheDataForSubmission();
      if (cacheData) {
        const { data: dbRound, error } = await submitCompleteRound(
          cacheData.round,
          cacheData.holes,
          cacheData.shots
        );

        // Save shots for post-round summary before cache is cleared
        setRoundShots(cacheData.shots || []);

        if (error) {
          console.error('Error submitting round to database:', error);
          // Round data is still in cache, user can retry later
        } else {
          console.log('Round submitted successfully:', dbRound?.id);
          // Clear the cache after successful submission
          await clearRoundCache();

          // Trigger analytics computation in background (non-blocking)
          if (session?.user?.id) {
            computeAndSaveAnalytics(session.user.id).catch(err =>
              console.warn('Background analytics computation failed:', err)
            );

            // Recalculate handicap in background (non-blocking)
            recalculateHandicap(session.user.id).then(result => {
              if (result.data?.handicap != null) {
                setUserProfile(prev => prev ? { ...prev, handicap: String(result.data.handicap) } : prev);
              }
            }).catch(err =>
              console.warn('Background handicap recalculation failed:', err)
            );
          }
        }
      }
    } catch (err) {
      console.error('Error during round submission:', err);
      // Keep cache intact for retry
    }

    // Clear in-progress state since round is now complete
    setInProgressRound(null);

    // Navigate to post-round summary
    setCurrentScreen('postRoundSummary');
  };

  const handleDoneFromSummary = () => {
    setCurrentScreen('home');
    setSelectedCourse(null);
    setSelectedTee(null);
    setCurrentHole(1);
    setRoundScores([]);
    setActiveRoundId(null);
    setInProgressRound(null); // Clear in-progress indicator
  };

  // Hide splash screen once fonts are loaded and app is initialized
  useEffect(() => {
    if (fontsLoaded && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLoading]);

  if (isLoading || !fontsLoaded) {
    return (
      <LinearGradient
        colors={theme.gradients.fairway.colors}
        start={theme.gradients.fairway.start}
        end={theme.gradients.fairway.end}
        style={styles.loadingContainer}
      >
        <Image
          source={require('./assets/Pure_Logo.png')}
          style={styles.loadingLogo}
        />
        {fontsLoaded ? (
          <Text style={styles.loadingTitle}>PURE</Text>
        ) : (
          <Text style={styles.loadingTitleFallback}>PURE</Text>
        )}
        <Text style={styles.loadingTagline}>AI Caddie</Text>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginTop: 32 }} />
      </LinearGradient>
    );
  }

  // No session — show auth screen
  if (!session) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Onboarding — single unified wizard
  if (!hasCompletedOnboarding) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} userId={session.user.id} />;
  }

  // Show Round Detail Screen
  if (currentScreen === 'roundDetail' && selectedRoundId) {
    return (
      <RoundDetailScreen
        roundId={selectedRoundId}
        onBack={handleBackFromRoundDetail}
      />
    );
  }

  // Show Select Course Screen
  if (currentScreen === 'selectCourse') {
    return (
      <SelectCourseScreen
        onBack={handleBackToHome}
        onSelectCourse={handleSelectCourse}
        userProfile={userProfile}
      />
    );
  }

  // Show Course Overview Screen
  if (currentScreen === 'courseOverview' && selectedCourse) {
    return (
      <CourseOverviewScreen
        course={selectedCourse}
        userId={session?.user?.id}
        onBack={handleBackToCourseSelection}
        onStartRound={handleStartRoundFromOverview}
        onViewMap={handleViewCourseMap}
        onQuickPlay={handleQuickPlay}
      />
    );
  }

  // Show Tee Selection Screen
  if (currentScreen === 'teeSelection' && selectedCourse) {
    return (
      <TeeSelectionScreen
        course={selectedCourse}
        userProfile={userProfile}
        onBack={handleBackToCourseOverview}
        onSelectTee={handleSelectTee}
        onQuickPlay={handleQuickPlay}
      />
    );
  }

  // Show Game Plan Screen
  if (currentScreen === 'gamePlan' && selectedCourse && selectedTee) {
    return (
      <GamePlanScreen
        course={selectedCourse}
        selectedTee={selectedTee}
        userId={session?.user?.id}
        userProfile={userProfile}
        onBack={handleBackToTeeSelection}
        onStartRound={handleStartRoundFromGamePlan}
        onQuickPlay={handleQuickPlay}
      />
    );
  }

  // Show Round Start Transition
  if (currentScreen === 'roundTransition') {
    return (
      <RoundStartTransition onTransitionComplete={handleTransitionComplete} />
    );
  }

  // Show Hole View Screen
  if (currentScreen === 'holeView' && selectedCourse && selectedTee) {
    return (
      <HoleViewScreen
        course={selectedCourse}
        selectedTee={selectedTee}
        currentHole={currentHole}
        roundId={activeRoundId}
        resumeScores={roundScores}
        onNextHole={handleNextHole}
        onEndRound={handleEndRound}
        onPauseRound={handlePauseRound}
      />
    );
  }

  // Show Post-Round Summary
  if (currentScreen === 'postRoundSummary' && selectedCourse) {
    return (
      <PostRoundSummary
        course={selectedCourse}
        selectedTee={selectedTee}
        roundScores={roundScores}
        roundShots={roundShots}
        onDone={handleDoneFromSummary}
      />
    );
  }

  // Determine if tab bar should be shown
  const showTabBar = TAB_VISIBLE_SCREENS.includes(currentScreen);

  // Render screen content based on currentScreen
  const renderScreenContent = () => {
    switch (currentScreen) {
      case 'myBag':
        return (
          <MyBagScreen
            userId={session?.user?.id}
            onBack={() => setCurrentScreen('home')}
          />
        );
      case 'roundHistory':
        return (
          <RoundHistoryScreen
            userId={session?.user?.id}
            onBack={() => setCurrentScreen('home')}
            onSelectRound={handleSelectRound}
          />
        );
      case 'playerInsights':
        return (
          <PlayerInsightsScreen
            userId={session?.user?.id}
            onBack={() => setCurrentScreen('home')}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            userProfile={userProfile}
            session={session}
            onBack={() => setCurrentScreen('home')}
            onSignOut={handleSignOut}
            onProfileUpdate={(updatedProfile) => setUserProfile(updatedProfile)}
          />
        );
      case 'home':
      default:
        return (
          <HomeScreen
            userProfile={userProfile}
            userId={session?.user?.id}
            inProgressRound={inProgressRound}
            onStartRound={handleStartRound}
            onResumeRound={handleResumeRound}
            onOpenRoundHistory={() => setCurrentScreen('roundHistory')}
          />
        );
    }
  };

  // All tab screens handle their own safe area via useSafeAreaInsets()
  const Container = View;

  return (
    <Container style={styles.container}>
      <StatusBar style={currentScreen === 'home' ? 'light' : 'dark'} />
      <View style={styles.mainContent}>
        {renderScreenContent()}
      </View>
      {showTabBar && (
        <BottomTabBar
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
        />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  loadingTitle: {
    fontFamily: theme.fonts.light,
    fontSize: 32,
    color: '#fff',
    letterSpacing: 4,
    marginTop: 4,
  },
  loadingTitleFallback: {
    fontSize: 32,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 4,
    marginTop: 4,
  },
  loadingTagline: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginTop: 6,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.light,
  },
  mainContent: {
    flex: 1,
  },
});

// Wrap App with SafeAreaProvider and TrainingProvider for safe area + training context
export default function AppWithProvider() {
  return (
    <SafeAreaProvider>
      <TrainingProvider>
        <App />
      </TrainingProvider>
    </SafeAreaProvider>
  );
}
