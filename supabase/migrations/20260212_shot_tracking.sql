-- Migration: Shot Tracking & Analytics
-- Adds round_shots for individual shot data, user_club_stats for computed
-- per-club statistics, and user_tendencies for pattern detection.

-- ============================================================
-- 1. Create round_shots table
-- ============================================================

CREATE TABLE IF NOT EXISTS "round_shots" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid NOT NULL REFERENCES "rounds"(id) ON DELETE CASCADE,
  hole_number     integer NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  shot_number     integer NOT NULL CHECK (shot_number >= 1),

  -- Where the player hit from
  from_lat        double precision NOT NULL,
  from_lon        double precision NOT NULL,
  from_elevation  real,

  -- Where the ball landed (actual)
  to_lat          double precision,
  to_lon          double precision,
  to_elevation    real,

  -- Where the player was aiming (planned target from AI recommendation)
  target_lat      double precision,
  target_lon      double precision,

  -- Shot details
  club            text NOT NULL,
  lie_type        text DEFAULT 'fairway' CHECK (lie_type IN ('tee', 'fairway', 'rough', 'bunker', 'fringe', 'green', 'penalty', 'other')),
  intended_target text,

  -- Distances (yards)
  distance_actual     real,
  distance_planned    real,
  distance_to_target  real,
  distance_offline    real,

  -- Conditions at time of shot
  wind_speed          real,
  wind_direction      text,
  temperature_f       real,
  effective_distance  real,

  -- Outcome classification
  result          text CHECK (result IN ('fairway', 'rough_left', 'rough_right', 'bunker', 'water', 'ob', 'green', 'fringe', 'other')),
  shot_quality    text CHECK (shot_quality IN ('good', 'acceptable', 'poor', 'penalty')),
  detection_method text DEFAULT 'manual' CHECK (detection_method IN ('manual', 'auto')),

  -- Timestamps
  played_at       timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),

  UNIQUE(round_id, hole_number, shot_number)
);

-- ============================================================
-- 2. Create user_club_stats table
-- ============================================================

CREATE TABLE IF NOT EXISTS "user_club_stats" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club            text NOT NULL,

  -- Distance stats
  avg_distance        real,
  median_distance     real,
  std_distance        real,
  max_distance        real,
  min_distance        real,

  -- Accuracy stats
  avg_offline         real,
  std_offline         real,
  miss_left_pct       real,
  miss_right_pct      real,
  miss_short_pct      real,
  miss_long_pct       real,

  -- Dispersion (measured, replaces formula)
  dispersion_radius       real,
  lateral_dispersion      real,
  distance_dispersion     real,

  -- Target accuracy
  avg_distance_to_target  real,

  -- Sample info
  total_shots     integer DEFAULT 0,
  last_10_avg     real,
  last_updated    timestamptz DEFAULT now(),

  UNIQUE(user_id, club)
);

-- ============================================================
-- 3. Create user_tendencies table
-- ============================================================

CREATE TABLE IF NOT EXISTS "user_tendencies" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tendency_type   text NOT NULL,
  tendency_key    text NOT NULL,
  tendency_data   jsonb NOT NULL,
  confidence      real DEFAULT 0,
  sample_size     integer DEFAULT 0,
  last_updated    timestamptz DEFAULT now(),

  UNIQUE(user_id, tendency_type, tendency_key)
);

-- ============================================================
-- 4. Row Level Security
-- ============================================================

ALTER TABLE "round_shots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_club_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_tendencies" ENABLE ROW LEVEL SECURITY;

-- round_shots: user must own the parent round
CREATE POLICY "Users can view own round shots"
  ON "round_shots" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own round shots"
  ON "round_shots" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

CREATE POLICY "Users can update own round shots"
  ON "round_shots" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own round shots"
  ON "round_shots" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

-- user_club_stats: users can only access their own
CREATE POLICY "Users can view own club stats"
  ON "user_club_stats" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own club stats"
  ON "user_club_stats" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own club stats"
  ON "user_club_stats" FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own club stats"
  ON "user_club_stats" FOR DELETE
  USING (auth.uid() = user_id);

-- user_tendencies: users can only access their own
CREATE POLICY "Users can view own tendencies"
  ON "user_tendencies" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tendencies"
  ON "user_tendencies" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tendencies"
  ON "user_tendencies" FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tendencies"
  ON "user_tendencies" FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. Updated_at triggers
-- ============================================================

CREATE TRIGGER user_club_stats_updated_at
  BEFORE UPDATE ON "user_club_stats"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_tendencies_updated_at
  BEFORE UPDATE ON "user_tendencies"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_round_shots_round     ON "round_shots"(round_id);
CREATE INDEX IF NOT EXISTS idx_round_shots_club      ON "round_shots"(club);
CREATE INDEX IF NOT EXISTS idx_round_shots_hole      ON "round_shots"(round_id, hole_number);
CREATE INDEX IF NOT EXISTS idx_round_shots_played    ON "round_shots"(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_club_stats_user  ON "user_club_stats"(user_id);
CREATE INDEX IF NOT EXISTS idx_user_club_stats_club  ON "user_club_stats"(user_id, club);
CREATE INDEX IF NOT EXISTS idx_user_tendencies_user  ON "user_tendencies"(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tendencies_type  ON "user_tendencies"(user_id, tendency_type);
