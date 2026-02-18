-- Migration: Round Tracking System
-- Adds rounds and round_holes tables for per-round score tracking.

-- ============================================================
-- 1. Create rounds table
-- ============================================================

CREATE TABLE IF NOT EXISTS "rounds" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES "Courses"(id) ON DELETE CASCADE,
  tee_box_id      uuid REFERENCES "TeeBoxes"(id) ON DELETE SET NULL,

  -- Round metadata
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  -- Tee box snapshot (preserved even if course data changes)
  tee_color       text,
  tee_yardage     integer,
  tee_rating      numeric(4,1),
  tee_slope       integer,
  course_par      integer,

  -- Weather snapshot
  weather_temp_f  integer,
  weather_wind_mph integer,
  weather_condition text,

  -- Summary stats (computed on round completion)
  total_score     integer,
  total_putts     integer,
  front_nine_score integer,
  back_nine_score integer,
  fairways_hit    integer,
  fairways_total  integer,
  greens_in_reg   integer,
  greens_total    integer,
  holes_played    integer DEFAULT 0,
  score_to_par    integer,

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Create round_holes table
-- ============================================================

CREATE TABLE IF NOT EXISTS "round_holes" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid NOT NULL REFERENCES "rounds"(id) ON DELETE CASCADE,
  hole_number     integer NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),

  -- Core stats
  score           integer CHECK (score >= 1 AND score <= 20),
  putts           integer CHECK (putts >= 0 AND putts <= 10),
  fairway_hit     text CHECK (fairway_hit IN ('hit', 'left', 'right', 'short', 'long', 'na')),
  gir             boolean,

  -- Hole snapshot (denormalized for historical accuracy)
  par             integer,
  yardage         integer,
  handicap_index  integer,

  -- Extensible future stats
  penalties       integer DEFAULT 0,
  up_and_down     boolean,
  sand_save       boolean,
  drive_distance  integer,

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  UNIQUE(round_id, hole_number)
);

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "round_holes" ENABLE ROW LEVEL SECURITY;

-- rounds: users can only access their own
CREATE POLICY "Users can view own rounds"
  ON "rounds" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rounds"
  ON "rounds" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rounds"
  ON "rounds" FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rounds"
  ON "rounds" FOR DELETE
  USING (auth.uid() = user_id);

-- round_holes: user must own the parent round
CREATE POLICY "Users can view own round holes"
  ON "round_holes" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own round holes"
  ON "round_holes" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

CREATE POLICY "Users can update own round holes"
  ON "round_holes" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "rounds" WHERE "rounds".id = round_id AND "rounds".user_id = auth.uid()
  ));

-- ============================================================
-- 4. Updated_at triggers (reuses existing function)
-- ============================================================

CREATE TRIGGER rounds_updated_at
  BEFORE UPDATE ON "rounds"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER round_holes_updated_at
  BEFORE UPDATE ON "round_holes"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rounds_user       ON "rounds"(user_id);
CREATE INDEX IF NOT EXISTS idx_rounds_course     ON "rounds"(course_id);
CREATE INDEX IF NOT EXISTS idx_rounds_status     ON "rounds"(status);
CREATE INDEX IF NOT EXISTS idx_rounds_started_at ON "rounds"(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_holes_round ON "round_holes"(round_id);
