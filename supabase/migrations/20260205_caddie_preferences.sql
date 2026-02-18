-- Migration: Add caddie preferences columns to profiles
-- These fields help personalize Pure responses

-- Add new columns for caddie preferences
ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS best_area text,
ADD COLUMN IF NOT EXISTS worst_area text,
ADD COLUMN IF NOT EXISTS planning_style text,
ADD COLUMN IF NOT EXISTS response_depth text,
ADD COLUMN IF NOT EXISTS caddie_setup_completed boolean NOT NULL DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN profiles.best_area IS 'Strongest part of game: driver, long_irons, short_irons, wedges, chipping, putting';
COMMENT ON COLUMN profiles.worst_area IS 'Area needing most help: driver, long_irons, short_irons, wedges, chipping, putting';
COMMENT ON COLUMN profiles.planning_style IS 'How user approaches rounds: fun, some, detailed';
COMMENT ON COLUMN profiles.response_depth IS 'Preferred AI response length: short, medium, detailed';
COMMENT ON COLUMN profiles.caddie_setup_completed IS 'Whether user has completed caddie personalization';
