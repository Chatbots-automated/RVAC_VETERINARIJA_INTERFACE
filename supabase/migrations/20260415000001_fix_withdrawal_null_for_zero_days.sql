-- =====================================================================
-- Fix Withdrawal: NULL for Products with Zero or No Withdrawal Days
-- =====================================================================
-- Created: 2026-04-15
-- Description:
--   Updates calculate_withdrawal_dates to store NULL when products
--   have withdrawal_days = 0 or NULL. Frontend will display "Nėra".
--   Only products with withdrawal_days > 0 get actual dates.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.calculate_withdrawal_dates(p_treatment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_reg_date date;
    v_milk_until date;
    v_meat_until date;
BEGIN
    SELECT reg_date INTO v_reg_date FROM public.treatments WHERE id = p_treatment_id;

    -- Calculate milk withdrawal ONLY for products with withdrawal_days > 0
    -- Products with 0 days or NULL will result in NULL
    WITH course_milk AS (
        SELECT v_reg_date + tc.days + p.withdrawal_days_milk + 1 as wd
        FROM public.treatment_courses tc
        JOIN public.products p ON p.id = tc.product_id
        WHERE tc.treatment_id = p_treatment_id 
          AND p.withdrawal_days_milk IS NOT NULL
          AND p.withdrawal_days_milk > 0  -- Only include if > 0
    ),
    single_milk AS (
        SELECT v_reg_date + p.withdrawal_days_milk + 1 as wd
        FROM public.usage_items ui
        JOIN public.products p ON p.id = ui.product_id
        WHERE ui.treatment_id = p_treatment_id 
          AND p.withdrawal_days_milk IS NOT NULL
          AND p.withdrawal_days_milk > 0  -- Only include if > 0
          AND NOT EXISTS (
            SELECT 1 FROM public.treatment_courses tc 
            WHERE tc.treatment_id = p_treatment_id 
              AND tc.product_id = ui.product_id
          )
    ),
    all_milk AS (
        SELECT wd FROM course_milk 
        UNION ALL 
        SELECT wd FROM single_milk
    )
    SELECT MAX(wd) INTO v_milk_until FROM all_milk;

    -- Calculate meat withdrawal ONLY for products with withdrawal_days > 0
    -- Products with 0 days or NULL will result in NULL
    WITH course_meat AS (
        SELECT v_reg_date + tc.days + p.withdrawal_days_meat + 1 as wd
        FROM public.treatment_courses tc
        JOIN public.products p ON p.id = tc.product_id
        WHERE tc.treatment_id = p_treatment_id 
          AND p.withdrawal_days_meat IS NOT NULL
          AND p.withdrawal_days_meat > 0  -- Only include if > 0
    ),
    single_meat AS (
        SELECT v_reg_date + p.withdrawal_days_meat + 1 as wd
        FROM public.usage_items ui
        JOIN public.products p ON p.id = ui.product_id
        WHERE ui.treatment_id = p_treatment_id 
          AND p.withdrawal_days_meat IS NOT NULL
          AND p.withdrawal_days_meat > 0  -- Only include if > 0
          AND NOT EXISTS (
            SELECT 1 FROM public.treatment_courses tc 
            WHERE tc.treatment_id = p_treatment_id 
              AND tc.product_id = ui.product_id
          )
    ),
    all_meat AS (
        SELECT wd FROM course_meat 
        UNION ALL 
        SELECT wd FROM single_meat
    )
    SELECT MAX(wd) INTO v_meat_until FROM all_meat;

    -- Update treatment with calculated dates (NULL if no withdrawal needed)
    UPDATE public.treatments 
    SET 
        withdrawal_until_milk = v_milk_until,
        withdrawal_until_meat = v_meat_until 
    WHERE id = p_treatment_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_withdrawal_dates(uuid) IS 'Calculates withdrawal dates ONLY for products with withdrawal_days > 0. Products with 0 days or NULL will have NULL dates (displayed as "Nėra" in frontend).';
