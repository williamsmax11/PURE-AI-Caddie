-- Fix: Add missing unique constraints that weren't created when tables already existed

-- TeeBoxes unique constraint for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teeboxes_course_color_unique'
  ) THEN
    ALTER TABLE "TeeBoxes" ADD CONSTRAINT teeboxes_course_color_unique UNIQUE(course_id, tee_color);
  END IF;
END $$;

-- HoleTeeData unique constraint for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'holeteedata_hole_teebox_unique'
  ) THEN
    ALTER TABLE "HoleTeeData" ADD CONSTRAINT holeteedata_hole_teebox_unique UNIQUE(hole_id, tee_box_id);
  END IF;
END $$;

-- Courses golfbert_id unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_golfbert_id_unique'
  ) THEN
    ALTER TABLE "Courses" ADD CONSTRAINT courses_golfbert_id_unique UNIQUE(golfbert_id);
  END IF;
END $$;

-- Holes golfbert_id unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'holes_golfbert_id_unique'
  ) THEN
    ALTER TABLE "Holes" ADD CONSTRAINT holes_golfbert_id_unique UNIQUE(golfbert_id);
  END IF;
END $$;
