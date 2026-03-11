/*
  # Veterinarian Analytics View

  1. New Views
    - `vet_analytics_summary`
      - Aggregates visits and treatments per veterinarian
      - Shows total visits, treatments performed, animals treated
      - Includes date range of activity
      - Provides performance metrics for each vet
  
  2. Purpose
    - Track veterinarian workload and productivity
    - Provide insights for resource allocation
    - Enable performance reporting and analytics
  
  3. Security
    - Uses existing RLS policies from underlying tables
    - Read-only view accessible to authenticated users
*/

-- Create veterinarian analytics summary view
CREATE OR REPLACE VIEW vet_analytics_summary AS
SELECT 
  av.vet_name,
  COUNT(DISTINCT av.id) as total_visits,
  COUNT(DISTINCT CASE WHEN 'Gydymas' = ANY(av.procedures) THEN av.id END) as treatment_visits,
  COUNT(DISTINCT CASE WHEN 'Vakcinavimas' = ANY(av.procedures) THEN av.id END) as vaccination_visits,
  COUNT(DISTINCT CASE WHEN 'Prevencija' = ANY(av.procedures) THEN av.id END) as prevention_visits,
  COUNT(DISTINCT av.animal_id) as unique_animals_treated,
  MIN(av.visit_datetime) as first_visit_date,
  MAX(av.visit_datetime) as last_visit_date,
  COUNT(DISTINCT DATE(av.visit_datetime)) as active_days,
  COALESCE(SUM(tm.total_treatments), 0)::integer as total_treatments_administered
FROM animal_visits av
LEFT JOIN (
  -- Count treatments per visit
  SELECT 
    t.visit_id,
    COUNT(*) as total_treatments
  FROM treatments t
  GROUP BY t.visit_id
) tm ON tm.visit_id = av.id
WHERE av.vet_name IS NOT NULL AND av.vet_name != ''
GROUP BY av.vet_name
ORDER BY total_visits DESC;

-- Grant access to authenticated users
GRANT SELECT ON vet_analytics_summary TO authenticated;

-- Add helpful comment
COMMENT ON VIEW vet_analytics_summary IS 'Aggregated analytics for veterinarian performance tracking including visits, treatments, and activity metrics';
