-- =====================================================================
-- Add Synchronization Protocol Medicines to Reports
-- =====================================================================
-- Created: 2026-04-29
-- Description:
--   Adds synchronization protocol medicines to vw_treated_animals_detailed
--   and withdrawal reports so they appear in:
--   - Gydomų gyvūnų registracijos žurnalas (Treated Animals Registry)
--   - Išlaukų ataskaita (Withdrawal Report)
-- =====================================================================

DROP VIEW IF EXISTS public.vw_treated_animals_detailed CASCADE;
DROP VIEW IF EXISTS public.vw_treated_animals_all_farms CASCADE;

CREATE VIEW public.vw_treated_animals_detailed AS
-- Branch 1: Medications from usage_items (one-time usage)
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
    1 AS days,
    -- Aliases for report compatibility
    p.name AS medicine_name,
    ui.qty AS medicine_dose,
    ui.unit::text AS medicine_unit,
    1 AS medicine_days,
    b.batch_number,
    -- Formatted prescription text
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', ui.qty::text, ' ', ui.unit::text, E'\n',
        'S. ', COALESCE(ui.administration_route, '-'), ' skirta ', ui.qty::text, ' ', ui.unit::text
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

-- Branch 2: Medications from treatment_courses (multi-day treatments)
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
    ui.unit::text AS unit,
    ui.administration_route,
    tc.days,
    -- Aliases for report compatibility
    p.name AS medicine_name,
    SUM(ui.qty) AS medicine_dose,
    ui.unit::text AS medicine_unit,
    tc.days AS medicine_days,
    b.batch_number,
    -- Formatted prescription text for courses
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', SUM(ui.qty)::text, ' ', ui.unit::text, E'\n',
        'S. ', COALESCE(ui.administration_route, '-'), ' skirta ', (SUM(ui.qty) / tc.days)::numeric(10,2)::text, ' ', ui.unit::text, ' × ', tc.days::text, ' d.'
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
    ui.administered_date

UNION ALL

