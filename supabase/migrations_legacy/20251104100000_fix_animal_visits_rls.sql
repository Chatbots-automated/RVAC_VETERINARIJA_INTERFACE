/*
  # Fix Animal Visits RLS Policies

  ## Issue
  Users getting RLS policy violation when creating visits from animal detail page.

  ## Changes
  1. Drop existing policies for animal_visits
  2. Recreate with proper authenticated user access
  3. Ensure all CRUD operations are permitted for authenticated users

  ## Security
  - All authenticated users can manage visits
  - RLS is enabled to prevent anonymous access
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read visits" ON public.animal_visits;
DROP POLICY IF EXISTS "Users can insert visits" ON public.animal_visits;
DROP POLICY IF EXISTS "Users can update visits" ON public.animal_visits;
DROP POLICY IF EXISTS "Users can delete visits" ON public.animal_visits;

-- Ensure RLS is enabled
ALTER TABLE public.animal_visits ENABLE ROW LEVEL SECURITY;

-- Create new policies with explicit permissions
CREATE POLICY "Authenticated users can read all visits"
  ON public.animal_visits
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert visits"
  ON public.animal_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update all visits"
  ON public.animal_visits
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete visits"
  ON public.animal_visits
  FOR DELETE
  TO authenticated
  USING (true);
