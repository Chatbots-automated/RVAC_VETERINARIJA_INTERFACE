-- ============================================================================
-- CREATE MANUAL TIME ENTRIES TABLE
-- ============================================================================
-- This table stores manually entered time records from paper timesheets
-- Workers will be able to access this in the future
-- ============================================================================

CREATE TABLE IF NOT EXISTS manual_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  hours_worked numeric(5,2) GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  ) STORED,
  notes text,
  entered_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_manual_time_entries_worker ON manual_time_entries(worker_id);
CREATE INDEX idx_manual_time_entries_date ON manual_time_entries(entry_date);
CREATE INDEX idx_manual_time_entries_worker_date ON manual_time_entries(worker_id, entry_date);

-- Comments
COMMENT ON TABLE manual_time_entries IS 'Manual time entries from paper timesheets - accessible by workers in future';
COMMENT ON COLUMN manual_time_entries.worker_id IS 'Worker who performed the work';
COMMENT ON COLUMN manual_time_entries.entry_date IS 'Date of work';
COMMENT ON COLUMN manual_time_entries.start_time IS 'Work start time (e.g., 08:19)';
COMMENT ON COLUMN manual_time_entries.end_time IS 'Work end time (e.g., 18:53)';
COMMENT ON COLUMN manual_time_entries.hours_worked IS 'Automatically calculated hours';
COMMENT ON COLUMN manual_time_entries.entered_by IS 'Admin/secretary who entered the data';

-- Enable RLS (for future worker access)
ALTER TABLE manual_time_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (since we use custom auth)
-- In the future, this can be restricted based on worker_id
CREATE POLICY "Allow all operations on manual_time_entries"
  ON manual_time_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);
