/*
  # Update Teat Analytics View

  1. Changes
    - Update `vw_teat_treatment_analytics` view to use new `sick_teats` and `affected_teats` JSONB columns
    - Expand JSONB arrays so each teat gets its own row
    - Maintain backward compatibility with old `mastitis_teat` column

  2. Notes
    - This view now properly tracks treatments by individual teats
    - Uses JSONB array expansion for better analytics
*/

-- Drop and recreate the teat treatment analytics view with new columns
DROP VIEW IF EXISTS public.vw_teat_treatment_analytics;

CREATE OR REPLACE VIEW public.vw_teat_treatment_analytics AS
WITH teat_treatments AS (
  -- Get treatments with sick_teats (new system)
  SELECT
    t.animal_id,
    a.tag_no,
    jsonb_array_elements_text(COALESCE(t.sick_teats, '[]'::jsonb)) as teat,
    t.mastitis_type,
    t.outcome,
    t.reg_date,
    t.id as treatment_id
  FROM public.treatments t
  JOIN public.animals a ON a.id = t.animal_id
  WHERE t.sick_teats IS NOT NULL
    AND jsonb_array_length(COALESCE(t.sick_teats, '[]'::jsonb)) > 0

  UNION ALL

  -- Get treatments with old mastitis_teat column (backward compatibility)
  SELECT
    t.animal_id,
    a.tag_no,
    t.mastitis_teat as teat,
    t.mastitis_type,
    t.outcome,
    t.reg_date,
    t.id as treatment_id
  FROM public.treatments t
  JOIN public.animals a ON a.id = t.animal_id
  WHERE t.mastitis_teat IS NOT NULL
    AND (t.sick_teats IS NULL OR jsonb_array_length(COALESCE(t.sick_teats, '[]'::jsonb)) = 0)
)
SELECT
  animal_id,
  tag_no,
  teat,
  COUNT(*) as treatment_count,
  COUNT(CASE WHEN mastitis_type = 'new' THEN 1 END) as new_case_count,
  COUNT(CASE WHEN mastitis_type = 'recurring' THEN 1 END) as recurring_case_count,
  COUNT(CASE WHEN outcome = 'recovered' THEN 1 END) as recovered_count,
  COUNT(CASE WHEN outcome = 'ongoing' THEN 1 END) as ongoing_count,
  MIN(reg_date) as first_treatment_date,
  MAX(reg_date) as last_treatment_date
FROM teat_treatments
GROUP BY animal_id, tag_no, teat;
