-- Course Images table for user-uploaded course photos
-- Separate from Courses table to avoid conflicts with Golfbert API sync

CREATE TABLE IF NOT EXISTS CourseImages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES "Courses"(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fetching images by course
CREATE INDEX IF NOT EXISTS idx_course_images_course ON CourseImages(course_id);

-- Partial index for quickly finding featured image per course
CREATE INDEX IF NOT EXISTS idx_course_images_featured ON CourseImages(course_id, is_featured) WHERE is_featured = true;

-- Index for ordering by upload date
CREATE INDEX IF NOT EXISTS idx_course_images_created ON CourseImages(course_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE CourseImages ENABLE ROW LEVEL SECURITY;

-- Anyone can view course images (public read)
CREATE POLICY "Anyone can view course images"
  ON CourseImages
  FOR SELECT
  USING (true);

-- Authenticated users can upload images
CREATE POLICY "Authenticated users can upload course images"
  ON CourseImages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete their own uploads
CREATE POLICY "Users can delete own uploads"
  ON CourseImages
  FOR DELETE
  USING (auth.uid() = uploaded_by);

-- Note: is_featured updates should be done via service role (admin)
-- or create a separate admin policy if needed
