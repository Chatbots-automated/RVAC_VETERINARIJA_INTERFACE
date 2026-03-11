-- Create view to get latest collar numbers for all animals from new GEA system
-- This replaces the missing vw_animal_latest_collar view

CREATE OR REPLACE VIEW public.vw_animal_latest_collar AS
WITH latest_imports AS (
  -- Get the most recent import for each animal (by ear_number)
  SELECT DISTINCT ON (a.id)
    a.id as animal_id,
    g.cow_number::integer as collar_no,
    g.import_created_at
  FROM public.animals a
  INNER JOIN public.gea_daily_cows_joined g 
    ON g.ear_number = a.tag_no
  WHERE g.cow_number IS NOT NULL
    AND g.cow_number ~ '^[0-9]+$'  -- Only numeric collar numbers
  ORDER BY a.id, g.import_created_at DESC
)
SELECT 
  animal_id,
  collar_no
FROM latest_imports;

-- Grant permissions
GRANT SELECT ON public.vw_animal_latest_collar TO authenticated;
GRANT SELECT ON public.vw_animal_latest_collar TO anon;
GRANT SELECT ON public.vw_animal_latest_collar TO service_role;

COMMENT ON VIEW public.vw_animal_latest_collar IS 
'Optimized view to get the latest collar number (cow_number) for each animal from GEA imports. 
Joins animals with gea_daily_cows_joined using ear_number = tag_no.';
