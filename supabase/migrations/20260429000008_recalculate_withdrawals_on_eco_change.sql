-- =====================================================================
-- Recalculate Withdrawal Dates for Eco Farm Changes
-- =====================================================================
-- Migration: 20260429000008
-- Created: 2026-04-29
--
-- OVERVIEW:
-- Updates the calculate_withdrawal_dates function to factor in eco farm status
-- (eco farms have 2x withdrawal periods). Also creates a function to recalculate
-- all withdrawal dates for a farm when its eco status changes.
-- =====================================================================

-- =====================================================================
-- PART 1: Update calculate_withdrawal_dates to factor in eco farm status
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
    v_farm_id uuid;
    v_is_eco_farm boolean;
    v_eco_multiplier integer;
BEGIN
    -- Get treatment info including farm_id
    SELECT t.reg_date, t.farm_id 
    INTO v_reg_date, v_farm_id
    FROM public.treatments t 
    WHERE t.id = p_treatment_id;

    -- Get farm eco status
    SELECT COALESCE(f.is_eco_farm, false) 
    INTO v_is_eco_farm
    FROM public.farms f
    WHERE f.id = v_farm_id;

    -- Set multiplier: eco farms get 2x withdrawal periods
    v_eco_multiplier := CASE WHEN v_is_eco_farm THEN 2 ELSE 1 END;

    -- Find the LAST administered date from usage_items for this treatment
    -- If no usage_items exist yet (or no administered_date), fall back to reg_date
    SELECT COALESCE(MAX(ui.administered_date), v_reg_date)
    INTO v_last_administered_date
    FROM public.usage_items ui
    WHERE ui.treatment_id = p_treatment_id;

    -- Calculate MILK withdrawal:
    -- 1. Find the LONGEST milk withdrawal period among all products used
    -- 2. Apply eco multiplier
    -- 3. Calculate from the LAST administered date
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

    -- If we found any milk withdrawal days, calculate the date with eco multiplier
    IF v_max_milk_days IS NOT NULL THEN
        v_milk_until := v_last_administered_date + (v_max_milk_days * v_eco_multiplier) + 1;
    ELSE
        v_milk_until := NULL;
    END IF;

    -- Calculate MEAT withdrawal:
    -- 1. Find the LONGEST meat withdrawal period among all products used
    -- 2. Apply eco multiplier
    -- 3. Calculate from the LAST administered date
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

    -- If we found any meat withdrawal days, calculate the date with eco multiplier
    IF v_max_meat_days IS NOT NULL THEN
        v_meat_until := v_last_administered_date + (v_max_meat_days * v_eco_multiplier) + 1;
    ELSE
        v_meat_until := NULL;
    END IF;

    -- Update treatment with calculated dates (NULL if no withdrawal needed)
    UPDATE public.treatments
    SET
        withdrawal_until_milk = v_milk_until,
        withdrawal_until_meat = v_meat_until,
        updated_at = NOW()
    WHERE id = p_treatment_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_withdrawal_dates(uuid) IS 'Calculates withdrawal dates from the LAST administered date using the LONGEST withdrawal period among all products used. Applies 2x multiplier for eco farms. Works for both legacy treatment_courses and new multi-day usage_items.';

-- =====================================================================
-- PART 2: Create function to recalculate all treatments for a farm
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recalculate_farm_withdrawal_dates(p_farm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_treatment_id uuid;
    v_count integer := 0;
    v_farm_name text;
    v_is_eco_farm boolean;
BEGIN
    -- Get farm info
    SELECT name, COALESCE(is_eco_farm, false) 
    INTO v_farm_name, v_is_eco_farm
    FROM farms
    WHERE id = p_farm_id;

    IF v_farm_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Farm not found',
            'farm_id', p_farm_id
        );
    END IF;

    -- Loop through all treatments for this farm and recalculate
    FOR v_treatment_id IN 
        SELECT id 
        FROM treatments 
        WHERE farm_id = p_farm_id
        ORDER BY reg_date DESC
    LOOP
        PERFORM calculate_withdrawal_dates(v_treatment_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'farm_id', p_farm_id,
        'farm_name', v_farm_name,
        'is_eco_farm', v_is_eco_farm,
        'treatments_recalculated', v_count,
        'message', format('Successfully recalculated %s treatments for farm %s (eco: %s)', 
                         v_count, v_farm_name, v_is_eco_farm)
    );
END;
$$;

COMMENT ON FUNCTION public.recalculate_farm_withdrawal_dates(uuid) IS 'Recalculates withdrawal dates for all treatments in a farm. Use this after changing a farm''s eco status.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_withdrawal_dates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_farm_withdrawal_dates(uuid) TO authenticated;

-- =====================================================================
-- PART 3: Create trigger to auto-recalculate when eco status changes
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_eco_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_result jsonb;
BEGIN
    -- Only recalculate if is_eco_farm changed
    IF OLD.is_eco_farm IS DISTINCT FROM NEW.is_eco_farm THEN
        -- Log the change
        RAISE NOTICE 'Farm % eco status changed from % to %. Recalculating withdrawal dates...', 
                     NEW.name, OLD.is_eco_farm, NEW.is_eco_farm;
        
        -- Recalculate all treatments
        SELECT recalculate_farm_withdrawal_dates(NEW.id) INTO v_result;
        
        RAISE NOTICE 'Recalculation result: %', v_result;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_recalculate_withdrawals_on_eco_change ON public.farms;

-- Create trigger
CREATE TRIGGER trigger_recalculate_withdrawals_on_eco_change
    AFTER UPDATE ON public.farms
    FOR EACH ROW
    EXECUTE FUNCTION trigger_recalculate_on_eco_change();

COMMENT ON TRIGGER trigger_recalculate_withdrawals_on_eco_change ON public.farms IS 'Automatically recalculates all withdrawal dates for a farm when its eco status changes';
