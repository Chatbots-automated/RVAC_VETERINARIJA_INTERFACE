/*
  # Fix Worker Schedules RLS

  This migration disables RLS on worker_schedules table to align with the custom authentication system used by this application.
  
  The application uses a custom authentication system with the `users` table, not Supabase's built-in auth,
  so the `authenticated` role policies don't work. Core tables like animals, products, treatments, etc. 
  also have RLS disabled for this reason.
*/

ALTER TABLE worker_schedules DISABLE ROW LEVEL SECURITY;

-- Drop existing policies since we're disabling RLS
DROP POLICY IF EXISTS "Authenticated users can view schedules" ON worker_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert schedules" ON worker_schedules;
DROP POLICY IF EXISTS "Authenticated users can update schedules" ON worker_schedules;
DROP POLICY IF EXISTS "Authenticated users can delete schedules" ON worker_schedules;
