-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to insert work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to update work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to delete work_descriptions" ON work_descriptions;

-- Recreate RLS policies with correct permissions
CREATE POLICY "Allow authenticated users to read work_descriptions"
  ON work_descriptions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert work_descriptions"
  ON work_descriptions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update work_descriptions"
  ON work_descriptions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete work_descriptions"
  ON work_descriptions FOR DELETE
  TO authenticated
  USING (true);

-- Grant necessary permissions to authenticated role
GRANT ALL ON work_descriptions TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
