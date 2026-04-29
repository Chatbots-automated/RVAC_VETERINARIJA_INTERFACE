-- =====================================================================
-- Fix Withdrawal Calculation to Use Route-Specific Withdrawal Days
-- =====================================================================
-- Created: 2026-04-29
-- Description:
--   The previous version used only the default withdrawal_days_meat/milk
--   from products table. This update makes the function check the
--   administration_route in usage_items and use route-specific withdrawal
--   days (e.g., withdrawal_iv_meat, withdrawal_pos_milk, etc.).
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
    -- 2. Use route-specific withdrawal if administration_route is set
    -- 3. Calculate from the LAST administered date
    WITH all_milk_products AS (
        -- From treatment_courses (legacy) - use default withdrawal days
        SELECT p.withdrawal_days_milk
        FROM public.treatment_courses tc
        JOIN public.products p ON p.id = tc.product_id
        WHERE tc.treatment_id = p_treatment_id 
          AND p.withdrawal_days_milk IS NOT NULL
          AND p.withdrawal_days_milk > 0
        
        UNION ALL
        
        -- From usage_items (new multi-day courses) - use route-specific if available
        SELECT 
            CASE 
                WHEN ui.administration_route = 'iv' AND p.withdrawal_iv_milk IS NOT NULL 
                    THEN p.withdrawal_iv_milk
                WHEN ui.administration_route = 'im' AND p.withdrawal_im_milk IS NOT NULL 
                    THEN p.withdrawal_im_milk
                WHEN ui.administration_route = 'sc' AND p.withdrawal_sc_milk IS NOT NULL 
                    THEN p.withdrawal_sc_milk
                WHEN ui.administration_route = 'iu' AND p.withdrawal_iu_milk IS NOT NULL 
                    THEN p.withdrawal_iu_milk
                WHEN ui.administration_route = 'imm' AND p.withdrawal_imm_milk IS NOT NULL 
                    THEN p.withdrawal_imm_milk
                WHEN ui.administration_route = 'pos' AND p.withdrawal_pos_milk IS NOT NULL 
                    THEN p.withdrawal_pos_milk
                ELSE p.withdrawal_days_milk
            END AS withdrawal_days_milk
        FROM public.usage_items ui
        JOIN public.products p ON p.id = ui.product_id
        WHERE ui.treatment_id = p_treatment_id 
          AND (
              (ui.administration_route = 'iv' AND p.withdrawal_iv_milk > 0) OR
              (ui.administration_route = 'im' AND p.withdrawal_im_milk > 0) OR
              (ui.administration_route = 'sc' AND p.withdrawal_sc_milk > 0) OR
              (ui.administration_route = 'iu' AND p.withdrawal_iu_milk > 0) OR
              (ui.administration_route = 'imm' AND p.withdrawal_imm_milk > 0) OR
              (ui.administration_route = 'pos' AND p.withdrawal_pos_milk > 0) OR
              (ui.administration_route IS NULL AND p.withdrawal_days_milk > 0) OR
              (p.withdrawal_days_milk > 0)
          )
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
    -- 2. Use route-specific withdrawal if administration_route is set
    -- 3. Calculate from the LAST administered date
    WITH all_meat_products AS (
        -- From treatment_courses (legacy) - use default withdrawal days
        SELECT p.withdrawal_days_meat
        FROM public.treatment_courses tc
        JOIN public.products p ON p.id = tc.product_id
        WHERE tc.treatment_id = p_treatment_id 
          AND p.withdrawal_days_meat IS NOT NULL
          AND p.withdrawal_days_meat > 0
        
        UNION ALL
        
        -- From usage_items (new multi-day courses) - use route-specific if available
        SELECT 
            CASE 
                WHEN ui.administration_route = 'iv' AND p.withdrawal_iv_meat IS NOT NULL 
                    THEN p.withdrawal_iv_meat
                WHEN ui.administration_route = 'im' AND p.withdrawal_im_meat IS NOT NULL 
                    THEN p.withdrawal_im_meat
                WHEN ui.administration_route = 'sc' AND p.withdrawal_sc_meat IS NOT NULL 
                    THEN p.withdrawal_sc_meat
                WHEN ui.administration_route = 'iu' AND p.withdrawal_iu_meat IS NOT NULL 
                    THEN p.withdrawal_iu_meat
                WHEN ui.administration_route = 'imm' AND p.withdrawal_imm_meat IS NOT NULL 
                    THEN p.withdrawal_imm_meat
                WHEN ui.administration_route = 'pos' AND p.withdrawal_pos_meat IS NOT NULL 
                    THEN p.withdrawal_pos_meat
                ELSE p.withdrawal_days_meat
            END AS withdrawal_days_meat
        FROM public.usage_items ui
        JOIN public.products p ON p.id = ui.product_id
        WHERE ui.treatment_id = p_treatment_id 
          AND (
              (ui.administration_route = 'iv' AND p.withdrawal_iv_meat > 0) OR
              (ui.administration_route = 'im' AND p.withdrawal_im_meat > 0) OR
              (ui.administration_route = 'sc' AND p.withdrawal_sc_meat > 0) OR
              (ui.administration_route = 'iu' AND p.withdrawal_iu_meat > 0) OR
              (ui.administration_route = 'imm' AND p.withdrawal_imm_meat > 0) OR
              (ui.administration_route = 'pos' AND p.withdrawal_pos_meat > 0) OR
              (ui.administration_route IS NULL AND p.withdrawal_days_meat > 0) OR
              (p.withdrawal_days_meat > 0)
          )
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

COMMENT ON FUNCTION public.calculate_withdrawal_dates(uuid) IS 'Calculates withdrawal dates from the LAST administered date using the LONGEST withdrawal period among all products used. Uses route-specific withdrawal days (e.g., withdrawal_iv_meat, withdrawal_pos_milk) based on administration_route in usage_items. Works for both legacy treatment_courses and new multi-day usage_items.';
