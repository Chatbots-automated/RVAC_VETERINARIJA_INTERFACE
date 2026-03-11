/*
  # User Profiles and Roles System

  1. New Tables
    - `user_profiles`
      - `user_id` (uuid, primary key, references auth.users)
      - `role` (text, check constraint for valid roles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Roles
    - `admin`: Full access to everything including user management and settings
    - `vet`: Full veterinary system access including treatments and records
    - `tech`: Can receive stock, manage biocides, and waste; cannot delete records
    - `viewer`: Read-only access to all modules
  
  3. Security
    - Enable RLS on `user_profiles` table
    - Add policy for users to read their own profile
    - Add policy for admins to manage all profiles
    - Add policy for authenticated users to view other profiles (for UI filtering)
  
  4. Functions
    - Trigger to create default profile when user is created
    - Function to check user role
  
  5. Important Notes
    - First user created will be set as admin automatically
    - UI and service layer will enforce role-based restrictions
    - Future: Add org_id for multi-tenant strict RLS
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'vet', 'tech', 'viewer')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Authenticated users can view other profiles (needed for UI)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can update any profile
CREATE POLICY "Admins can update profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON public.user_profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Function to automatically create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_count integer;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM public.user_profiles;
  
  -- If this is the first user, make them admin, otherwise default to viewer
  INSERT INTO public.user_profiles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN user_count = 0 THEN 'admin' ELSE 'viewer' END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Function to get user role (helper for queries)
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
RETURNS text AS $$
  SELECT role FROM public.user_profiles WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = user_uuid AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.user_profiles'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;
