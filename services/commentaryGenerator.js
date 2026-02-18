/**
 * Commentary Generator
 *
 * Template-based natural language commentary for hole plans.
 * No LLM required - uses string interpolation with golf-specific templates.
 */

// ============================================================================
// STRATEGY TEMPLATES
// ============================================================================

const STRATEGY_INTROS = {
  aggressive: [
    "Let's attack this one.",
    "Time to be aggressive here.",
    "Go get it.",
    "This is a scoring hole - let's take advantage.",
    "Perfect hole to make a move.",
  ],
  conservative: [
    "Let's play this one smart.",
    "No need to be a hero here.",
    "Play the percentages on this one.",
    "Take your medicine and move on.",
    "Safe play sets up a good score.",
  ],
  smart: [
    "Here's the game plan.",
    "Solid strategy for this hole.",
    "Let's set this up right.",
    "Good plan coming up.",
    "Trust the process here.",
  ],
};

const STRATEGY_EXPLANATIONS = {
  aggressive: [
    "We're going for it because the reward outweighs the risk.",
    "Conditions favor attacking.",
    "Your game is suited for this approach.",
  ],
  conservative: [
    "The trouble here doesn't justify taking risks.",
    "Par is a good score on this hole.",
    "Stay patient - bogeys hurt more than birdies help.",
  ],
  smart: [
    "This balances opportunity with smart course management.",
    "Setting up for the best approach angle.",
    "Position over power on this one.",
  ],
};

// ============================================================================
// SHOT TEMPLATES
// ============================================================================

const TEE_SHOT_TEMPLATES = [
  "{club} off the tee, {distance} yards to the landing zone.",
  "Start with {club} - aiming for {target}.",
  "{club} here leaves you {nextDistance} yards in.",
  "Take your {club} and find {target}.",
];

const APPROACH_TEMPLATES = [
  "{club} from {distance} yards. {greenTip}",
  "{distance} in - {club} to the middle of the green.",
  "{club} should get you there with room to spare.",
  "Full {club}, {distance} yards to the center.",
];

const LAYUP_TEMPLATES = [
  "Layup with {club} to leave {nextDistance} yards.",
  "{club} to the layup zone - sets up a comfortable approach.",
  "Smart play: {club} leaves your favorite yardage.",
];

const GREEN_TIPS = [
  "Aim for the fat part of the green.",
  "Center green is always a good miss.",
  "Two putts from anywhere on the green is a win.",
  "Don't short-side yourself.",
  "Trust your line and commit.",
];

// ============================================================================
// HAZARD WARNINGS
// ============================================================================

const HAZARD_WARNINGS = {
  water: {
    left: "Water guards the left - favor the right side.",
    right: "Water right - play left of center.",
    short: "Don't be short - water in front.",
    long: "Don't fly it - water over the green.",
  },
  bunker: {
    left: "Bunker left - aim right of it.",
    right: "Bunker on the right - stay away from it.",
    short: "Front bunker - take enough club.",
    long: "Bunker behind - don't overcook it.",
  },
  ob: {
    left: "OB left - start it right.",
    right: "OB right - stay left.",
  },
};

const HAZARD_GENERAL = {
  water: "Be sure to clear the water.",
  bunker: "Keep it out of the sand.",
  ob: "Stay in bounds here.",
};

// ============================================================================
// WIND COMMENTARY
// ============================================================================

const WIND_TEMPLATES = {
  into: [
    "Wind is in your face - take an extra club.",
    "Hitting into the wind - club up.",
    "Headwind will knock it down.",
  ],
  helping: [
    "Wind at your back - it'll go.",
    "Helping wind - maybe one less club.",
    "Tailwind will add distance.",
  ],
  'crosswind-left': [
    "Wind from the right - aim into it.",
    "Let the wind bring it back.",
  ],
  'crosswind-right': [
    "Wind from the left - aim left and let it ride.",
    "Start it left of target.",
  ],
};

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate full commentary for a hole plan
 *
 * @param {Object} plan - Computed hole plan
 * @param {Object} holeData - Hole information
 * @param {Object} playerInsights - Optional player insights for personalization
 * @returns {string} Natural language commentary
 */
export function generateCommentary(plan, holeData, playerInsights = null) {
  if (!plan || !plan.shots || plan.shots.length === 0) {
    return "Let's see what we've got here.";
  }

  const parts = [];

  // Strategy intro
  parts.push(generateStrategyIntro(plan.strategy));

  // Personalized insight (added before shot details when data available)
  const personalNote = generatePersonalizedNote(plan, holeData, playerInsights);
  if (personalNote) {
    parts.push(personalNote);
  }

  // Shot-by-shot commentary
  for (const shot of plan.shots) {
    parts.push(generateShotCommentary(shot, plan.shots.length));
  }

  // Wind advisory if significant
  const windCommentary = generateWindCommentary(plan.shots[0]?.adjustments);
  if (windCommentary) {
    parts.push(windCommentary);
  }

  // Risk warning if needed
  if (plan.riskAssessment?.mainThreat && plan.riskAssessment.mainThreat !== 'None - open hole') {
    parts.push(generateRiskWarning(plan.riskAssessment));
  }

  // Personalized club tip for first shot
  const clubTip = generateClubInsight(plan.shots[0], playerInsights);
  if (clubTip) {
    parts.push(clubTip);
  }

  // Closing encouragement
  parts.push(generateClosing(plan.strategy, plan.targetScore, holeData.par));

  return parts.join(' ');
}