-- Branch 3: Medications from synchronization protocols
SELECT
    ss.farm_id,
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
    ss.completed_at::date AS registration_date,
    ss.scheduled_date AS treatment_start_date,
    av.visit_datetime AS visit_date,
    ss.scheduled_date AS first_symptoms_date,
    'Patenkinama' AS animal_condition,
    NULL::text AS tests,
    'Sinchronizacijos protokolas' AS clinical_diagnosis,
    NULL::text AS disease_name,
    ss.medication_product_id AS product_id,
    p.name AS product_name,
    p.category AS product_category,
    p.registration_code,
    p.active_substance,
    ss.dosage AS quantity,
    ss.dosage_unit AS unit,
    'IM' AS administration_route,
    1 AS days,
    -- Aliases for report compatibility
    p.name AS medicine_name,
    ss.dosage AS medicine_dose,
    ss.dosage_unit AS medicine_unit,
    1 AS medicine_days,
    b.batch_number,
    -- Formatted prescription text for synchronization
    CONCAT(
        'Rp.: ', p.name, E'\n',
        'D.t.d.N ', ss.dosage::text, ' ', ss.dosage_unit, E'\n',
        'S. IM skirta ', ss.dosage::text, ' ', ss.dosage_unit
    ) AS prescription_text,
    -- Calculate withdrawal periods based on product and administered date
    CASE 
        WHEN p.withdrawal_days_meat > 0 
        THEN (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE 
        WHEN p.withdrawal_days_milk > 0 
        THEN (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_milk,
    CASE 
        WHEN p.withdrawal_days_meat IS NULL OR p.withdrawal_days_meat = 0 THEN 0
        WHEN (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN ((ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NULL OR p.withdrawal_days_milk = 0 THEN 0
        WHEN (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN ((ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    NULL::text AS treatment_outcome,
    NULL::date AS outcome_date,
    'Nenurodyta' AS veterinarian,
    CONCAT('Sinchronizacija - ', ss.step_name, ' (Žingsnis ', ss.step_number::text, ')') AS notes,
    'synchronization' AS medication_source,
    NULL::uuid AS created_by_user_id,
    ss.completed_at AS created_at
FROM public.synchronization_steps ss
INNER JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.products p ON ss.medication_product_id = p.id
LEFT JOIN public.batches b ON ss.batch_id = b.id
LEFT JOIN public.animal_visits av ON av.sync_step_id = ss.id
WHERE ss.completed = true 
  AND ss.medication_product_id IS NOT NULL
  AND ss.batch_id IS NOT NULL;

COMMENT ON VIEW public.vw_treated_animals_detailed IS 'Detailed view of treated animals with medications from treatments, courses, and synchronization protocols, including withdrawal periods and formatted prescription text';

-- =====================================================================
-- Recreate vw_treated_animals_all_farms (was dropped by CASCADE)
-- =====================================================================
CREATE VIEW public.vw_treated_animals_all_farms AS
SELECT
    farm_id,
    treatment_id,
    animal_id,
    animal_tag,
    species,
    sex,
    birth_date,
    age_years,
    age_months,
    owner_name,
    owner_address,
    registration_date,
    treatment_start_date,
    visit_date,
    first_symptoms_date,
    animal_condition,
    tests,
    clinical_diagnosis,
    disease_name,
    product_id,
    product_name,
    product_category,
    registration_code,
    active_substance,
    quantity,
    unit,
    administration_route,
    days,
    medicine_name,
    medicine_dose,
    medicine_unit,
    medicine_days,
    batch_number,
    prescription_text,
    withdrawal_until_meat,
    withdrawal_until_milk,
    withdrawal_days_meat,
    withdrawal_days_milk,
    treatment_outcome,
    outcome_date,
    veterinarian,
    notes,
    medication_source,
    created_by_user_id,
    created_at
FROM public.vw_treated_animals_detailed;

COMMENT ON VIEW public.vw_treated_animals_all_farms IS 'All farms view of treated animals - used for cross-farm reports';

-- =====================================================================
-- Update Withdrawal Reports to Include Synchronization Medicines
-- =====================================================================

DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;
DROP VIEW IF EXISTS public.vw_withdrawal_journal_all_farms CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS
-- Treatments with medicines
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    t.id AS treatment_id,
    t.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    t.reg_date AS treatment_date,
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_meat
    END AS withdrawal_until_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_milk
    END AS withdrawal_until_milk,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_meat - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE 
                THEN (t.withdrawal_until_meat - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_milk - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE 
                THEN (t.withdrawal_until_milk - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_milk,
    COALESCE(d.name, t.clinical_diagnosis, 'Nenurodyta') AS disease_name,
    t.vet_name AS veterinarian,
    t.notes,
    (
        SELECT string_agg(DISTINCT p.name, ', ')
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_used,
    (
        SELECT string_agg(
            CASE 
                WHEN ui.qty IS NOT NULL AND ui.qty > 0 
                THEN ui.qty::text || ' ' || COALESCE(ui.unit::text, 'vnt')
                ELSE NULL
            END, 
            ', '
        )
        FROM public.usage_items ui
        WHERE ui.treatment_id = t.id AND ui.qty IS NOT NULL AND ui.qty > 0
    ) AS quantities_used,
    'treatment' AS source_type,
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id

UNION ALL

-- Synchronization protocol medicines
SELECT 
    ss.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    ss.id AS treatment_id,
    sync.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    ss.completed_at::date AS treatment_date,
    NULL::date AS withdrawal_until_meat_original,
    NULL::date AS withdrawal_until_milk_original,
    CASE 
        WHEN p.withdrawal_days_meat > 0 
        THEN (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE 
        WHEN p.withdrawal_days_milk > 0 
        THEN (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_milk,
    CASE 
        WHEN p.withdrawal_days_meat IS NULL OR p.withdrawal_days_meat = 0 THEN 0
        WHEN (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN ((ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NULL OR p.withdrawal_days_milk = 0 THEN 0
        WHEN (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN ((ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    'Sinchronizacijos protokolas' AS disease_name,
    'Nenurodyta' AS veterinarian,
    CONCAT('Sinchronizacija - ', ss.step_name, ' (Žingsnis ', ss.step_number::text, ')') AS notes,
    p.name AS medicines_used,
    CONCAT(ss.dosage::text, ' ', ss.dosage_unit) AS quantities_used,
    'synchronization' AS source_type,
    ss.completed_at AS created_at,
    ss.completed_at AS updated_at
FROM public.synchronization_steps ss
INNER JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
JOIN public.farms f ON ss.farm_id = f.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.products p ON ss.medication_product_id = p.id
WHERE ss.completed = true 
  AND ss.medication_product_id IS NOT NULL
  AND ss.batch_id IS NOT NULL

ORDER BY 
    farm_name ASC,
    treatment_date DESC;

COMMENT ON VIEW public.vw_withdrawal_report IS 'All treatments and synchronization medicines for withdrawal report with quantities used - includes entries without withdrawal periods. Includes eco-farm logic: 0 days becomes 2, others are multiplied by 2';

CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
-- Treatments with medicines
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    t.id AS treatment_id,
    t.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    t.reg_date AS treatment_date,
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_meat
    END AS withdrawal_until_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_milk
    END AS withdrawal_until_milk,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_meat - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE 
                THEN (t.withdrawal_until_meat - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_milk - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE 
                THEN (t.withdrawal_until_milk - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_milk,
    COALESCE(d.name, t.clinical_diagnosis, 'Nenurodyta') AS disease_name,
    t.vet_name AS veterinarian,
    t.notes,
    (
        SELECT string_agg(DISTINCT p.name, ', ')
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_used,
    (
        SELECT string_agg(
            CASE 
                WHEN ui.qty IS NOT NULL AND ui.qty > 0 
                THEN ui.qty::text || ' ' || COALESCE(ui.unit::text, 'vnt')
                ELSE NULL
            END, 
            ', '
        )
        FROM public.usage_items ui
        WHERE ui.treatment_id = t.id AND ui.qty IS NOT NULL AND ui.qty > 0
    ) AS quantities_used,
    'treatment' AS source_type,
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id

UNION ALL

-- Synchronization protocol medicines
SELECT 
    ss.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    ss.id AS treatment_id,
    sync.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    ss.completed_at::date AS treatment_date,
    NULL::date AS withdrawal_until_meat_original,
    NULL::date AS withdrawal_until_milk_original,
    CASE 
        WHEN p.withdrawal_days_meat > 0 
        THEN (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE 
        WHEN p.withdrawal_days_milk > 0 
        THEN (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_milk,
    CASE 
        WHEN p.withdrawal_days_meat IS NULL OR p.withdrawal_days_meat = 0 THEN 0
        WHEN (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN ((ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NULL OR p.withdrawal_days_milk = 0 THEN 0
        WHEN (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN ((ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN a.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    'Sinchronizacijos protokolas' AS disease_name,
    'Nenurodyta' AS veterinarian,
    CONCAT('Sinchronizacija - ', ss.step_name, ' (Žingsnis ', ss.step_number::text, ')') AS notes,
    p.name AS medicines_used,
    CONCAT(ss.dosage::text, ' ', ss.dosage_unit) AS quantities_used,
    'synchronization' AS source_type,
    ss.completed_at AS created_at,
    ss.completed_at AS updated_at
FROM public.synchronization_steps ss
INNER JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
JOIN public.farms f ON ss.farm_id = f.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.products p ON ss.medication_product_id = p.id
WHERE ss.completed = true 
  AND ss.medication_product_id IS NOT NULL
  AND ss.batch_id IS NOT NULL

ORDER BY 
    farm_name ASC,
    treatment_date DESC;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Farm-wide withdrawal journal with quantities used showing all treatments and synchronization medicines across all farms (even without withdrawal periods). Includes eco-farm logic: 0 days becomes 2, others are multiplied by 2';

GRANT SELECT ON public.vw_withdrawal_report TO authenticated;
GRANT SELECT ON public.vw_withdrawal_journal_all_farms TO authenticated;
