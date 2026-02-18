-- Migration: Auth profiles and license tier support
-- Creates profiles table linked to Supabase auth.users

-- ============================================================
-- 1. Create profiles table
-- ============================================================

CREATE TABLE IF NOT EXISTS "profiles" (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 text NOT NULL,
  name                  text,
  handicap              text,
  frequency             text,
  goal                  text,
  license_tier          text NOT NULL DEFAULT 'free',
  onboarding_completed  boolean NOT NULL DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Enable Row Level Security
-- ============================================================

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON "profiles" FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON "profiles" FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON "profiles" FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 3. Auto-create profile on signup via trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. Updated_at auto-update trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON "profiles"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON "profiles"(email);
CREATE INDEX IF NOT EXISTS idx_profiles_license_tier ON "profiles"(license_tier);
