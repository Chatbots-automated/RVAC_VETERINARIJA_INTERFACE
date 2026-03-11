-- =====================================================
-- VERIFY AND FIX RLS POLICIES
-- Run this in Supabase SQL Editor
-- =====================================================

-- First, let's check if the table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'work_descriptions'
);

-- Check current policies
SELECT * FROM pg_policies WHERE tablename = 'work_descriptions';

-- Now let's completely reset the RLS policies
ALTER TABLE work_descriptions DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to insert work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to update work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to delete work_descriptions" ON work_descriptions;

-- Re-enable RLS
ALTER TABLE work_descriptions ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies
CREATE POLICY "work_descriptions_select_policy"
  ON work_descriptions FOR SELECT
  USING (true);

CREATE POLICY "work_descriptions_insert_policy"
  ON work_descriptions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "work_descriptions_update_policy"
  ON work_descriptions FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "work_descriptions_delete_policy"
  ON work_descriptions FOR DELETE
  USING (true);

-- Grant all permissions to authenticated users
GRANT ALL ON TABLE work_descriptions TO authenticated;
GRANT ALL ON TABLE work_descriptions TO anon;
GRANT ALL ON TABLE work_descriptions TO service_role;

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'work_descriptions';

-- Test insert (this should work)
INSERT INTO work_descriptions (work_location, worker_type, description) 
VALUES ('farm', 'vairuotojas', 'TEST - Delete me')
RETURNING *;

-- If the above worked, delete the test row
DELETE FROM work_descriptions WHERE description = 'TEST - Delete me';

-- =====================================================
-- If you see the test row inserted and deleted, it works!
-- =====================================================
