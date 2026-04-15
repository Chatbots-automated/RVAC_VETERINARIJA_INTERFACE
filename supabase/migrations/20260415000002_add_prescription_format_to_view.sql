-- =====================================================================
-- Add Prescription Format to Treatment View
-- =====================================================================
-- Created: 2026-04-15
-- Description:
--   Adds a formatted prescription field (prescription_text) to
--   vw_treated_animals_detailed that follows the official format:
--   
--   Rp.: [Medicine Name]
--   D.t.d.N [Total Amount] [Unit]
--   S. [Route] suleisti [Amount] [Unit]
-- =====================================================================

-- Drop and recreate view to add new column
DROP VIEW IF EXISTS public.vw_treated_animals_detailed CASCADE;

CREATE VIEW public.vw_treated_animals_detailed AS
-- Medications from usage_items (one-time usage)
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
    ui.unit,
    ui.administration_route,
    1 AS days,
    -- Aliases for report compatibility
    p.name AS medicine_name,
    ui.qty AS medicine_dose,
    ui.unit AS medicine_unit,
    1 AS medicine_days,
    b.batch_number,
    -- NEW: Formatted prescription text
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', ui.qty::text, ' ', ui.unit, E'\n',
        'S. ', COALESCE(ui.administration_route, '-'), ' suleisti ', ui.qty::text, ' ', ui.unit
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
    t.created_by_user_id,
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

-- Medications from treatment_courses (multi-day treatments)
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
    tc.product_id,
    p.name AS product_name,
    p.category AS product_category,
    p.registration_code,
    p.active_substance,
    SUM(ui.qty) AS quantity,
    ui.unit,
    ui.administration_route,
    tc.days,
    -- Aliases for report compatibility
    p.name AS medicine_name,
    SUM(ui.qty) AS medicine_dose,
    ui.unit AS medicine_unit,
    tc.days AS medicine_days,
    b.batch_number,
    -- NEW: Formatted prescription text for courses
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', SUM(ui.qty)::text, ' ', ui.unit, E'\n',
        'S. ', COALESCE(ui.administration_route, '-'), ' suleisti ', (SUM(ui.qty) / tc.days)::numeric(10,2)::text, ' ', ui.unit, ' × ', tc.days::text, ' d.'
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
    t.created_by_user_id,
    t.created_at
FROM public.treatments t
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.animal_visits av ON t.visit_id = av.id
INNER JOIN public.treatment_courses tc ON tc.treatment_id = t.id
LEFT JOIN public.usage_items ui ON ui.treatment_id = t.id AND ui.product_id = tc.product_id
LEFT JOIN public.products p ON tc.product_id = p.id
LEFT JOIN public.batches b ON ui.batch_id = b.id
GROUP BY 
    t.farm_id, t.id, t.animal_id, a.tag_no, a.species, a.sex, a.birth_date,
    a.holder_name, a.holder_address, t.reg_date, av.visit_datetime,
    t.first_symptoms_date, av.temperature, t.tests, t.animal_condition,
    t.clinical_diagnosis, d.name, tc.product_id, p.name, p.category,
    p.registration_code, p.active_substance, ui.unit, ui.administration_route,
    tc.days, b.batch_number, t.withdrawal_until_meat, t.withdrawal_until_milk,
    t.outcome, t.outcome_date, t.vet_name, t.notes, t.created_by_user_id, t.created_at,
    ui.administered_date;

COMMENT ON VIEW public.vw_treated_animals_detailed IS 'Detailed view of treated animals with medications, withdrawal periods, and formatted prescription text (Rp. format)';
