-- Add comments and non_driving_hours to manual_time_entries
ALTER TABLE manual_time_entries 
  ADD COLUMN IF NOT EXISTS comments TEXT,
  ADD COLUMN IF NOT EXISTS non_driving_hours NUMERIC(5,2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN manual_time_entries.comments IS 'Comments or notes for the work day';
COMMENT ON COLUMN manual_time_entries.non_driving_hours IS 'Hours spent not driving (for vairuotojas) - these are the hours that count for payment';

-- First, check if hours_worked exists and drop it
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'manual_time_entries' 
    AND column_name = 'hours_worked'
  ) THEN
    ALTER TABLE manual_time_entries DROP COLUMN hours_worked CASCADE;
  END IF;
END $$;

-- Add the new hours_worked generated column with vairuotojas logic
ALTER TABLE manual_time_entries ADD COLUMN hours_worked NUMERIC(5,2) GENERATED ALWAYS AS (
  CASE 
    -- For vairuotojas, use non_driving_hours instead of calculated hours
    WHEN worker_type = 'vairuotojas' THEN COALESCE(non_driving_hours, 0)
    -- For others, calculate from start/end time with lunch deduction
    ELSE
      CASE 
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN
          GREATEST(0, 
            EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 - 
            CASE lunch_type
              WHEN 'full' THEN 1
              WHEN 'half' THEN 0.5
              ELSE 0
            END
          )
        ELSE 0
      END
  END
) STORED;

COMMENT ON COLUMN manual_time_entries.hours_worked IS 'Calculated hours: for vairuotojas uses non_driving_hours, for others calculated from start/end with lunch deduction';
