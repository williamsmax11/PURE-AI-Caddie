-- Migration: Onboarding v2 — new profile fields for redesigned onboarding
-- Adds new columns for the unified onboarding wizard.
-- Old columns are kept for backward compatibility with existing users.

-- 1. Add new onboarding v2 columns
ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS typical_score     text,
ADD COLUMN IF NOT EXISTS driver_distance   text,
ADD COLUMN IF NOT EXISTS miss_pattern      text,
ADD COLUMN IF NOT EXISTS distance_control  text,
ADD COLUMN IF NOT EXISTS target_score      integer;

-- 2. Documentation
COMMENT ON COLUMN profiles.typical_score    IS 'Typical 18-hole score: <72, 72-79, 80-89, 90-99, 100+, not_sure';
COMMENT ON COLUMN profiles.driver_distance  IS 'Driver distance range: 290+, 265-290, 240-264, 215-239, 190-214, <190, dont_know';
COMMENT ON COLUMN profiles.miss_pattern     IS 'Typical miss: slice_fade, hook_draw, both, straight';
COMMENT ON COLUMN profiles.distance_control IS 'Iron distance control: short, long, good, all_over';
COMMENT ON COLUMN profiles.target_score     IS 'Score the user wants to break';
