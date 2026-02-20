/**
 * Training sequence definitions for Pure app onboarding
 *
 * Each sequence defines a contextual coach mark tutorial for a screen.
 *
 * Target types:
 *   type: 'none'     = full-screen dim with centered tooltip (welcome messages)
 *   type: 'region'   = spotlight at { top, left, width, height } in screen percentages (0-100)
 *                       Best for scroll content and flex layouts that scale with screen size.
 *   type: 'absolute' = spotlight using pixel offsets from screen edges
 *                       Mirrors how the actual UI elements are positioned in styles.
 *                       Supports: top, bottom, left, right, width, height (all in px)
 *                       safeTop: true  = adds device safe area top inset to 'top'
 *                       safeBottom: true = adds device safe area bottom inset to 'bottom'
 *                       Use left+width OR left+right (width calculated) OR right+width (left calculated)
 *                       Use top+height OR top+bottom (height calculated) OR bottom+height (top calculated)
 */

export const TRAINING_VERSION = '1.0.0';

export const TRAINING_SEQUENCES = {
  // ===== HOME SCREEN (first visit after onboarding wizard) =====
  // Layout: HeroSection (height: '30%') -> ScrollView (marginTop: -24) -> AI Tip -> Start Round -> Stat Rings
  // BottomTabBar: absolute bottom, ~78px tall on notched phones
  // Scroll content uses percentage positioning since it scales with screen size
  home_intro: {
    id: 'home_intro',
    screen: 'home',
    version: '1.0.0',
    steps: [
      {
        id: 'home_welcome',
        title: 'Welcome to Pure',
        description: 'This is your golf dashboard. You\'ll see your stats, AI tips, and quick access to start a round.',
        target: { type: 'none' },
        icon: 'golf-outline',
      },
      {
        // AI Tip card: first item in scroll content below 30% hero (with -24px overlap + 32px padding)
        id: 'home_ai_tip',
        title: 'AI Caddie Tips',
        description: 'Pure gives you personalized tips based on your recent play. Check this before each round for an edge.',
        target: {
          type: 'region',
          top: 32,
          left: 3,
          width: 96,
          height: 13,
        },
        icon: 'sparkles-outline',
      },
      {
        // Start New Round card: hero image card below AI tip in scroll content
        id: 'home_start_round',
        title: 'Start a Round',
        description: 'Tap here to select a course and start tracking your round with AI caddie advice.',
        target: {
          type: 'region',
          top: 49,
          left: 3,
          width: 94,
          height: 19,
        },
        icon: 'play-circle-outline',
      },
      {
        // Stat Rings section: below Start Round in scroll content
        id: 'home_stat_rings',
        title: 'Your Stats at a Glance',
        description: 'After you play rounds, your handicap, average score, and total rounds appear here as visual rings.',
        target: {
          type: 'region',
          top: 70,
          left: 3,
          width: 94,
          height: 18,
        },
        icon: 'stats-chart-outline',
      },
      {
        // Bottom tab bar: absolute bottom: 0, height ~78px (10 paddingTop + 34 content + 34 safe area)
        // Using absolute positioning so it works on all screen sizes
        id: 'home_tab_bar',
        title: 'Navigate the App',
        description: 'Use these tabs to access your Bag, Round History, Player Insights, and Settings. Explore at your own pace!',
        target: {
          type: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
        },
        icon: 'apps-outline',
      },
    ],
  },

  // ===== HOLE VIEW SATELLITE (first round - most complex screen) =====
  // Layout: Full-screen MapView with absolute-positioned overlays
  // Uses absolute pixel positioning to match actual style values
  //
  // Top overlay (SafeAreaView, position: absolute, top: 0):
  //   headerOverlay: paddingTop 8, paddingBottom 12, paddingHorizontal 20
  //     Contains: close button (40x40, marginRight 8) + scorecard card (flex: 1)
  //   toolsAndDistanceRow: marginTop 8, paddingHorizontal 20, justifyContent space-between
  //   distanceOverlay: marginTop 8, paddingHorizontal 20, alignItems flex-end
  //
  // Absolute-positioned buttons:
  //   Layers: bottom 210, left 16
  //   Wind: bottom 120, left 16
  //   Settings: bottom 60, left 16
  //
  // Bottom overlay (SafeAreaView, position: absolute, bottom: 0):
  //   Log Shot: alignSelf flex-end, marginBottom 8, marginRight 16
  hole_view_intro: {
    id: 'hole_view_intro',
    screen: 'holeView',
    version: '1.0.0',
    steps: [
      {
        id: 'hv_overview',
        title: 'The Hole View',
        description: 'This is your caddie\'s eye view. You\'ll see a satellite map with distances, hazards, and AI-powered shot plans.',
        target: { type: 'none' },
        icon: 'map-outline',
      },
      {
        // Full header row: SafeAreaView top + paddingTop 8 → covers ~90px of header content
        // Using left: 0 / right: 0 to span full width
        id: 'hv_scorecard',
        title: 'Shot Tracker',
        description: 'The top bar shows your hole number, shot-by-shot tracker, and round score. Tap the round total to see the full scorecard.',
        target: {
          type: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 90,
          safeTop: true,
        },
        icon: 'document-text-outline',
      },
      {
        // Hole nav arrows: inside headerOverlay, after close button (40px + 8px margin = 48px from paddingHorizontal start)
        // headerOverlay paddingHorizontal: 20, so close button starts at 20px, hole nav starts at ~68px
        // Vertically: paddingTop 8 + some internal padding = ~12px from safe area
        id: 'hv_hole_nav',
        title: 'Navigate Holes',
        description: 'Use the arrows beside the hole number to move between holes. You can preview upcoming holes anytime.',
        target: {
          type: 'absolute',
          top: 12,
          left: 70,
          width: 80,
          height: 50,
          safeTop: true,
        },
        icon: 'swap-horizontal-outline',
      },
      {
        // Distance card: right-aligned in toolsAndDistanceRow
        // Below headerOverlay (~90px) + marginTop 8 = 98px from safe area top
        // Right-aligned with paddingHorizontal 20
        id: 'hv_distance',
        title: 'Distance Info',
        description: 'Your playing distance to the green is shown here, adjusted for wind and elevation when available.',
        target: {
          type: 'absolute',
          top: 108,
          right: 22,
          width: 130,
          height: 106,
          safeTop: true,
        },
        icon: 'locate-outline',
      },
      {
        // Center of the interactive map - keep percentage since it's just "the middle"
        id: 'hv_map_tap',
        title: 'Tap the Map',
        description: 'Tap anywhere on the map to drop a pin and see the distance from that spot to the green. Great for planning layups!',
        target: {
          type: 'region',
          top: 30,
          left: 8,
          width: 60,
          height: 40,
        },
        icon: 'finger-print-outline',
      },
      {
        // Plan Hole button: in distanceOverlay, below toolsAndDistanceRow
        // ~90px header + 8 marginTop + ~70px distance row + 8 marginTop = ~176px from safe area top
        // Right-aligned with paddingHorizontal 20
        id: 'hv_plan_hole',
        title: 'AI Hole Plan',
        description: 'Tap "Plan Hole" to get an AI strategy. Pure suggests clubs and landing zones based on your bag and tendencies.',
        target: {
          type: 'absolute',
          top: 230,
          right: 20,
          width: 105,
          height: 24,
          safeTop: true,
        },
        icon: 'bulb-outline',
      },
      {
        // Layers button: position absolute, bottom: 210, left: 16
        // Button content: paddingVertical 10 + paddingHorizontal 14 + icon(18) + gap(6) + text
        // Approximate size: ~95px wide x 40px tall
        id: 'hv_layers',
        title: 'Map Layers',
        description: 'This button opens layer controls where you can toggle hazard distances, course overlays, and GPS tracking.',
        target: {
          type: 'absolute',
          bottom: 210,
          left: 16,
          width: 95,
          height: 40,
        },
        icon: 'layers-outline',
      },
      {
        // Log Shot button: inside SafeAreaView bottom overlay
        // alignSelf: flex-end, marginBottom: 8, marginRight: 16
        // Button: paddingHorizontal 20, paddingVertical 10, borderRadius 24
        // Approximate size: ~145px wide x 44px tall
        id: 'hv_log_shot',
        title: 'Log Your Shots',
        description: 'When you\'re ready to hit, tap "Log Shot" to record your club, lie, and result. Every shot is tracked for post-round analytics.',
        target: {
          type: 'absolute',
          bottom: 8,
          right: 16,
          width: 145,
          height: 44,
          safeBottom: true,
        },
        icon: 'golf-outline',
      },
      {
        // Shot tracker dots: center portion of the scorecard card in headerOverlay
        // Close button takes ~48px from left (20px padding + 40px button + 8px margin)
        // Scorecard card starts at ~68px. Shot dots are in the middle section.
        // Vertically: ~20px from safe area top (within the scorecard card)
        id: 'hv_score_entry',
        title: 'Enter Your Score',
        description: 'After finishing the hole, tap the shot tracker to enter your score, putts, fairway hit, and GIR. Then advance to the next hole.',
        target: {
          type: 'absolute',
          top: 20,
          left: 150,
          width: 160,
          height: 45,
          safeTop: true,
        },
        icon: 'create-outline',
      },
    ],
  },

  // ===== MY BAG =====
  // Layout: Header gradient (~12%) -> Tab bar -> Club list (ScrollView)
  // Uses percentage positioning - flex layout scales with screen
  my_bag_intro: {
    id: 'my_bag_intro',
    screen: 'myBag',
    version: '1.0.0',
    steps: [
      {
        id: 'bag_overview',
        title: 'Your Golf Bag',
        description: 'Manage the clubs in your bag. Accurate distances help Pure give you better recommendations on the course.',
        target: { type: 'none' },
        icon: 'bag-handle-outline',
      },
      {
        id: 'bag_toggle',
        title: 'Add or Remove Clubs',
        description: 'Tap any club to add or remove it from your bag. You can carry up to 14 clubs, just like the rules allow.',
        target: {
          type: 'region',
          top: 25,
          left: 3,
          width: 94,
          height: 16,
        },
        icon: 'add-circle-outline',
      },
      {
        id: 'bag_distances',
        title: 'Set Your Distances',
        description: 'Tap the yardage on a club to adjust it. As you play rounds, Pure learns your actual distances automatically.',
        target: {
          type: 'region',
          top: 35,
          left: 45,
          width: 32,
          height: 5,
        },
        icon: 'speedometer-outline',
      },
    ],
  },

  // ===== PLAYER INSIGHTS =====
  // Layout: Header gradient (~12%) -> ScrollView with data quality banner, stat rings, club cards, tendencies
  player_insights_intro: {
    id: 'player_insights_intro',
    screen: 'playerInsights',
    version: '1.0.0',
    steps: [
      {
        id: 'insights_overview',
        title: 'Player Insights',
        description: 'This screen shows your measured club stats, tendencies, and game analytics. Data improves after each tracked round.',
        target: { type: 'none' },
        icon: 'analytics-outline',
      },
      {
        id: 'insights_clubs',
        title: 'Club Performance',
        description: 'See your actual vs. expected distances for each club. Tap a club to see detailed stats like dispersion and accuracy.',
        target: {
          type: 'region',
          top: 28,
          left: 3,
          width: 94,
          height: 25,
        },
        icon: 'bar-chart-outline',
      },
      {
        id: 'insights_tendencies',
        title: 'Game Tendencies',
        description: 'Pure tracks patterns in your game \u2014 miss direction, distance control, scoring by hole type. Use this to focus your practice.',
        target: {
          type: 'region',
          top: 58,
          left: 3,
          width: 94,
          height: 22,
        },
        icon: 'trending-up-outline',
      },
    ],
  },

  // ===== ROUND HISTORY =====
  round_history_intro: {
    id: 'round_history_intro',
    screen: 'roundHistory',
    version: '1.0.0',
    steps: [
      {
        id: 'history_overview',
        title: 'Round History',
        description: 'All your completed rounds are listed here. Tap any round to see the full hole-by-hole breakdown with stats and shots.',
        target: { type: 'none' },
        icon: 'time-outline',
      },
    ],
  },
};

// Map screen names (matching currentScreen values) to training sequence IDs
export const SCREEN_TRAINING_MAP = {
  home: 'home_intro',
  holeView: 'hole_view_intro',
  myBag: 'my_bag_intro',
  playerInsights: 'player_insights_intro',
  roundHistory: 'round_history_intro',
};

// Human-readable labels for Settings replay list
export const TRAINING_LABELS = {
  home_intro: { label: 'Home Tour', icon: 'home-outline', screen: 'home' },
  hole_view_intro: { label: 'Hole View Tour', icon: 'map-outline', screen: 'holeView' },
  my_bag_intro: { label: 'My Bag Tour', icon: 'bag-handle-outline', screen: 'myBag' },
  player_insights_intro: { label: 'Insights Tour', icon: 'analytics-outline', screen: 'playerInsights' },
  round_history_intro: { label: 'Round History Tour', icon: 'time-outline', screen: 'roundHistory' },
};
