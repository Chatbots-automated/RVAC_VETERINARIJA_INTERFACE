-- =====================================================================
-- Revert to View-Based Eco Calculation (The Working Approach)
-- =====================================================================
-- Migration: 20260429000010
-- Created: 2026-04-29
--
-- OVERVIEW:
-- Reverts to the old working approach where:
-- 1. Withdrawal dates are stored WITHOUT eco multiplier in database
-- 2. The VIEW applies the 2x multiplier for eco farms when displaying
-- 3. Products with NO withdrawal show "2 days" default for eco farms
-- 
-- This way changing eco status immediately reflects in reports without
-- needing to recalculate hundreds of treatments.
-- =====================================================================

-- =====================================================================
-- PART 1: Revert calculate_withdrawal_dates to NOT use eco multiplier
-- =====================================================================

CREATE OR REPLACE FUNCTION public.calculate_withdrawal_dates(p_treatment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_reg_date date;
    v_last_administered_date date;
    v_milk_until date;
    v_meat_until date;
    v_max_milk_days integer;
    v_max_meat_days integer;
BEGIN
    -- Get treatment registration date
    SELECT reg_date INTO v_reg_date FROM public.treatments WHERE id = p_treatment_id;

    -- Find the LAST administered date from usage_items for this treatment
    -- If no usage_items exist yet (or no administered_date), fall back to reg_date
    SELECT COALESCE(MAX(ui.administered_date), v_reg_date)
    INTO v_last_administered_date
    FROM public.usage_items ui
    WHERE ui.treatment_id = p_treatment_id;

    -- Calculate MILK withdrawal (NO eco multiplier - stored as base values)
    WITH all_milk_products AS (
        -- From treatment_courses (legacy)
        SELECT p.withdrawal_days_milk
        FROM public.treatment_courses tc
        JOIN public.products p ON p.id = tc.product_id
        WHERE tc.treatment_id = p_treatment_id
          AND p.withdrawal_days_milk IS NOT NULL
          AND p.withdrawal_days_milk > 0

        UNION ALL

        -- From usage_items (new multi-day courses)
        SELECT p.withdrawal_days_milk
        FROM public.usage_items ui
        JOIN public.products p ON p.id = ui.product_id
        WHERE ui.treatment_id = p_treatment_id
          AND p.withdrawal_days_milk IS NOT NULL
          AND p.withdrawal_days_milk > 0
    )
    SELECT MAX(withdrawal_days_milk) INTO v_max_milk_days FROM all_milk_products;

    -- If we found any milk withdrawal days, calculate the date (base value, no eco multiplier)
    IF v_max_milk_days IS NOT NULL THEN
        v_milk_until := v_last_administered_date + v_max_milk_days + 1;
    ELSE
        v_milk_until := NULL;
    END IF;

    -- Calculate MEAT withdrawal (NO eco multiplier - stored as base values)
    WITH all_meat_products AS (
        -- From treatment_courses (legacy)
        SELECT p.withdrawal_days_meat
        FROM public.treatment_courses tc
        JOIN public.products p ON p.id = tc.product_id
        WHERE tc.treatment_id = p_treatment_id
          AND p.withdrawal_days_meat IS NOT NULL
          AND p.withdrawal_days_meat > 0

        UNION ALL

        -- From usage_items (new multi-day courses)
        SELECT p.withdrawal_days_meat
        FROM public.usage_items ui
        JOIN public.products p ON p.id = ui.product_id
        WHERE ui.treatment_id = p_treatment_id
          AND p.withdrawal_days_meat IS NOT NULL
          AND p.withdrawal_days_meat > 0
    )
    SELECT MAX(withdrawal_days_meat) INTO v_max_meat_days FROM all_meat_products;

    -- If we found any meat withdrawal days, calculate the date (base value, no eco multiplier)
    IF v_max_meat_days IS NOT NULL THEN
        v_meat_until := v_last_administered_date + v_max_meat_days + 1;
    ELSE
        v_meat_until := NULL;
    END IF;

    -- Update treatment with base withdrawal dates (NO eco multiplier)
    UPDATE public.treatments
    SET
        withdrawal_until_milk = v_milk_until,
        withdrawal_until_meat = v_meat_until,
        updated_at = NOW()
    WHERE id = p_treatment_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_withdrawal_dates(uuid) IS 'Calculates BASE withdrawal dates (without eco multiplier) from the LAST administered date using the LONGEST withdrawal period. Eco multiplier is applied in views.';

-- =====================================================================
-- PART 2: Remove the auto-recalculation trigger (not needed anymore)
-- =====================================================================

DROP TRIGGER IF EXISTS trigger_recalculate_withdrawals_on_eco_change ON public.farms;
DROP FUNCTION IF EXISTS public.trigger_recalculate_on_eco_change();

-- Keep the manual recalculation function for maintenance purposes
-- But it's no longer automatically triggered

COMMENT ON FUNCTION public.recalculate_farm_withdrawal_dates(uuid) IS 'Manually recalculates base withdrawal dates for all treatments in a farm. Not needed when changing eco status since views apply the multiplier.';

-- =====================================================================
-- PART 3: Recreate withdrawal report view with eco logic in VIEW
-- =====================================================================

DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS
-- Branch 1: Medications from usage_items
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
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
    -- Apply eco multiplier in VIEW (not in database)
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2))::date
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NULL AND p.category = 'medicines' THEN
            (COALESCE(ui.administered_date, t.reg_date) + 2)::date
        ELSE t.withdrawal_until_meat
    END AS withdrawal_until_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2))::date
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NULL AND p.category = 'medicines' THEN
            (COALESCE(ui.administered_date, t.reg_date) + 2)::date
        ELSE t.withdrawal_until_milk
    END AS withdrawal_until_milk,
    -- Calculate days remaining
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            GREATEST(0, (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2))::date - CURRENT_DATE)
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NULL AND p.category = 'medicines' THEN
            GREATEST(0, (COALESCE(ui.administered_date, t.reg_date) + 2)::date - CURRENT_DATE)
        WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE THEN
            (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            GREATEST(0, (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2))::date - CURRENT_DATE)
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NULL AND p.category = 'medicines' THEN
            GREATEST(0, (COALESCE(ui.administered_date, t.reg_date) + 2)::date - CURRENT_DATE)
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
    t.created_by_user_id,
    t.created_at
FROM public.treatments t
INNER JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
INNER JOIN public.usage_items ui ON ui.treatment_id = t.id
INNER JOIN public.products p ON ui.product_id = p.id
WHERE p.category = 'medicines'
  -- Show ALL treatments, not just ones with withdrawal dates!
  -- Eco farms get default 2 days even if product has no withdrawal

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

COMMENT ON VIEW public.vw_withdrawal_report IS 'Unified withdrawal report. Eco farms: 2x multiplier applied in VIEW. Products with no withdrawal show 2 days default for eco farms. Changing farm eco status immediately reflects in reports.';

-- =====================================================================
-- PART 4: Create vw_withdrawal_journal_all_farms (alias for cross-farm reports)
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
SELECT * FROM public.vw_withdrawal_report;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Alias for vw_withdrawal_report used in all-farms reports interface';
