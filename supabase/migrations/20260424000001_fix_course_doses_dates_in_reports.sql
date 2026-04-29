-- =====================================================================
-- Fix Course Doses Dates in Reports
-- =====================================================================
-- Created: 2026-04-24
-- Description:
--   Fixes the issue where multi-day treatment courses show the same date
--   for all days in GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS and IŠLAUKŲ ATASKAITA.
--   
--   The problem: usage_items created from course_doses don't have the correct
--   administered_date. They all use treatment.reg_date instead of the individual
--   course_dose.scheduled_date or administered_date.
--   
--   Solution: Update the view to properly use course_dose dates for courses.
-- =====================================================================

-- Drop dependent views first
DROP VIEW IF EXISTS public.vw_treated_animals_all_farms CASCADE;
DROP VIEW IF EXISTS public.vw_treated_animals_detailed CASCADE;

-- Recreate with fixed course dose dates
CREATE VIEW public.vw_treated_animals_detailed AS

-- Branch 1: Medications from usage_items (one-time usage, NO courses)
SELECT
    t.farm_id,
    t.id AS treatment_id,
    t.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_years,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    COALESCE(ui.administered_date, t.reg_date) AS registration_date,
    t.reg_date AS treatment_start_date,
    av.visit_datetime AS visit_date,
    COALESCE(t.first_symptoms_date, DATE(av.visit_datetime), t.reg_date) AS first_symptoms_date,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    CASE
        WHEN av.temperature IS NOT NULL AND t.tests IS NOT NULL
        THEN av.temperature::text || ' °C' || E'\n' || t.tests
        WHEN av.temperature IS NOT NULL
        THEN av.temperature::text || ' °C'
        WHEN t.tests IS NOT NULL
        THEN t.tests
        ELSE NULL
    END AS tests,
    t.clinical_diagnosis,
    d.name AS disease_name,
    ui.product_id,
    p.name AS product_name,
    p.category AS product_category,
    p.registration_code,
    p.active_substance,
    ui.qty AS quantity,
    ui.unit::text AS unit,
    ui.administration_route,
    NULL::integer AS days,
    p.name AS medicine_name,
    ui.qty AS medicine_dose,
    ui.unit::text AS medicine_unit,
    NULL::integer AS medicine_days,
    b.batch_number,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', ui.qty::text, ' ', ui.unit::text, E'\n',
        'S. ', 
        CASE 
            WHEN ui.administration_route IS NOT NULL THEN ui.administration_route
            ELSE 'imm'
        END,
        ' suleisti ', ui.qty::text, ' ', ui.unit::text
    ) AS prescription_text,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    CASE 
        WHEN t.withdrawal_until_meat IS NULL THEN 0
        WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN t.withdrawal_until_milk IS NULL THEN 0
        WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN (t.withdrawal_until_milk - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    t.outcome AS treatment_outcome,
    t.outcome_date,
    COALESCE(t.vet_name, 'Nenurodyta') AS veterinarian,
    t.notes,
    'usage_item' AS medication_source,
    t.created_by_user_id::text,
    t.created_at
FROM public.treatments t
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.animal_visits av ON t.visit_id = av.id
LEFT JOIN public.usage_items ui ON ui.treatment_id = t.id
LEFT JOIN public.products p ON ui.product_id = p.id
LEFT JOIN public.batches b ON ui.batch_id = b.id
WHERE NOT EXISTS (
    SELECT 1 FROM public.treatment_courses tc WHERE tc.treatment_id = t.id
)

UNION ALL

-- Branch 2: Medications from treatment_courses (multi-day treatments)
-- FIX: Use course_dose.scheduled_date or administered_date for each day
SELECT
    t.farm_id,
    t.id AS treatment_id,
    t.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_years,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    -- FIX: Use course_dose scheduled_date or administered_date for each dose
    COALESCE(cd.administered_date, cd.scheduled_date, t.reg_date) AS registration_date,
    t.reg_date AS treatment_start_date,
    av.visit_datetime AS visit_date,
    COALESCE(t.first_symptoms_date, DATE(av.visit_datetime), t.reg_date) AS first_symptoms_date,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    CASE
        WHEN av.temperature IS NOT NULL AND t.tests IS NOT NULL
        THEN av.temperature::text || ' °C' || E'\n' || t.tests
        WHEN av.temperature IS NOT NULL
        THEN av.temperature::text || ' °C'
        WHEN t.tests IS NOT NULL
        THEN t.tests
        ELSE NULL
    END AS tests,
    t.clinical_diagnosis,
    d.name AS disease_name,
    tc.product_id,
    p.name AS product_name,
    p.category AS product_category,
    p.registration_code,
    p.active_substance,
    cd.dose_amount AS quantity,
    cd.unit::text AS unit,
    NULL AS administration_route,
    tc.days,
    p.name AS medicine_name,
    cd.dose_amount AS medicine_dose,
    cd.unit::text AS medicine_unit,
    tc.days AS medicine_days,
    b.batch_number,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', cd.dose_amount::text, ' ', cd.unit::text, ' x ', tc.days::text, ' dienų', E'\n',
        'S. suleisti ', cd.dose_amount::text, ' ', cd.unit::text
    ) AS prescription_text,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    CASE 
        WHEN t.withdrawal_until_meat IS NULL THEN 0
        WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN t.withdrawal_until_milk IS NULL THEN 0
        WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN (t.withdrawal_until_milk - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    t.outcome AS treatment_outcome,
    t.outcome_date,
    COALESCE(t.vet_name, 'Nenurodyta') AS veterinarian,
    t.notes,
    'treatment_course' AS medication_source,
    t.created_by_user_id::text,
    t.created_at
FROM public.treatments t
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.animal_visits av ON t.visit_id = av.id
INNER JOIN public.treatment_courses tc ON tc.treatment_id = t.id
INNER JOIN public.course_doses cd ON cd.course_id = tc.id
LEFT JOIN public.products p ON tc.product_id = p.id
LEFT JOIN public.batches b ON tc.batch_id = b.id

UNION ALL

-- Branch 3: Medications from synchronization protocols
-- Sync protocols don't use treatments table, they use usage_items directly
SELECT
    ui.farm_id,
    NULL::uuid AS treatment_id,
    sync.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_years,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    ui.created_at::date AS registration_date,
    ui.created_at::date AS treatment_start_date,
    av.visit_datetime AS visit_date,
    ui.created_at::date AS first_symptoms_date,
    'Patenkinama' AS animal_condition,
    NULL::text AS tests,
    'Sinchronizacijos protokolas' AS clinical_diagnosis,
    NULL::text AS disease_name,
    ui.product_id,
    p.name AS product_name,
    p.category AS product_category,
    p.registration_code,
    p.active_substance,
    ui.qty AS quantity,
    ui.unit::text AS unit,
    ui.administration_route,
    1 AS days,
    p.name AS medicine_name,
    ui.qty AS medicine_dose,
    ui.unit::text AS medicine_unit,
    1 AS medicine_days,
    b.batch_number,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', ui.qty::text, ' ', ui.unit::text, E'\n',
        'S. ', COALESCE(ui.administration_route, 'IM'), ' skirta ', ui.qty::text, ' ', ui.unit::text
    ) AS prescription_text,
    CASE 
        WHEN p.withdrawal_days_meat > 0 
        THEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE 
        WHEN p.withdrawal_days_milk > 0 
        THEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_milk,
    CASE 
        WHEN p.withdrawal_days_meat IS NULL OR p.withdrawal_days_meat = 0 THEN 0
        WHEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NULL OR p.withdrawal_days_milk = 0 THEN 0
        WHEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE
        ELSE 0
    END AS withdrawal_days_milk,
    NULL::text AS treatment_outcome,
    NULL::date AS outcome_date,
    'Nenurodyta' AS veterinarian,
    'Sinchronizacijos protokolas' AS notes,
    'synchronization' AS medication_source,
    COALESCE(av.created_by_user_id::text, '00000000-0000-0000-0000-000000000000') AS created_by_user_id,
    ui.created_at
FROM public.usage_items ui
LEFT JOIN public.batches b ON ui.batch_id = b.id
LEFT JOIN public.products p ON ui.product_id = p.id
LEFT JOIN public.farms f ON ui.farm_id = f.id
LEFT JOIN public.synchronization_steps ss ON ss.batch_id = ui.batch_id 
    AND ss.medication_product_id = ui.product_id 
    AND ss.completed = true
    AND ABS(EXTRACT(EPOCH FROM (ss.completed_at - ui.created_at))) < 10
LEFT JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.animal_visits av ON av.sync_step_id = ss.id
WHERE ui.purpose = 'synchronization'
  AND ui.treatment_id IS NULL;

COMMENT ON VIEW public.vw_treated_animals_detailed IS 'Treated animals with medications from treatments, courses (with correct dates per dose), and synchronization protocols';

-- Recreate the all_farms view
CREATE VIEW public.vw_treated_animals_all_farms AS
SELECT * FROM public.vw_treated_animals_detailed;

COMMENT ON VIEW public.vw_treated_animals_all_farms IS 'All farms view - used for cross-farm reports';

GRANT SELECT ON public.vw_treated_animals_detailed TO authenticated;
GRANT SELECT ON public.vw_treated_animals_all_farms TO authenticated;
