import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Dimensions,
  Platform,
  Image,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { fetchCoursesPaginated, fetchNearbyCourses, searchCourses } from '../services/courseService';
import { searchNearbyGolfbertCourses, importGolfbertCourse } from '../services/golfbertService';

const { width } = Dimensions.get('window');
const PAGE_SIZE = 10;

// Course background images to cycle through
const COURSE_BACKGROUNDS = [
  require('../assets/course_background1.jpg'),
  require('../assets/course_background2.jpg'),
  require('../assets/course_background3.jpg'),
  require('../assets/course_background4.jpg'),
];

/**
 * Get a consistent background image for a course based on its ID
 */
function getCourseBackground(courseId) {
  if (!courseId) return COURSE_BACKGROUNDS[0];
  // Simple hash based on course ID to get consistent image
  let hash = 0;
  for (let i = 0; i < courseId.length; i++) {
    hash = ((hash << 5) - hash) + courseId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % COURSE_BACKGROUNDS.length;
  return COURSE_BACKGROUNDS[index];
}

/**
 * Calculate distance between two coordinates in miles (Haversine formula)
 */
function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;

  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function SelectCourseScreen({ onBack, onSelectCourse, userProfile }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [nearbyCourses, setNearbyCourses] = useState([]);
  const [golfbertCourses, setGolfbertCourses] = useState([]);
  const [showNearby, setShowNearby] = useState(false);
  const [importingId, setImportingId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef(null);
  const searchInputRef = useRef(null);

  // User location state
  const [userLocation, setUserLocation] = useState(null);
  const [userLocationInfo, setUserLocationInfo] = useState(null); // city, state, zip

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreCourses, setHasMoreCourses] = useState(true);
  const [totalCourses, setTotalCourses] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    loadInitialCourses();
  }, []);

  const loadInitialCourses = async () => {
    setIsLoading(true);
    setLoadError(null);
    setCurrentPage(0);

    const { data, hasMore, total, error } = await fetchCoursesPaginated(0, PAGE_SIZE);

    if (error) {
      setLoadError(error);
    } else {
      setCourses(data);
      setHasMoreCourses(hasMore);
      setTotalCourses(total);
    }
    setIsLoading(false);
  };

  const loadMoreCourses = async () => {
    if (isLoadingMore || !hasMoreCourses) return;

    setIsLoadingMore(true);
    const nextPage = currentPage + 1;

    const { data, hasMore, error } = await fetchCoursesPaginated(nextPage, PAGE_SIZE);

    if (!error && data.length > 0) {
      // Add distance to new courses if we have user location
      const coursesWithDistance = userLocation
        ? data.map(course => ({
            ...course,
            distance: calculateDistanceMiles(
              userLocation.latitude,
              userLocation.longitude,
              course.latitude,
              course.longitude
            )
          }))
        : data;

      setCourses(prev => [...prev, ...coursesWithDistance]);
      setCurrentPage(nextPage);
      setHasMoreCourses(hasMore);
    }

    setIsLoadingMore(false);
  };

  // Debounced server-side search
  const performSearch = useCallback(async (query) => {
    if (query.trim().length === 0) {
      setShowSearchResults(false);
      setFilteredCourses([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);

    const { data, error } = await searchCourses(query);

    if (!error && data) {
      // Add distance if we have user location
      const resultsWithDistance = userLocation
        ? data.map(course => ({
            ...course,
            distance: calculateDistanceMiles(
              userLocation.latitude,
              userLocation.longitude,
              course.latitude,
              course.longitude
            )
          }))
        : data;
      setFilteredCourses(resultsWithDistance);
    }
    setIsSearching(false);
  }, [userLocation]);

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (searchQuery.trim().length === 0) {
      setShowSearchResults(false);
      setFilteredCourses([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);

    searchTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  const handleUseCurrentLocation = async () => {
    setIsLoadingLocation(true);
    setShowNearby(false);
    setNearbyCourses([]);
    setGolfbertCourses([]);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed to find nearby courses.');
        setIsLoadingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;

      // Store user location
      setUserLocation({ latitude, longitude });

      // Reverse geocode to get city, state, zip
      try {
        const [geoResult] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geoResult) {
          setUserLocationInfo({
            city: geoResult.city,
            state: geoResult.region,
            zip: geoResult.postalCode,
          });
        }
      } catch (geoError) {
        console.warn('Reverse geocoding failed:', geoError);
      }

      const [localResult, golfbertResult] = await Promise.all([
        fetchNearbyCourses(latitude, longitude),
        searchNearbyGolfbertCourses(latitude, longitude),
      ]);

      // Add distance to nearby courses
      const nearbyWithDistance = (localResult.data || []).map(course => ({
        ...course,
        distance: calculateDistanceMiles(latitude, longitude, course.latitude, course.longitude)
      })).sort((a, b) => (a.distance || 999) - (b.distance || 999));

      setNearbyCourses(nearbyWithDistance);

      // Update all courses with distance as well
      setCourses(prev => prev.map(course => ({
        ...course,
        distance: calculateDistanceMiles(latitude, longitude, course.latitude, course.longitude)
      })).sort((a, b) => (a.distance || 999) - (b.distance || 999)));

      const golfbertNotImported = (golfbertResult.data || []).filter(
        (gc) => !gc.already_imported
      );
      setGolfbertCourses(golfbertNotImported);
      setShowNearby(true);
    } catch (err) {
      console.error('Location error:', err);
      Alert.alert('Location Error', 'Could not determine your location. Please try again.');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleClearLocation = () => {
    setUserLocation(null);
    setUserLocationInfo(null);
    setShowNearby(false);
    setNearbyCourses([]);
    setGolfbertCourses([]);
    // Reload courses without distance sorting
    loadInitialCourses();
  };

  const handleImportCourse = async (golfbertCourse) => {
    setImportingId(golfbertCourse.golfbert_id);
    try {
      const { data, error } = await importGolfbertCourse(
        golfbertCourse.golfbert_id,
        {
          name: golfbertCourse.name,
          address: golfbertCourse.address,
          coordinates: golfbertCourse.coordinates,
          phonenumber: golfbertCourse.phone,
        }
      );

      if (error) {
        Alert.alert('Import Failed', error);
        return;
      }

      // Reload courses
      await loadInitialCourses();

      setGolfbertCourses((prev) =>
        prev.filter((c) => c.golfbert_id !== golfbertCourse.golfbert_id)
      );
    } catch (err) {
      console.error('Import error:', err);
      Alert.alert('Import Error', 'Something went wrong importing the course.');
    } finally {
      setImportingId(null);
    }
  };

  const handleSelectCourse = (course) => {
    console.log('Selected course:', course);
    onSelectCourse(course);
  };

  const getCoursePlaceholderColor = (index) => {
    const colors = ['#1a472a', '#2d5a3d', '#3d6b4f', '#234d32', '#1e5631'];
    return colors[index % colors.length];
  };

  const formatDistance = (distance) => {
    if (distance === null || distance === undefined) return null;
    if (distance < 0.1) return '< 0.1 mi';
    if (distance < 10) return `${distance.toFixed(1)} mi`;
    return `${Math.round(distance)} mi`;
  };

  const getPredictedScore = (course) => {
    const handicap = parseFloat(userProfile?.handicap);
    if (isNaN(handicap) || !course.rating || !course.slope) return null;
    return Math.round(course.rating + (handicap * course.slope / 113));
  };

  const renderCourseCard = (course, index) => {
    const distanceText = formatDistance(course.distance);
    const predictedScore = getPredictedScore(course);

    return (
      <TouchableOpacity
        key={course.id}
        style={styles.courseCard}
        onPress={() => handleSelectCourse(course)}
        activeOpacity={0.85}
      >
        {/* Full-bleed background image */}
        <Image
          source={getCourseBackground(course.id)}
          style={styles.courseImage}
          resizeMode="cover"
        />

        {/* Gradient overlay for text readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.75)']}
          locations={[0, 0.4, 1]}
          style={styles.cardGradient}
        />

        {/* Top badges */}
        <View style={styles.cardTopRow}>
          {distanceText ? (
            <View style={styles.glassBadge}>
              <Text style={styles.glassBadgeText}>{distanceText}</Text>
            </View>
          ) : <View />}
          <View style={styles.glassBadge}>
            <Text style={styles.glassBadgeText}>
              {course.num_holes ? `${course.num_holes} Holes` : 'Golf Course'}
            </Text>
          </View>
        </View>

        {/* Bottom content */}
        <View style={styles.cardBottomContent}>
          <Text style={styles.cardCourseName} numberOfLines={1}>{course.name}</Text>
          <View style={styles.cardLocationRow}>
            <Ionicons name="location-sharp" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={styles.cardLocationText} numberOfLines={1}>
              {course.location || 'Location unavailable'}
            </Text>
          </View>

          {/* Predicted score */}
          {predictedScore !== null && (
            <View style={styles.predictedRow}>
              <Ionicons name="flag" size={12} color="rgba(52,199,89,0.9)" />
              <Text style={styles.predictedLabel}>Predicted Score</Text>
              <Text style={styles.predictedValue}>{predictedScore}</Text>
            </View>
          )}

          {/* Stats glass bar */}
          <View style={styles.statsGlassBar}>
            <View style={styles.statsGlassItem}>
              <Text style={styles.statsGlassValue}>{course.rating || '—'}</Text>
              <Text style={styles.statsGlassLabel}>Rating</Text>
            </View>
            <View style={styles.statsGlassDivider} />
            <View style={styles.statsGlassItem}>
              <Text style={styles.statsGlassValue}>{course.slope || '—'}</Text>
              <Text style={styles.statsGlassLabel}>Slope</Text>
            </View>
            <View style={styles.statsGlassDivider} />
            <View style={styles.statsGlassItem}>
              <Text style={styles.statsGlassValue}>{course.yardage ? course.yardage.toLocaleString() : '—'}</Text>
              <Text style={styles.statsGlassLabel}>Yards</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGolfbertCard = (gc) => {
    return (
      <View key={gc.golfbert_id} style={styles.courseCard}>
        {/* Solid dark background instead of image */}
        <LinearGradient
          colors={['#3a4a5c', '#2c3a48']}
          style={styles.courseImage}
        />
        <View style={styles.golfbertIconOverlay}>
          <Text style={styles.golfbertIcon}>🏌️</Text>
        </View>

        {/* Top badge */}
        <View style={styles.cardTopRow}>
          <View />
          <View style={[styles.glassBadge, { backgroundColor: 'rgba(0,122,255,0.6)' }]}>
            <Text style={styles.glassBadgeText}>Available</Text>
          </View>
        </View>

        {/* Bottom content */}
        <View style={styles.cardBottomContent}>
          <Text style={styles.cardCourseName} numberOfLines={1}>{gc.name}</Text>
          <View style={styles.cardLocationRow}>
            <Ionicons name="location-sharp" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={styles.cardLocationText} numberOfLines={1}>
              {[gc.address?.city, gc.address?.state].filter(Boolean).join(', ')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.importButton}
            onPress={() => handleImportCourse(gc)}
            disabled={importingId === gc.golfbert_id}
            activeOpacity={0.8}
          >
            {importingId === gc.golfbert_id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.importButtonText}>Add Course</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderLoadMoreButton = () => {
    if (!hasMoreCourses || showSearchResults || showNearby) return null;

    return (
      <TouchableOpacity
        style={styles.loadMoreButton}
        onPress={loadMoreCourses}
        disabled={isLoadingMore}
        activeOpacity={0.7}
      >
        {isLoadingMore ? (
          <ActivityIndicator size="small" color="#007aff" />
        ) : (
          <Text style={styles.loadMoreButtonText}>Load More Courses</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* iOS-Style Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backButtonIcon}>‹</Text>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Course</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Hero Row — course count + location button (pinned above scroll) */}
      <View style={styles.heroSection}>
        <Text style={styles.heroSubtitle}>
          {totalCourses > 0
            ? `${totalCourses} course${totalCourses !== 1 ? 's' : ''} in database`
            : 'Search or find courses near you'}
        </Text>

        {userLocation ? (
          <TouchableOpacity
            style={styles.locationActiveBtn}
            onPress={handleClearLocation}
            activeOpacity={0.7}
          >
            <Ionicons name="location" size={16} color="#007aff" />
            <Text style={styles.locationActiveBtnText} numberOfLines={1}>
              {userLocationInfo
                ? [userLocationInfo.city, userLocationInfo.state].filter(Boolean).join(', ')
                : 'Near you'}
            </Text>
            <Ionicons name="close-circle" size={14} color="#8e8e93" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={handleUseCurrentLocation}
            disabled={isLoadingLocation}
            activeOpacity={0.7}
          >
            {isLoadingLocation ? (
              <ActivityIndicator size="small" color="#007aff" />
            ) : (
              <Ionicons name="location-outline" size={20} color="#007aff" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar - pinned above scroll */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#8e8e93" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search courses, cities..."
            placeholderTextColor="#8e8e93"
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={18} color="#8e8e93" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007aff" />
            <Text style={styles.loadingText}>Finding courses...</Text>
          </View>
        )}

        {/* Error State */}
        {!isLoading && loadError && (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
            </View>
            <Text style={styles.errorTitle}>Unable to load courses</Text>
            <Text style={styles.errorMessage}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadInitialCourses}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search Results */}
        {!isLoading && !loadError && showSearchResults && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Search Results</Text>
              {!isSearching && (
                <Text style={styles.sectionCount}>{filteredCourses.length} found</Text>
              )}
            </View>
            {isSearching ? (
              <View style={styles.searchingContainer}>
                <ActivityIndicator size="small" color="#007aff" />
                <Text style={styles.searchingText}>Searching...</Text>
              </View>
            ) : filteredCourses.length > 0 ? (
              filteredCourses.map((course, index) => renderCourseCard(course, index))
            ) : (
              <View style={styles.emptySearchCard}>
                <Text style={styles.emptySearchIcon}>🔍</Text>
                <Text style={styles.emptySearchTitle}>No courses found</Text>
                <Text style={styles.emptySearchSubtitle}>Try a different search term or use your location</Text>
              </View>
            )}
          </View>
        )}

        {/* Nearby Courses */}
        {!isLoading && !loadError && showNearby && nearbyCourses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nearby Courses</Text>
              <View style={styles.nearbyBadge}>
                <Text style={styles.nearbyBadgeText}>📍 Near You</Text>
              </View>
            </View>
            {nearbyCourses.map((course, index) => renderCourseCard(course, index))}
          </View>
        )}

        {/* Golfbert Courses */}
        {!isLoading && !loadError && showNearby && golfbertCourses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More Courses</Text>
              <Text style={styles.sectionSubtitle}>Tap to add</Text>
            </View>
            {golfbertCourses.map(gc => renderGolfbertCard(gc))}
          </View>
        )}

        {/* All Courses - with pagination */}
        {!isLoading && !loadError && !showSearchResults && courses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {userLocation ? 'All Courses' : 'All Courses'}
              </Text>
              <Text style={styles.sectionCount}>
                {courses.length} of {totalCourses}
              </Text>
            </View>
            {courses.map((course, index) => renderCourseCard(course, index))}
            {renderLoadMoreButton()}
          </View>
        )}

        {/* Empty State */}
        {!isLoading && !loadError && !showSearchResults && courses.length === 0 && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Text style={styles.emptyStateIcon}>⛳</Text>
            </View>
            <Text style={styles.emptyStateTitle}>No Courses Yet</Text>
            <Text style={styles.emptyStateMessage}>
              Use your location to discover nearby courses
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={handleUseCurrentLocation}
              disabled={isLoadingLocation}
            >
              <Text style={styles.emptyStateButtonText}>Find Courses Near Me</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f2f2f7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c6c6c8',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
  },
  backButtonIcon: {
    fontSize: 32,
    color: '#007aff',
    marginRight: 2,
    marginTop: -2,
  },
  backButtonText: {
    fontSize: 17,
    color: '#007aff',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.4,
  },
  headerRight: {
    minWidth: 70,
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Hero Section (pinned above scroll)
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heroSubtitle: {
    fontSize: 17,
    color: '#8e8e93',
    letterSpacing: -0.4,
  },

  // Search
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#000',
    letterSpacing: -0.4,
    paddingVertical: 0,
  },

  // Location button (inactive — icon only)
  locationBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Location button (active — compact pill with city)
  locationActiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    maxWidth: 180,
  },
  locationActiveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007aff',
    marginLeft: 4,
    flexShrink: 1,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8e8e93',
  },
  sectionCount: {
    fontSize: 14,
    color: '#8e8e93',
  },
  nearbyBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nearbyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007aff',
  },

  // Course Card — full-image design
  courseCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 20,
    height: 240,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  courseImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cardTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  glassBadge: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  glassBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
  cardBottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  cardCourseName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLocationText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 4,
    letterSpacing: -0.1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  predictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  predictedLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 5,
    letterSpacing: 0.1,
  },
  predictedValue: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(52,199,89,0.95)',
    marginLeft: 6,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statsGlassBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    paddingVertical: 8,
  },
  statsGlassItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsGlassValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  statsGlassLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statsGlassDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  golfbertIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  golfbertIcon: {
    fontSize: 52,
    opacity: 0.25,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,199,89,0.85)',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  importButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Load More
  loadMoreButton: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  loadMoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007aff',
    letterSpacing: -0.3,
  },

  // Loading State
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 16,
    color: '#8e8e93',
    marginTop: 16,
    letterSpacing: -0.3,
  },

  // Error State
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 36,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  errorMessage: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#007aff',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },

  // Searching State
  searchingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingVertical: 32,
  },
  searchingText: {
    fontSize: 15,
    color: '#8e8e93',
    marginLeft: 10,
    letterSpacing: -0.3,
  },

  // Empty Search
  emptySearchCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptySearchIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptySearchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptySearchSubtitle: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateIcon: {
    fontSize: 48,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  emptyStateMessage: {
    fontSize: 16,
    color: '#8e8e93',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  emptyStateButton: {
    backgroundColor: '#007aff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
});
