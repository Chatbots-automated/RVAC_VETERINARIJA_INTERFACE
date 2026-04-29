-- Fix multi-day treatment course dates in reports
-- The issue: Multi-day courses create animal_visits with planned_medications (JSONB)
-- but don't create treatment_courses/course_doses records.
-- The current view only reads from treatment_courses (Branch 2) or synchronization (Branch 3).
-- Solution: Add Branch 4 to handle animal_visits with planned_medications.
-- 
-- Update 2026-04-29: Added withdrawal_until_meat and withdrawal_until_milk date columns
-- to all branches. These are required by the frontend TreatedAnimalsReport component
-- which checks for these date values to display withdrawal information properly.

DROP VIEW IF EXISTS public.vw_treated_animals_detailed CASCADE;

CREATE OR REPLACE VIEW public.vw_treated_animals_detailed AS

-- Branch 1: Medications from usage_items (single treatments)
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
    COALESCE(av.temperature, 0.0) AS body_temperature,
    d.id AS disease_id,
    COALESCE(d.name, t.clinical_diagnosis, 'Nespecifikuota liga') AS disease_name,
    t.clinical_diagnosis,
    t.tests AS tests_performed,
    p.id AS product_id,
    p.name AS product_name,
    p.category AS product_category,
    ui.qty AS quantity_used,
    COALESCE(ui.unit::text, p.primary_pack_unit::text, 'ml') AS unit,
    ui.purpose AS medication_purpose,
    ui.teat AS teat_position,
    b.lot AS batch_lot,
    b.batch_number,
    b.expiry_date AS batch_expiry,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', COALESCE(ui.qty::text, '?'), ' ', COALESCE(ui.unit::text, p.primary_pack_unit::text, 'ml'), E'\n',
        'S. ', COALESCE(ui.administration_route, 'imm'), ' skirta ', COALESCE(ui.qty::text, '?'), ' ', COALESCE(ui.unit::text, p.primary_pack_unit::text, 'ml')
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

-- Branch 2: Medications from treatment_courses (multi-day treatments via treatment_courses table)
-- Note: This branch may be legacy - most multi-day courses now use animal_visits
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
    COALESCE(cd.administered_date, cd.scheduled_date, t.reg_date) AS registration_date,
    t.reg_date AS treatment_start_date,
    av.visit_datetime AS visit_date,
    COALESCE(t.first_symptoms_date, DATE(av.visit_datetime), t.reg_date) AS first_symptoms_date,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    COALESCE(av.temperature, 0.0) AS body_temperature,
    d.id AS disease_id,
    COALESCE(d.name, t.clinical_diagnosis, 'Nespecifikuota liga') AS disease_name,
    t.clinical_diagnosis,
    t.tests AS tests_performed,
    p.id AS product_id,
    p.name AS product_name,
    p.category AS product_category,
    cd.dose_amount AS quantity_used,
    COALESCE(cd.unit::text, p.primary_pack_unit::text, 'ml') AS unit,
    'Gydymas' AS medication_purpose,
    NULL::text AS teat_position,
    b.lot AS batch_lot,
    b.batch_number,
    b.expiry_date AS batch_expiry,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', COALESCE(cd.dose_amount::text, '?'), ' ', COALESCE(cd.unit::text, p.primary_pack_unit::text, 'ml'), E'\n',
        'S. imm skirta ', COALESCE(cd.dose_amount::text, '?'), ' ', COALESCE(cd.unit::text, p.primary_pack_unit::text, 'ml')
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
INNER JOIN public.treatment_courses tc ON tc.treatment_id = t.id
INNER JOIN public.course_doses cd ON cd.course_id = tc.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.animal_visits av ON t.visit_id = av.id
LEFT JOIN public.batches b ON tc.batch_id = b.id
LEFT JOIN public.products p ON b.product_id = p.id

UNION ALL

