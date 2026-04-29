-- =====================================================================
-- Manual Script: Recalculate Withdrawal Dates for a Specific Farm
-- =====================================================================
-- Purpose: Recalculates withdrawal dates for a specific farm
-- Usage: Replace 'YOUR_FARM_ID_HERE' with the actual farm ID
-- =====================================================================

-- STEP 1: Replace this with your actual farm ID
DO $$
DECLARE
    v_farm_id uuid := '6bbd9a73-bd31-4121-82ad-f15dbd5b9a0f'; -- CHANGE THIS TO YOUR FARM ID
    v_result jsonb;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '🔄 RECALCULATING WITHDRAWAL DATES';
    RAISE NOTICE '========================================';
    
    -- Call the recalculation function
    SELECT recalculate_farm_withdrawal_dates(v_farm_id) INTO v_result;
    
    -- Display result
    RAISE NOTICE '';
    RAISE NOTICE '✅ RESULT:';
    RAISE NOTICE 'Farm: %', v_result->>'farm_name';
    RAISE NOTICE 'Eco Farm: %', v_result->>'is_eco_farm';
    RAISE NOTICE 'Treatments Recalculated: %', v_result->>'treatments_recalculated';
    RAISE NOTICE '';
    RAISE NOTICE '%', v_result->>'message';
    RAISE NOTICE '========================================';
END $$;