/**
 * Generate strategy intro
 */
function generateStrategyIntro(strategy) {
  const intros = STRATEGY_INTROS[strategy] || STRATEGY_INTROS.smart;
  return randomChoice(intros);
}

/**
 * Generate shot commentary
 */
function generateShotCommentary(shot, totalShots) {
  const { shotNumber, club, distance, target, nextShotDistance, avoidZones } = shot;

  let template;
  let vars = {
    club,
    distance,
    target: target || 'the fairway',
    nextDistance: nextShotDistance || '',
    greenTip: randomChoice(GREEN_TIPS),
  };

  // Determine shot type and select template
  if (shotNumber === 1 && totalShots > 1) {
    // Tee shot
    template = randomChoice(TEE_SHOT_TEMPLATES);
  } else if (nextShotDistance === 0 || shotNumber === totalShots) {
    // Approach shot
    template = randomChoice(APPROACH_TEMPLATES);
  } else {
    // Layup
    template = randomChoice(LAYUP_TEMPLATES);
  }

  let commentary = interpolate(template, vars);

  // Add hazard warning if relevant
  if (avoidZones && avoidZones.length > 0) {
    const hazard = avoidZones[0];
    const warning = generateHazardWarning(hazard);
    if (warning) {
      commentary += ' ' + warning;
    }
  }

  return commentary;
}

/**
 * Generate hazard warning
 */
function generateHazardWarning(hazard) {
  if (!hazard) return null;

  const typeWarnings = HAZARD_WARNINGS[hazard.type];
  if (typeWarnings && typeWarnings[hazard.direction]) {
    return typeWarnings[hazard.direction];
  }

  return HAZARD_GENERAL[hazard.type] || null;
}

/**
 * Generate wind commentary
 */
function generateWindCommentary(adjustments) {
  if (!adjustments?.wind) return null;

  const { distanceEffect, aimOffsetYards, aimDirection } = adjustments.wind;

  // Only comment on significant wind
  if (Math.abs(distanceEffect) < 5 && aimOffsetYards < 5) {
    return null;
  }

  const parts = [];

  // Distance effect
  if (Math.abs(distanceEffect) >= 5) {
    if (distanceEffect > 0) {
      parts.push(randomChoice(WIND_TEMPLATES.into));
    } else {
      parts.push(randomChoice(WIND_TEMPLATES.helping));
    }
  }

  // Aim adjustment
  if (aimOffsetYards >= 5 && aimDirection) {
    parts.push(`Aim ${aimOffsetYards} yards ${aimDirection} for the wind.`);
  }

  return parts.join(' ');
}

/**
 * Generate risk warning
 */
function generateRiskWarning(riskAssessment) {
  const { mainThreat, bailout } = riskAssessment;

  if (mainThreat.toLowerCase().includes('water')) {
    return `Watch the water. ${bailout}`;
  }
  if (mainThreat.toLowerCase().includes('bunker')) {
    return `Bunkers in play. ${bailout}`;
  }
  if (mainThreat.toLowerCase().includes('ob') || mainThreat.toLowerCase().includes('out')) {
    return `OB lurking. ${bailout}`;
  }

  return '';
}

/**
 * Generate closing statement
 */
function generateClosing(strategy, targetScore, par) {
  const scoreName = targetScore < par ? 'birdie' : targetScore === par ? 'par' : 'bogey';

  const closings = {
    aggressive: [
      `Let's make ${scoreName}.`,
      "Trust your swing and commit.",
      "Aggressive play, confident swing.",
    ],
    conservative: [
      `${scoreName} is a good score here.`,
      "Stick to the plan.",
      "Smart golf wins.",
    ],
    smart: [
      "Execute the plan.",
      `Set up for ${scoreName}.`,
      "You've got this.",
    ],
  };

  return randomChoice(closings[strategy] || closings.smart);
}

// ============================================================================
// PERSONALIZED COMMENTARY
// ============================================================================

/**
 * Generate a personalized note based on player tendencies and hole context.
 */
