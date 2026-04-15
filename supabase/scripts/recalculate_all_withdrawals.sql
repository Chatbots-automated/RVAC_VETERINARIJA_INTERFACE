-- =====================================================================
-- Recalculate Withdrawal Dates for All Existing Treatments
-- =====================================================================
-- Purpose: Update all treatments to use the new withdrawal calculation logic
-- This ensures products without withdrawal days show NULL instead of dates
-- =====================================================================

DO $$
DECLARE
    v_treatment_record record;
    v_total_treatments int := 0;
    v_updated_count int := 0;
    v_skipped_count int := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RECALCULATING ALL WITHDRAWAL DATES';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';

    -- Count total treatments
    SELECT COUNT(*) INTO v_total_treatments FROM treatments;
    RAISE NOTICE 'Total treatments to process: %', v_total_treatments;
    RAISE NOTICE '';

    -- Loop through all treatments and recalculate
    FOR v_treatment_record IN 
        SELECT id, reg_date
        FROM treatments
        ORDER BY reg_date DESC
    LOOP
        BEGIN
            -- Call the calculate_withdrawal_dates function
            PERFORM calculate_withdrawal_dates(v_treatment_record.id);
            v_updated_count := v_updated_count + 1;
            
            -- Log progress every 100 treatments
            IF v_updated_count % 100 = 0 THEN
                RAISE NOTICE '  Progress: % / % treatments processed...', v_updated_count, v_total_treatments;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            v_skipped_count := v_skipped_count + 1;
            RAISE NOTICE '  ⚠ Skipped treatment % (error: %)', v_treatment_record.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RECALCULATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total treatments: %', v_total_treatments;
    RAISE NOTICE 'Successfully updated: %', v_updated_count;
    RAISE NOTICE 'Skipped (errors): %', v_skipped_count;
    RAISE NOTICE '========================================';

END $$;

-- =====================================================================
-- VERIFICATION QUERIES
-- =====================================================================

-- Check treatments with withdrawal dates
SELECT 
    'Treatments with meat withdrawal' as check_type,
    COUNT(*) as count
FROM treatments
WHERE withdrawal_until_meat IS NOT NULL;

SELECT 
    'Treatments with milk withdrawal' as check_type,
    COUNT(*) as count
FROM treatments
WHERE withdrawal_until_milk IS NOT NULL;

-- Check treatments without withdrawal (products that don't need it)
SELECT 
    'Treatments without withdrawal' as check_type,
    COUNT(*) as count
FROM treatments
WHERE withdrawal_until_meat IS NULL AND withdrawal_until_milk IS NULL;

-- Sample of treatments with withdrawal
SELECT 
    'Sample treatments with withdrawal' as info,
    t.id,
    t.reg_date,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    a.tag_no as animal_tag
FROM treatments t
JOIN animals a ON a.id = t.animal_id
WHERE t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL
ORDER BY t.reg_date DESC
LIMIT 5;

-- Sample of treatments without withdrawal
SELECT 
    'Sample treatments without withdrawal' as info,
    t.id,
    t.reg_date,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    a.tag_no as animal_tag
FROM treatments t
JOIN animals a ON a.id = t.animal_id
WHERE t.withdrawal_until_meat IS NULL AND t.withdrawal_until_milk IS NULL
ORDER BY t.reg_date DESC
LIMIT 5;
