/**
 * Onboarding Utilities
 *
 * Conversion functions for onboarding answer values.
 */

/**
 * Convert typical score range to an estimated numeric handicap.
 * Used by downstream services that expect a number.
 */
export function scoreRangeToHandicap(typicalScore) {
  switch (typicalScore) {
    case '<72':       return 2;
    case '72-79':     return 8;
    case '80-89':     return 15;
    case '90-99':     return 22;
    case '100+':      return 30;
    case 'not_sure':  return 20;
    default:          return 15;
  }
}

/**
 * Convert driver distance range selection to a numeric midpoint value.
 */
export function driverRangeToDistance(driverDistance) {
  switch (driverDistance) {
    case '290+':      return 300;
    case '265-290':   return 278;
    case '240-264':   return 252;
    case '215-239':   return 227;
    case '190-214':   return 202;
    case '<190':      return 175;
    case 'dont_know': return 220;
    default:          return 220;
  }
}
