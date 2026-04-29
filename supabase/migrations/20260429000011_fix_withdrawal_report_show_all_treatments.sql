-- =====================================================================
-- Fix: IŠLAUKŲ ATASKAITA Must Show ALL Treatments (Same as GYDOMŲ GYVŪNŲ)
-- =====================================================================
-- Migration: 20260429000011
-- Created: 2026-04-29
--
-- OVERVIEW:
-- IŠLAUKŲ ATASKAITA must have the SAME row count as GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS.
-- Both show ALL treatments with medicines, regardless of withdrawal dates.
-- The difference is IŠLAUKŲ ATASKAITA focuses on withdrawal periods.
--
-- Key Fix:
-- - Remove filter for withdrawal_until_meat/milk IS NOT NULL
-- - Show ALL medicine treatments
-- - Display withdrawal info for each (with eco logic)
-- - Products with no withdrawal show "Nėra" or "2" for eco farms
-- =====================================================================

DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;
DROP VIEW IF EXISTS public.vw_withdrawal_journal_all_farms CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS
-- Branch 1: Medications from usage_items (one row per usage_item)
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
    COALESCE(ui.administered_date, t.reg_date) AS treatment_date,
    t.reg_date,
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
    -- Apply eco multiplier in VIEW (not in database)
    -- If product has withdrawal: apply 2x for eco farms
    -- If product has NO withdrawal AND eco farm: show 2 days
    -- If product has NO withdrawal AND not eco: NULL
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2))::date
        WHEN f.is_eco_farm AND (t.withdrawal_until_meat IS NULL AND p.withdrawal_days_meat = 0) THEN
            (COALESCE(ui.administered_date, t.reg_date) + 2)::date
        ELSE t.withdrawal_until_meat
    END AS withdrawal_until_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2))::date
        WHEN f.is_eco_farm AND (t.withdrawal_until_milk IS NULL AND p.withdrawal_days_milk = 0) THEN
            (COALESCE(ui.administered_date, t.reg_date) + 2)::date
        ELSE t.withdrawal_until_milk
    END AS withdrawal_until_milk,
    -- Calculate days remaining
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL AND (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2))::date >= CURRENT_DATE THEN
            ((t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2))::date - CURRENT_DATE)
        WHEN f.is_eco_farm AND (t.withdrawal_until_meat IS NULL AND p.withdrawal_days_meat = 0) AND (COALESCE(ui.administered_date, t.reg_date) + 2)::date >= CURRENT_DATE THEN
            ((COALESCE(ui.administered_date, t.reg_date) + 2)::date - CURRENT_DATE)
        WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE THEN
            (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL AND (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2))::date >= CURRENT_DATE THEN
            ((t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2))::date - CURRENT_DATE)
        WHEN f.is_eco_farm AND (t.withdrawal_until_milk IS NULL AND p.withdrawal_days_milk = 0) AND (COALESCE(ui.administered_date, t.reg_date) + 2)::date >= CURRENT_DATE THEN
            ((COALESCE(ui.administered_date, t.reg_date) + 2)::date - CURRENT_DATE)
        WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE THEN
            (t.withdrawal_until_milk - CURRENT_DATE)
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
    t.clinical_diagnosis,
    t.disease_id,
    t.created_by_user_id,
    t.created_at
FROM public.treatments t
INNER JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
INNER JOIN public.usage_items ui ON ui.treatment_id = t.id
INNER JOIN public.products p ON ui.product_id = p.id
WHERE p.category = 'medicines'
  -- NO FILTER by withdrawal dates! Show ALL medicine treatments!

UNION ALL

-- Branch 2: Synchronization protocol medicines
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
    ss.completed_at::date AS reg_date,
    NULL AS withdrawal_until_meat_original,
    NULL AS withdrawal_until_milk_original,
    -- Calculate withdrawal dates for sync medicines (apply eco multiplier)
    CASE
        WHEN p.withdrawal_days_meat > 0 THEN
            (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        WHEN p.withdrawal_days_meat = 0 AND f.is_eco_farm THEN
            (ss.completed_at::date + 2)
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE
        WHEN p.withdrawal_days_milk > 0 THEN
            (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        WHEN p.withdrawal_days_milk = 0 AND f.is_eco_farm THEN
            (ss.completed_at::date + 2)
        ELSE NULL
    END AS withdrawal_until_milk,
    -- Calculate days remaining
    CASE
        WHEN p.withdrawal_days_meat > 0 AND 
             (ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE
        THEN ((ss.completed_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        WHEN p.withdrawal_days_meat = 0 AND f.is_eco_farm AND (ss.completed_at::date + 2) >= CURRENT_DATE
        THEN ((ss.completed_at::date + 2) - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE
        WHEN p.withdrawal_days_milk > 0 AND 
             (ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE
        THEN ((ss.completed_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
        WHEN p.withdrawal_days_milk = 0 AND f.is_eco_farm AND (ss.completed_at::date + 2) >= CURRENT_DATE
        THEN ((ss.completed_at::date + 2) - CURRENT_DATE)
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
    'Sinchronizacijos protokolas' AS clinical_diagnosis,
    NULL AS disease_id,
    NULL AS created_by_user_id,
    ss.completed_at AS created_at
FROM public.synchronization_steps ss
INNER JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
INNER JOIN public.synchronization_protocols sp ON sync.protocol_id = sp.id
INNER JOIN public.farms f ON ss.farm_id = f.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
INNER JOIN public.products p ON ss.medication_product_id = p.id
WHERE ss.completed = true 
  AND ss.medication_product_id IS NOT NULL
  AND p.category = 'medicines';

COMMENT ON VIEW public.vw_withdrawal_report IS 'Withdrawal report showing ALL medicine treatments (same row count as vw_treated_animals_detailed). Eco farms: 2x multiplier applied in VIEW. Products with no withdrawal show 2 days default for eco farms.';

-- Create alias for all-farms reports
CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
SELECT * FROM public.vw_withdrawal_report;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Alias for vw_withdrawal_report used in all-farms reports. Shows ALL medicine treatments.';
