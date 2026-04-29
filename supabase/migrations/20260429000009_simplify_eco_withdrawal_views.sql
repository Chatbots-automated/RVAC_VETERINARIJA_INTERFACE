-- =====================================================================
-- Simplify Withdrawal Report Views (Remove Manual Eco Calculation)
-- =====================================================================
-- Migration: 20260429000009
-- Created: 2026-04-29
--
-- OVERVIEW:
-- Now that calculate_withdrawal_dates() handles eco farm multipliers,
-- the views no longer need to manually calculate 2x for eco farms.
-- This simplifies the views to just use the stored withdrawal dates.
-- =====================================================================

-- Drop and recreate the withdrawal report view
DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;

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
    -- Use the stored withdrawal dates (already calculated with eco multiplier)
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    -- Calculate days remaining (simple subtraction)
    CASE
        WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE
        THEN (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE
        WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE
        THEN (t.withdrawal_until_milk - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    p.id AS product_id,
    p.name AS product_name,
    p.registration_code,
    p.active_substance,
    p.withdrawal_days_meat AS product_base_withdrawal_meat,
    p.withdrawal_days_milk AS product_base_withdrawal_milk,
    ui.qty AS dose,
    ui.unit,
    ui.administration_route,
    ui.administered_date,
    'treatment' AS source_type,
    t.vet_name,
    t.notes,
    t.created_by_user_id,
    t.created_at
FROM public.treatments t
LEFT JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
INNER JOIN public.usage_items ui ON ui.treatment_id = t.id
INNER JOIN public.products p ON ui.product_id = p.id
WHERE (t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL)
  AND p.category = 'medicines'

UNION ALL

-- Synchronization protocol medicines
SELECT
    ss.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    NULL AS treatment_id,
    sync.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    ss.completed_at::date AS treatment_date,
    -- Calculate withdrawal dates for sync medicines (apply eco multiplier)
    CASE
        WHEN p.withdrawal_days_meat > 0 THEN
            (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE
        WHEN p.withdrawal_days_milk > 0 THEN
            (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_milk,
    -- Calculate days remaining
    CASE
        WHEN p.withdrawal_days_meat > 0 AND 
             (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE
        THEN ((ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE
        WHEN p.withdrawal_days_milk > 0 AND 
             (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE
        THEN ((ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_milk,
    p.id AS product_id,
    p.name AS product_name,
    p.registration_code,
    p.active_substance,
    p.withdrawal_days_meat AS product_base_withdrawal_meat,
    p.withdrawal_days_milk AS product_base_withdrawal_milk,
    ss.dosage AS dose,
    ss.dosage_unit::unit AS unit,
    'IM' AS administration_route,
    ss.completed_at::date AS administered_date,
    'synchronization' AS source_type,
    'Sinchronizacijos protokolas' AS vet_name,
    sp.name AS notes,
    NULL AS created_by_user_id,
    ss.completed_at AS created_at
FROM public.synchronization_steps ss
INNER JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
INNER JOIN public.synchronization_protocols sp ON sync.protocol_id = sp.id
LEFT JOIN public.farms f ON ss.farm_id = f.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.products p ON ss.medication_product_id = p.id
WHERE ss.completed = true 
  AND ss.medication_product_id IS NOT NULL
  AND p.category = 'medicines'
  AND (p.withdrawal_days_meat > 0 OR p.withdrawal_days_milk > 0);

COMMENT ON VIEW public.vw_withdrawal_report IS 'Unified withdrawal report showing treatments and synchronization protocol medicines. Withdrawal dates for treatments are now calculated automatically with eco multipliers applied.';
