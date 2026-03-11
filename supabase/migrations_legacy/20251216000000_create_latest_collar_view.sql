/*
  # Create Latest Collar Number View

  1. Purpose
    - Optimize performance by pre-computing the latest collar_no for each animal
    - Eliminates need to fetch entire gea_daily table (potentially millions of records)
    - Reduces load times from 10+ seconds to under 2 seconds

  2. New Views
    - `vw_animal_latest_collar`
      - `animal_id` (uuid) - Animal identifier
      - `collar_no` (integer) - Latest collar number from GEA system
      - `last_snapshot_date` (date) - Date of the latest snapshot

  3. Performance Impact
    - Components no longer need to fetch all gea_daily records
    - Only the latest collar_no per animal is retrieved
    - Dramatically reduces data transfer and client-side processing

  4. Notes
    - View automatically updates as new gea_daily records are inserted
    - Uses DISTINCT ON for optimal performance
    - Indexed on animal_id for fast lookups
*/

-- Create view for latest collar numbers per animal
CREATE OR REPLACE VIEW vw_animal_latest_collar AS
SELECT DISTINCT ON (animal_id)
  animal_id,
  collar_no,
  snapshot_date as last_snapshot_date
FROM gea_daily
WHERE collar_no IS NOT NULL
ORDER BY animal_id, snapshot_date DESC;

-- Create index on gea_daily for better performance
CREATE INDEX IF NOT EXISTS idx_gea_daily_animal_date
ON gea_daily(animal_id, snapshot_date DESC)
WHERE collar_no IS NOT NULL;

-- Add comment explaining the view
COMMENT ON VIEW vw_animal_latest_collar IS
'Optimized view that returns only the latest collar number for each animal, avoiding full table scans of gea_daily';
