/**
 * Rule-based caddie reminder generator.
 * Produces exactly 3 short, actionable tips for the hole plan card.
 * No LLM required — uses engine data, hazards, weather, and player context.
 */

/**
 * @param {Object} params
 * @param {Array}  params.shots          - Processed shots with avoidZones/warnings
 * @param {Object} params.riskAssessment - { mainThreat, worstCase, bailout }
 * @param {Object} params.weather        - { windSpeed, windDirection, temperature }
 * @param {Object} params.holeData       - { par, yardage, handicap }
 * @param {string} params.strategy       - 'aggressive' | 'conservative' | 'smart'
 * @param {Object} params.playerInsights - Player tendency data (optional)
 * @param {Object} params.caddiePreferences - { missPattern, worstArea, bestArea } (optional)
 * @param {number|null} params.previousHoleScore - Score relative to par on last hole (e.g., +1 for bogey)
 * @returns {string[]} Exactly 3 reminder strings
 */
export function generateCaddieReminders({
  shots = [],
  riskAssessment,
  weather,
  holeData,
  strategy,
  playerInsights,
  caddiePreferences,
  previousHoleScore,
}) {
  const reminders = [];

  // --- Priority 1: Hazard warnings from shots ---
  const hazardReminders = buildHazardReminders(shots, riskAssessment);
  reminders.push(...hazardReminders);

  // --- Priority 2: Wind awareness ---
  if (reminders.length < 3 && weather?.windSpeed >= 8) {
    reminders.push(buildWindReminder(weather));
  }

  // --- Priority 3: Player-specific tips ---
  if (reminders.length < 3 && caddiePreferences?.missPattern) {
    const miss = caddiePreferences.missPattern.toLowerCase();
    if (miss.includes('right')) {
      reminders.push('Your miss tends right, favor left');
    } else if (miss.includes('left')) {
      reminders.push('Your miss tends left, favor right');
    }
  }

  if (reminders.length < 3 && caddiePreferences?.worstArea) {
    const area = caddiePreferences.worstArea.toLowerCase();
    reminders.push(`Stay out of the ${area}`);
  }

  // --- Priority 4: After-bogey mental reset ---
  if (reminders.length < 3 && previousHoleScore != null && previousHoleScore > 0) {
    reminders.push('Fresh start, reset and commit');
  }

  // --- Priority 5: Contextual strategy/tempo ---
  if (reminders.length < 3) {
    reminders.push(...buildContextReminders(holeData, strategy, reminders.length));
  }

  // Guarantee exactly 3
  return reminders.slice(0, 3);
}

// ── Helpers ──────────────────────────────────────────────────

function buildHazardReminders(shots, riskAssessment) {
  const seen = new Set();
  const results = [];

  // Gather unique hazards from all shot avoidZones
  for (const shot of shots) {
    const zones = shot.avoidZones || shot.warnings || [];
    for (const zone of zones) {
      // avoidZones are objects, warnings are strings
      const key = typeof zone === 'string' ? zone : `${zone.type}-${zone.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (typeof zone === 'string') {
        // Already a "Watch water left" style string
        results.push(zone.replace(/^Watch\s+/i, 'Avoid '));
      } else {
        const label = zone.type === 'ob' ? 'OB' : capitalize(zone.type);
        const dir = zone.direction || '';
        results.push(`Avoid ${label} ${dir}`.trim());
      }

      if (results.length >= 2) return results; // Max 2 hazard reminders
    }
  }

  // Fallback to riskAssessment.mainThreat if no shot-level hazards
  if (results.length === 0 && riskAssessment?.mainThreat && riskAssessment.mainThreat !== 'None') {
    results.push(`Watch for ${riskAssessment.mainThreat.toLowerCase()}`);
  }

  return results;
}

function buildWindReminder(weather) {
  const { windSpeed, windDirection } = weather;
  const speed = Math.round(windSpeed);
  // Simplified wind description
  if (speed >= 15) {
    return `Strong wind ${speed} mph ${windDirection}`;
  }
  return `Wind ${speed} mph from ${windDirection}`;
}

function buildContextReminders(holeData, strategy, currentCount) {
  const results = [];
  const needed = 3 - currentCount;

  if (needed <= 0) return results;

  // Hard hole
  if (holeData?.handicap && holeData.handicap <= 4) {
    results.push('Tough hole, stay patient');
  }

  // Par-specific
  if (results.length < needed) {
    if (holeData?.par === 3) {
      results.push('Trust the club selection');
    } else if (holeData?.par === 5) {
      results.push('Two good shots sets up birdie');
    }
  }

  // Strategy-specific
  if (results.length < needed) {
    if (strategy === 'aggressive') {
      results.push('Commit fully to the shot');
    } else if (strategy === 'conservative') {
      results.push('Smooth tempo, play smart');
    } else {
      results.push('Pick a target and commit');
    }
  }

  // Final fallback
  if (results.length < needed) {
    results.push('Visualize the shot, then go');
  }

  return results.slice(0, needed);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