-- Branch 3: Medications from synchronization protocols
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
    COALESCE(av.temperature, 0.0) AS body_temperature,
    NULL::uuid AS disease_id,
    'Sinchronizacija' AS disease_name,
    NULL::text AS clinical_diagnosis,
    NULL::text AS tests_performed,
    p.id AS product_id,
    p.name AS product_name,
    p.category AS product_category,
    ui.qty AS quantity_used,
    COALESCE(ui.unit::text, p.primary_pack_unit::text, 'ml') AS unit,
    'Sinchronizacija' AS medication_purpose,
    NULL::text AS teat_position,
    b.lot AS batch_lot,
    b.batch_number,
    b.expiry_date AS batch_expiry,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', COALESCE(ui.qty::text, '?'), ' ', COALESCE(ui.unit::text, p.primary_pack_unit::text, 'ml'), E'\n',
        'S. IM skirta ', COALESCE(ui.qty::text, '?'), ' ', COALESCE(ui.unit::text, p.primary_pack_unit::text, 'ml')
    ) AS prescription_text,
    CASE 
        WHEN p.withdrawal_days_meat IS NOT NULL AND p.withdrawal_days_meat > 0 
        THEN (ui.created_at::date + p.withdrawal_days_meat)
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NOT NULL AND p.withdrawal_days_milk > 0 
        THEN (ui.created_at::date + p.withdrawal_days_milk)
        ELSE NULL
    END AS withdrawal_until_milk,
    CASE 
        WHEN p.withdrawal_days_meat IS NULL THEN 0
        WHEN (ui.created_at::date + p.withdrawal_days_meat) >= CURRENT_DATE THEN ((ui.created_at::date + p.withdrawal_days_meat) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NULL THEN 0
        WHEN (ui.created_at::date + p.withdrawal_days_milk) >= CURRENT_DATE THEN ((ui.created_at::date + p.withdrawal_days_milk) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    NULL::text AS treatment_outcome,
    NULL::date AS outcome_date,
    COALESCE(av.vet_name, 'Nenurodyta') AS veterinarian,
    'Sinchronizacijos protokolas' AS notes,
    'synchronization' AS medication_source,
    COALESCE(av.created_by_user_id::text, '00000000-0000-0000-0000-000000000000') AS created_by_user_id,
    ui.created_at
FROM public.usage_items ui
LEFT JOIN public.batches b ON ui.batch_id = b.id
LEFT JOIN public.products p ON ui.product_id = p.id
LEFT JOIN public.synchronization_steps ss ON ss.batch_id = ui.batch_id 
    AND ss.medication_product_id = ui.product_id 
    AND ss.completed = true
    AND ABS(EXTRACT(EPOCH FROM (ss.completed_at - ui.created_at))) < 10
LEFT JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.animal_visits av ON av.sync_step_id = ss.id
WHERE ui.purpose = 'synchronization'
  AND ui.treatment_id IS NULL
  AND ui.vaccination_id IS NULL
  AND ui.biocide_usage_id IS NULL

UNION ALL

-- Branch 4: Medications from multi-day courses stored in animal_visits.planned_medications
-- This handles the new multi-day course system that stores each day as a separate visit
SELECT
    av.farm_id,
    av.related_treatment_id AS treatment_id,
    av.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_years,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    av.visit_datetime::date AS registration_date,
    t.reg_date AS treatment_start_date,
    av.visit_datetime AS visit_date,
    COALESCE(t.first_symptoms_date, av.visit_datetime::date, t.reg_date) AS first_symptoms_date,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    COALESCE(av.temperature, 0.0) AS body_temperature,
    d.id AS disease_id,
    COALESCE(d.name, t.clinical_diagnosis, 'Nespecifikuota liga') AS disease_name,
    t.clinical_diagnosis,
    t.tests AS tests_performed,
    p.id AS product_id,
    p.name AS product_name,
    p.category AS product_category,
    COALESCE((med->>'qty')::numeric, 0) AS quantity_used,
    COALESCE(med->>'unit', p.primary_pack_unit::text, 'ml') AS unit,
    COALESCE(med->>'purpose', 'Gydymas') AS medication_purpose,
    med->>'teat' AS teat_position,
    b.lot AS batch_lot,
    b.batch_number,
    b.expiry_date AS batch_expiry,
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', COALESCE((med->>'qty')::text, '?'), ' ', COALESCE(med->>'unit', p.primary_pack_unit::text, 'ml'), E'\n',
        'S. ', COALESCE(med->>'administration_route', 'imm'), ' skirta ', COALESCE((med->>'qty')::text, '?'), ' ', COALESCE(med->>'unit', p.primary_pack_unit::text, 'ml')
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
    COALESCE(av.vet_name, t.vet_name, 'Nenurodyta') AS veterinarian,
    t.notes,
    'planned_medication' AS medication_source,
    COALESCE(av.created_by_user_id::text, t.created_by_user_id::text, '00000000-0000-0000-0000-000000000000') AS created_by_user_id,
    av.created_at
FROM public.animal_visits av
LEFT JOIN public.treatments t ON av.related_treatment_id = t.id
LEFT JOIN public.animals a ON av.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
CROSS JOIN LATERAL jsonb_array_elements(av.planned_medications) AS med
LEFT JOIN public.batches b ON (med->>'batch_id')::uuid = b.id
LEFT JOIN public.products p ON (med->>'product_id')::uuid = p.id
WHERE av.planned_medications IS NOT NULL
    AND jsonb_array_length(av.planned_medications) > 0
    AND av.sync_step_id IS NULL
    AND av.medications_processed = true
    AND av.status = 'Baigtas'
    -- Exclude visits that have already created usage_items (to avoid duplicates with Branch 1)
    AND NOT EXISTS (
        SELECT 1 FROM public.usage_items ui 
        WHERE ui.treatment_id = av.related_treatment_id
        AND ui.product_id = (med->>'product_id')::uuid
        AND ui.administered_date = av.visit_datetime::date
    );

-- Create all-farms view for VetPraktika module
CREATE OR REPLACE VIEW public.vw_treated_animals_all_farms AS
SELECT * FROM public.vw_treated_animals_detailed
ORDER BY registration_date DESC, created_at DESC;

COMMENT ON VIEW public.vw_treated_animals_all_farms IS 'All farms view - used for cross-farm reports in VetPraktika module';

-- Grant permissions
GRANT SELECT ON public.vw_treated_animals_detailed TO authenticated;
GRANT SELECT ON public.vw_treated_animals_detailed TO anon;
GRANT SELECT ON public.vw_treated_animals_all_farms TO authenticated;
GRANT SELECT ON public.vw_treated_animals_all_farms TO anon;
