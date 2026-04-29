-- Test: Pick one treatment and recalculate it manually to see if function works

DO $$
DECLARE
    v_treatment_id uuid;
    v_before_meat date;
    v_before_milk date;
    v_after_meat date;
    v_after_milk date;
    v_farm_eco boolean;
BEGIN
    -- Get first treatment with withdrawal dates
    SELECT t.id, t.withdrawal_until_meat, t.withdrawal_until_milk, f.is_eco_farm
    INTO v_treatment_id, v_before_meat, v_before_milk, v_farm_eco
    FROM treatments t
    JOIN farms f ON t.farm_id = f.id
    WHERE t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL
    LIMIT 1;
    
    IF v_treatment_id IS NULL THEN
        RAISE NOTICE 'No treatments found with withdrawal dates!';
        RETURN;
    END IF;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Testing recalculation on treatment: %', v_treatment_id;
    RAISE NOTICE 'Farm is eco: %', v_farm_eco;
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'BEFORE:';
    RAISE NOTICE '  Meat withdrawal: %', v_before_meat;
    RAISE NOTICE '  Milk withdrawal: %', v_before_milk;
    
    -- Recalculate
    PERFORM calculate_withdrawal_dates(v_treatment_id);
    
    -- Get new values
    SELECT withdrawal_until_meat, withdrawal_until_milk
    INTO v_after_meat, v_after_milk
    FROM treatments
    WHERE id = v_treatment_id;
    
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'AFTER:';
    RAISE NOTICE '  Meat withdrawal: %', v_after_meat;
    RAISE NOTICE '  Milk withdrawal: %', v_after_milk;
    RAISE NOTICE '========================================';
    
    IF v_before_meat IS DISTINCT FROM v_after_meat OR v_before_milk IS DISTINCT FROM v_after_milk THEN
        RAISE NOTICE '✅ VALUES CHANGED! Recalculation is working.';
    ELSE
        RAISE NOTICE '⚠️  No change detected. This might be expected if dates were already correct.';
    END IF;
END $$;
