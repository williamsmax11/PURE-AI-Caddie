-- Migration: Handicap History Tracking
-- Tracks handicap changes over time for trend analysis and charting.

-- ============================================================
-- 1. Create handicap_history table
-- ============================================================

CREATE TABLE IF NOT EXISTS "handicap_history" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  handicap_value    numeric(4,1) NOT NULL,
  method            text NOT NULL DEFAULT 'calculated'
                      CHECK (method IN ('calculated', 'onboarding_estimate')),
  round_count       integer NOT NULL DEFAULT 0,
  differential_avg  numeric(5,2),
  calculated_at     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Row Level Security
-- ============================================================

ALTER TABLE "handicap_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own handicap history"
  ON "handicap_history" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own handicap history"
  ON "handicap_history" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE — history is append-only

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_handicap_history_user
  ON "handicap_history"(user_id);

CREATE INDEX IF NOT EXISTS idx_handicap_history_calculated_at
  ON "handicap_history"(user_id, calculated_at DESC);
