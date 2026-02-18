-- Migration: User clubs/bag storage
-- Stores each user's golf bag configuration with club distances

-- ============================================================
-- 1. Create user_clubs table
-- ============================================================

CREATE TABLE IF NOT EXISTS "user_clubs" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id         text NOT NULL,
  name            text NOT NULL,
  category        text NOT NULL,
  distance        integer,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, club_id)
);

-- ============================================================
-- 2. Enable Row Level Security
-- ============================================================

ALTER TABLE "user_clubs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clubs"
  ON "user_clubs" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clubs"
  ON "user_clubs" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clubs"
  ON "user_clubs" FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clubs"
  ON "user_clubs" FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. Add bag setup tracking to profiles
-- ============================================================

ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS bag_setup_completed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bag_setup_skipped boolean NOT NULL DEFAULT false;

-- ============================================================
-- 4. Updated_at trigger for user_clubs
-- ============================================================

CREATE TRIGGER user_clubs_updated_at
  BEFORE UPDATE ON "user_clubs"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_clubs_user_id ON "user_clubs"(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_category ON "user_clubs"(category);
