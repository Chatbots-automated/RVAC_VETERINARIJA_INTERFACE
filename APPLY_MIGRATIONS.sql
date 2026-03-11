-- =====================================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- =====================================================

-- 1. Create work_descriptions table
CREATE TABLE IF NOT EXISTS work_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_location TEXT NOT NULL CHECK (work_location IN ('farm', 'warehouse')),
  worker_type TEXT NOT NULL CHECK (worker_type IN ('vairuotojas', 'traktorininkas')),
  description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE work_descriptions ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to insert work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to update work_descriptions" ON work_descriptions;
DROP POLICY IF EXISTS "Allow authenticated users to delete work_descriptions" ON work_descriptions;

-- 4. Create RLS policies
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

-- 5. Grant permissions
GRANT ALL ON work_descriptions TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 6. Add updated_at trigger
CREATE TRIGGER set_work_descriptions_updated_at
  BEFORE UPDATE ON work_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Insert default work descriptions
INSERT INTO work_descriptions (work_location, worker_type, description) VALUES
  ('farm', 'vairuotojas', 'Žemės darbai'),
  ('farm', 'vairuotojas', 'Transportavimas'),
  ('farm', 'vairuotojas', 'Šieno vežimas'),
  ('farm', 'vairuotojas', 'Grūdų vežimas'),
  ('farm', 'traktorininkas', 'Arimas'),
  ('farm', 'traktorininkas', 'Kultivavimas'),
  ('farm', 'traktorininkas', 'Sėja'),
  ('farm', 'traktorininkas', 'Pjovimas'),
  ('warehouse', 'vairuotojas', 'Pristatymas'),
  ('warehouse', 'vairuotojas', 'Pervežimas'),
  ('warehouse', 'traktorininkas', 'Pakrovimas'),
  ('warehouse', 'traktorininkas', 'Iškrovimas')
ON CONFLICT DO NOTHING;

-- 8. Add work_description_id column to manual_time_entries
ALTER TABLE manual_time_entries 
  ADD COLUMN IF NOT EXISTS work_description_id UUID REFERENCES work_descriptions(id) ON DELETE SET NULL;

-- 9. Create index
CREATE INDEX IF NOT EXISTS idx_work_descriptions_location_type 
  ON work_descriptions(work_location, worker_type, is_active);

-- 10. Add requires_login column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS requires_login BOOLEAN DEFAULT true;

-- 11. Update existing users
UPDATE users SET requires_login = true WHERE requires_login IS NULL;

-- 12. Add comment
COMMENT ON COLUMN users.requires_login IS 'Whether the user needs email/password to sign in. False for workers who only appear in schedules.';

-- =====================================================
-- DONE! Refresh your app after running this.
-- =====================================================
