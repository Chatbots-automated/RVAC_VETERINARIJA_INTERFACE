-- ============================================================================
-- ENHANCE MANUAL TIME ENTRIES WITH WORKER TYPES AND MEASUREMENTS
-- ============================================================================
-- Add support for different worker types (darbuotojas, vairuotojas, traktorininkas)
-- Add lunch deduction tracking
-- Add work description and measurement tracking
-- ============================================================================

-- 1. Create measurement_units table for dynamic unit management
CREATE TABLE IF NOT EXISTS measurement_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_location text NOT NULL CHECK (work_location IN ('farm', 'warehouse', 'both')),
  worker_type text NOT NULL CHECK (worker_type IN ('vairuotojas', 'traktorininkas')),
  unit_name text NOT NULL,
  unit_abbreviation text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(work_location, worker_type, unit_name)
);

-- Add indexes for measurement_units
CREATE INDEX idx_measurement_units_location ON measurement_units(work_location);
CREATE INDEX idx_measurement_units_type ON measurement_units(worker_type);
CREATE INDEX idx_measurement_units_active ON measurement_units(is_active);

-- Comments for measurement_units
COMMENT ON TABLE measurement_units IS 'Dynamic measurement units for drivers and tractor operators';
COMMENT ON COLUMN measurement_units.worker_type IS 'Type of worker: vairuotojas (driver) or traktorininkas (tractor operator)';
COMMENT ON COLUMN measurement_units.unit_name IS 'Full name of the unit (e.g., "Priekaba", "Tona", "Kibiras")';
COMMENT ON COLUMN measurement_units.unit_abbreviation IS 'Short abbreviation (e.g., "prk", "t", "kib")';

-- Enable RLS
ALTER TABLE measurement_units ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now
CREATE POLICY "Allow all operations on measurement_units"
  ON measurement_units
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Add new columns to manual_time_entries
ALTER TABLE manual_time_entries 
  ADD COLUMN IF NOT EXISTS worker_type text DEFAULT 'darbuotojas' CHECK (worker_type IN ('darbuotojas', 'vairuotojas', 'traktorininkas')),
  ADD COLUMN IF NOT EXISTS lunch_type text DEFAULT 'full' CHECK (lunch_type IN ('none', 'half', 'full')),
  ADD COLUMN IF NOT EXISTS work_description text,
  ADD COLUMN IF NOT EXISTS measurement_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS measurement_unit_id uuid REFERENCES measurement_units(id);

-- Update the hours_worked calculation to account for lunch deduction
-- Drop the old generated column
ALTER TABLE manual_time_entries DROP COLUMN IF EXISTS hours_worked;

-- Add new hours_worked column with lunch deduction logic
ALTER TABLE manual_time_entries ADD COLUMN hours_worked numeric(5,2) GENERATED ALWAYS AS (
  CASE 
    WHEN lunch_type = 'full' THEN 
      GREATEST(0, (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) - 1)
    WHEN lunch_type = 'half' THEN 
      GREATEST(0, (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) - 0.5)
    ELSE 
      EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  END
) STORED;

-- Comments for new columns
COMMENT ON COLUMN manual_time_entries.worker_type IS 'Type of worker: darbuotojas (regular), vairuotojas (driver), traktorininkas (tractor operator)';
COMMENT ON COLUMN manual_time_entries.lunch_type IS 'Lunch deduction: none (no lunch), half (30min), full (1 hour)';
COMMENT ON COLUMN manual_time_entries.work_description IS 'Description of work performed (for darbuotojas)';
COMMENT ON COLUMN manual_time_entries.measurement_value IS 'Measurement value (km for drivers, hectares for tractor operators)';
COMMENT ON COLUMN manual_time_entries.measurement_unit_id IS 'Reference to measurement unit (for vairuotojas and traktorininkas)';
COMMENT ON COLUMN manual_time_entries.hours_worked IS 'Automatically calculated hours with lunch deduction applied';

-- 3. Insert default measurement units
INSERT INTO measurement_units (work_location, worker_type, unit_name, unit_abbreviation) VALUES
  -- Driver units
  ('both', 'vairuotojas', 'Kilometrai', 'km'),
  ('both', 'vairuotojas', 'Priekaba', 'prk'),
  ('both', 'vairuotojas', 'Tona', 't'),
  ('both', 'vairuotojas', 'Kibiras', 'kib'),
  ('both', 'vairuotojas', 'Reisas', 'reis'),
  
  -- Tractor operator units
  ('both', 'traktorininkas', 'Hektarai', 'ha'),
  ('both', 'traktorininkas', 'Priekaba', 'prk'),
  ('both', 'traktorininkas', 'Tona', 't'),
  ('both', 'traktorininkas', 'Kibiras', 'kib'),
  ('both', 'traktorininkas', 'Reisas', 'reis')
ON CONFLICT (work_location, worker_type, unit_name) DO NOTHING;

-- 4. Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_measurement_units_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER measurement_units_updated_at
  BEFORE UPDATE ON measurement_units
  FOR EACH ROW
  EXECUTE FUNCTION update_measurement_units_updated_at();
