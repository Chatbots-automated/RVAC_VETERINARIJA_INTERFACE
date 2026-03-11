-- Fix the gea_daily_cows_joined view to properly show all cows
-- The previous version had a bug where a2 and a3 only joined if a1 had data

-- Drop the old view
DROP VIEW IF EXISTS public.gea_daily_cows_joined;

-- Create the fixed view using FULL OUTER JOINs
CREATE OR REPLACE VIEW public.gea_daily_cows_joined AS
WITH all_cows AS (
  -- Get all unique cow_number + import_id combinations from all three tables
  SELECT DISTINCT import_id, cow_number
  FROM (
    SELECT import_id, cow_number FROM public.gea_daily_ataskaita1
    UNION
    SELECT import_id, cow_number FROM public.gea_daily_ataskaita2
    UNION
    SELECT import_id, cow_number FROM public.gea_daily_ataskaita3
  ) combined
)
SELECT
  i.id as import_id,
  i.created_at as import_created_at,
  ac.cow_number,

  -- Ataskaita 1 fields
  a1.ear_number,
  a1.cow_state,
  a1.group_number,
  a1.pregnant_since,
  a1.lactation_days,
  a1.inseminated_at,
  a1.pregnant_days,
  a1.next_pregnancy_date,
  a1.days_until_waiting_pregnancy,

  -- Ataskaita 2 fields
  a2.genetic_worth,
  a2.blood_line,
  a2.avg_milk_prod_weight,
  a2.produce_milk,
  a2.last_milking_date,
  a2.last_milking_time,
  a2.last_milking_weight,
  a2.milkings,

  -- Ataskaita 3 fields
  a3.teat_missing_right_back,
  a3.teat_missing_back_left,
  a3.teat_missing_front_left,
  a3.teat_missing_front_right,
  a3.insemination_count,
  a3.bull_1,
  a3.bull_2,
  a3.bull_3,
  a3.lactation_number

FROM all_cows ac
JOIN public.gea_daily_imports i ON i.id = ac.import_id
LEFT JOIN public.gea_daily_ataskaita1 a1 ON a1.import_id = ac.import_id AND a1.cow_number = ac.cow_number
LEFT JOIN public.gea_daily_ataskaita2 a2 ON a2.import_id = ac.import_id AND a2.cow_number = ac.cow_number
LEFT JOIN public.gea_daily_ataskaita3 a3 ON a3.import_id = ac.import_id AND a3.cow_number = ac.cow_number
ORDER BY i.created_at DESC, ac.cow_number;

-- Grant permissions
GRANT SELECT ON public.gea_daily_cows_joined TO authenticated;

COMMENT ON VIEW public.gea_daily_cows_joined IS 
'Joined view of all three GEA ataskaita tables. Fixed to show all cows regardless of which tables have data.';
