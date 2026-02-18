/**
 * Greeting Utilities
 *
 * Dynamic greeting system for the Pure home screen.
 * Provides time-based and context-aware greetings.
 */

/**
 * Get a time-based greeting
 * @returns {string} "Good Morning", "Good Afternoon", "Good Evening", or "Welcome Back"
 */
export function getTimeBasedGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'Good Morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Good Afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'Good Evening';
  } else {
    return 'Welcome Back';
  }
}

/**
 * Get a contextual sub-greeting based on user stats
 * @param {object} stats - User statistics { avgScore, lastRoundScore, roundsThisWeek, daysSinceLastRound, totalRounds }
 * @returns {string} A contextual motivational message
 */
export function getSubGreeting(stats) {
  // Handle null/undefined stats
  const safeStats = stats || {};
  const {
    avgScore,
    lastRoundScore,
    roundsThisWeek = 0,
    daysSinceLastRound = 0,
    totalRounds = 0,
  } = safeStats;

  // Priority 1: Celebrate recent improvement
  if (lastRoundScore && avgScore && lastRoundScore < avgScore - 2) {
    return 'Great round last time! Keep it up!';
  }

  // Priority 2: Acknowledge active streak
  if (roundsThisWeek >= 2) {
    return "You're on a roll this week!";
  }

  // Priority 3: Encourage return after absence
  if (daysSinceLastRound > 14) {
    return 'Time to get back on the course!';
  }

  // Priority 4: First-time user encouragement
  if (totalRounds === 0) {
    return "Let's track your first round!";
  }

  // Priority 5: Default motivational messages (rotate)
  const defaults = [
    'Perfect day to lower that handicap!',
    'Ready to improve your game?',
    "Let's hit the links!",
    'Time to make some birdies!',
    'Your best round awaits!',
  ];

  // Use current date to semi-randomly pick a message (consistent within a day)
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return defaults[dayOfYear % defaults.length];
}

/**
 * Get the full greeting object
 * @param {string} userName - User's name
 * @param {object} stats - User statistics
 * @returns {object} { greeting, subGreeting }
 */
export function getGreeting(userName, stats) {
  const timeGreeting = getTimeBasedGreeting();
  const name = userName || 'Golfer';

  return {
    greeting: `${timeGreeting}, ${name}!`,
    subGreeting: getSubGreeting(stats),
  };
}
