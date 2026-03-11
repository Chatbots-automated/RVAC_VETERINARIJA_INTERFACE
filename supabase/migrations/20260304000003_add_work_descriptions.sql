-- Add work_descriptions table for user-created work descriptions
CREATE TABLE IF NOT EXISTS work_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_location TEXT NOT NULL CHECK (work_location IN ('farm', 'warehouse')),
  worker_type TEXT NOT NULL CHECK (worker_type IN ('vairuotojas', 'traktorininkas')),
  description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies
ALTER TABLE work_descriptions ENABLE ROW LEVEL SECURITY;

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
  USING (true);

CREATE POLICY "Allow authenticated users to delete work_descriptions"
  ON work_descriptions FOR DELETE
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER set_work_descriptions_updated_at
  BEFORE UPDATE ON work_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default work descriptions
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
  ('warehouse', 'traktorininkas', 'Iškrovimas');

-- Add work_description_id column to manual_time_entries (optional FK to work_descriptions)
ALTER TABLE manual_time_entries 
  ADD COLUMN IF NOT EXISTS work_description_id UUID REFERENCES work_descriptions(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_work_descriptions_location_type 
  ON work_descriptions(work_location, worker_type, is_active);
