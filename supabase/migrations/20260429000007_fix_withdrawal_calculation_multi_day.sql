-- =====================================================================
-- Fix Withdrawal Calculation for Multi-Day Courses
-- =====================================================================
-- Created: 2026-04-29
-- Description:
--   Updates calculate_withdrawal_dates to properly handle multi-day courses.
--   Key changes:
--   1. Use the LAST administered_date from usage_items (not reg_date)
--   2. Find the LONGEST withdrawal period among all products
--   3. Calculate withdrawal from: last_date + max_withdrawal_days + 1
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

    -- Calculate MILK withdrawal:
    -- 1. Find the LONGEST milk withdrawal period among all products used
    -- 2. Calculate from the LAST administered date
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

    -- If we found any milk withdrawal days, calculate the date
    IF v_max_milk_days IS NOT NULL THEN
        v_milk_until := v_last_administered_date + v_max_milk_days + 1;
    ELSE
        v_milk_until := NULL;
    END IF;

    -- Calculate MEAT withdrawal:
    -- 1. Find the LONGEST meat withdrawal period among all products used
    -- 2. Calculate from the LAST administered date
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

    -- If we found any meat withdrawal days, calculate the date
    IF v_max_meat_days IS NOT NULL THEN
        v_meat_until := v_last_administered_date + v_max_meat_days + 1;
    ELSE
        v_meat_until := NULL;
    END IF;

    -- Update treatment with calculated dates (NULL if no withdrawal needed)
    UPDATE public.treatments 
    SET 
        withdrawal_until_milk = v_milk_until,
        withdrawal_until_meat = v_meat_until 
    WHERE id = p_treatment_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_withdrawal_dates(uuid) IS 'Calculates withdrawal dates from the LAST administered date using the LONGEST withdrawal period among all products used. Works for both legacy treatment_courses and new multi-day usage_items.';