function generatePersonalizedNote(plan, holeData, playerInsights) {
  if (!playerInsights || !playerInsights.tendencies || playerInsights.dataQuality?.dataLevel === 'none') {
    return null;
  }

  const { tendencies, dataQuality } = playerInsights;
  if (dataQuality.dataLevel === 'minimal') return null;

  const par = holeData?.par || 4;

  // Check for hole-type tendency
  const holeTypeTendency = tendencies.find(
    t => t.type === 'hole_type' && t.key === `par${par}_scoring` && t.confidence >= 0.5
  );
  if (holeTypeTendency) {
    const avgOver = holeTypeTendency.data?.avgOverPar;
    if (avgOver != null && avgOver < -0.1) {
      return `You're strong on par ${par}s - let's be aggressive here.`;
    }
    if (avgOver != null && avgOver > 0.5) {
      return `Par ${par}s have been tricky for you - let's play safe to the center of the green.`;
    }
  }

  // Check for back nine tendency
  const backNineTendency = tendencies.find(
    t => t.type === 'scoring' && t.key === 'front_vs_back' && t.confidence >= 0.5
  );
  if (backNineTendency && holeData?.number >= 10) {
    const diff = backNineTendency.data?.backNineDiff;
    if (diff != null && diff > 1.5) {
      return "The back nine is where your scores tend to climb - stay focused and stick to the plan.";
    }
  }

  // Check for after-bogey tendency
  const afterBogeyTendency = tendencies.find(
    t => t.type === 'scoring' && t.key === 'after_bogey' && t.confidence >= 0.5
  );
  if (afterBogeyTendency) {
    const bogeyRate = afterBogeyTendency.data?.repeatRate;
    if (bogeyRate != null && bogeyRate > 0.6) {
      // This would be used when contextual - caller can check if previous hole was bogey
    }
  }

  return null;
}

/**
 * Generate personalized club insight for a specific shot.
 * Uses measured stats to advise on club tendencies.
 */
function generateClubInsight(shot, playerInsights) {
  if (!shot || !playerInsights || !playerInsights.clubStats) return null;
  if (playerInsights.dataQuality?.dataLevel === 'none' || playerInsights.dataQuality?.dataLevel === 'minimal') return null;

  // Normalize club name back to ID for lookup
  const clubId = normalizeClubId(shot.club);
  if (!clubId) return null;

  const stats = playerInsights.clubStats[clubId];
  if (!stats || stats.totalShots < 10) return null;

  // Check for lateral bias
  if (stats.avgOffline != null && Math.abs(stats.avgOffline) > 4) {
    const direction = stats.avgOffline > 0 ? 'right' : 'left';
    const opposite = stats.avgOffline > 0 ? 'left' : 'right';
    const yards = Math.abs(stats.avgOffline).toFixed(0);
    return `Your ${shot.club.toLowerCase()} tends to fade ${yards} yards ${direction} - aim at the ${opposite} edge.`;
  }

  // Check for distance insight
  if (stats.avgDistance && shot.distance) {
    const diff = stats.avgDistance - shot.distance;
    if (diff < -8) {
      return `You've been averaging ${Math.round(stats.avgDistance)} yards with your ${shot.club.toLowerCase()} lately, which is a bit short for this shot.`;
    }
    if (diff > 0 && diff < 5) {
      return `You've been averaging ${Math.round(stats.avgDistance)} yards with your ${shot.club.toLowerCase()} - perfect for this distance.`;
    }
  }

  return null;
}

/**
 * Normalize display club name back to club ID.
 */
function normalizeClubId(clubName) {
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
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Interpolate variables into template string
 */
function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

/**
 * Random choice from array
 */
function randomChoice(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// INDIVIDUAL SHOT COMMENTARY
// ============================================================================

/**
 * Generate commentary for a single shot (for streaming/progressive display)
 *
 * @param {Object} shot - Shot data
 * @returns {string} Shot commentary
 */
export function generateShotSpokenCommentary(shot) {
  const { shotNumber, club, distance, nextShotDistance } = shot;

  if (nextShotDistance === 0) {
    return `Shot ${shotNumber}: ${club}, ${distance} yards to the green.`;
  }

  if (shotNumber === 1) {
    return `Shot ${shotNumber}: ${club}, ${distance} yards. Leaves ${nextShotDistance} to the pin.`;
  }

  return `Shot ${shotNumber}: ${club}, ${distance} yards.`;
}

/**
 * Generate brief plan summary (for quick display)
 *
 * @param {Object} plan - Computed hole plan
 * @returns {string} Brief summary
 */
export function generatePlanSummary(plan) {
  if (!plan || !plan.shots || plan.shots.length === 0) {
    return 'No plan available';
  }

  const shotDescriptions = plan.shots.map(shot =>
    `${shot.club} (${shot.distance}y)`
  );

  const strategyLabel = {
    aggressive: 'Aggressive',
    conservative: 'Safe',
    smart: 'Smart',
  }[plan.strategy] || 'Balanced';

  return `${strategyLabel}: ${shotDescriptions.join(' → ')}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  interpolate,
  randomChoice,
  generateHazardWarning,
  generateWindCommentary,
};
