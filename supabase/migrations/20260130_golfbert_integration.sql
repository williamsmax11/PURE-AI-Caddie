-- Migration: Golfbert API Integration
-- Adds support for Golfbert course IDs, per-tee data, and per-hole tee-specific coordinates.

-- ============================================================
-- 1. Add Golfbert columns to existing tables
-- ============================================================

ALTER TABLE "Courses"
  ADD COLUMN IF NOT EXISTS golfbert_id integer UNIQUE,
  ADD COLUMN IF NOT EXISTS golfbert_synced_at timestamptz;

ALTER TABLE "Holes"
  ADD COLUMN IF NOT EXISTS golfbert_id integer UNIQUE;

ALTER TABLE "HolePolygon"
  ADD COLUMN IF NOT EXISTS golfbert_surface_type text;

-- ============================================================
-- 2. Create TeeBoxes table
-- ============================================================

CREATE TABLE IF NOT EXISTS "TeeBoxes" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES "Courses"(id) ON DELETE CASCADE,
  tee_color      text NOT NULL,
  tee_color_hex  text,
  tee_type       text,
  total_yardage  integer,
  course_rating  numeric(4,1),
  slope_rating   integer,
  par_total      integer,
  sort_order     integer DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(course_id, tee_color)
);

-- ============================================================
-- 3. Create HoleTeeData table
-- ============================================================

CREATE TABLE IF NOT EXISTS "HoleTeeData" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id        uuid NOT NULL REFERENCES "Holes"(id) ON DELETE CASCADE,
  tee_box_id     uuid NOT NULL REFERENCES "TeeBoxes"(id) ON DELETE CASCADE,
  yardage        integer,
  par            integer,
  handicap_index integer,
  tee_latitude   double precision,
  tee_longitude  double precision,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(hole_id, tee_box_id)
);

-- ============================================================
-- 4. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_teeboxes_course     ON "TeeBoxes"(course_id);
CREATE INDEX IF NOT EXISTS idx_holeteedata_hole     ON "HoleTeeData"(hole_id);
CREATE INDEX IF NOT EXISTS idx_holeteedata_teebox   ON "HoleTeeData"(tee_box_id);
CREATE INDEX IF NOT EXISTS idx_courses_golfbert     ON "Courses"(golfbert_id);
CREATE INDEX IF NOT EXISTS idx_holes_golfbert       ON "Holes"(golfbert_id);
CREATE INDEX IF NOT EXISTS idx_courses_latlong      ON "Courses"(latitude, longitude);
