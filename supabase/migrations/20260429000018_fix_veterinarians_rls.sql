-- =====================================================================
-- Fix Veterinarians RLS Policies
-- =====================================================================
-- Migration: 20260429000018
-- Created: 2026-04-29
--
-- PROBLEM:
-- RLS policy is blocking inserts with error:
-- "new row violates row-level security policy for table veterinarians"
--
-- SOLUTION:
-- Drop and recreate RLS policies with proper permissions
-- =====================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Veterinarians are viewable by authenticated users" ON public.veterinarians;
DROP POLICY IF EXISTS "Veterinarians are insertable by authenticated users" ON public.veterinarians;
DROP POLICY IF EXISTS "Veterinarians are updatable by authenticated users" ON public.veterinarians;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.veterinarians;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.veterinarians;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.veterinarians;

-- Create policies that allow all operations (custom auth system)
CREATE POLICY "Allow all operations on veterinarians"
    ON public.veterinarians
    USING (true)
    WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE public.veterinarians ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon and authenticated roles
GRANT ALL ON public.veterinarians TO anon;
GRANT ALL ON public.veterinarians TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
