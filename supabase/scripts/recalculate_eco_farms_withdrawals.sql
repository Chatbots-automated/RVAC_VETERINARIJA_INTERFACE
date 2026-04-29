-- =====================================================================
-- One-Time Script: Recalculate Withdrawal Dates for All Eco Farms
-- =====================================================================
-- Purpose: Recalculates withdrawal dates for all existing eco farms
-- Run this AFTER applying migration 20260429000008
-- =====================================================================

DO $$
DECLARE
    v_farm_record RECORD;
    v_result jsonb;
    v_total_farms integer := 0;
    v_total_treatments integer := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '🌱 RECALCULATING ECO FARMS WITHDRAWAL DATES';
    RAISE NOTICE '========================================';
    
    -- Loop through all eco farms
    FOR v_farm_record IN 
        SELECT id, name, is_eco_farm
        FROM farms
        WHERE is_eco_farm = true
        ORDER BY name
    LOOP
        RAISE NOTICE '';
        RAISE NOTICE '📋 Processing farm: % (ID: %)', v_farm_record.name, v_farm_record.id;
        
        -- Recalculate all treatments for this farm
        SELECT recalculate_farm_withdrawal_dates(v_farm_record.id) INTO v_result;
        
        v_total_farms := v_total_farms + 1;
        v_total_treatments := v_total_treatments + (v_result->>'treatments_recalculated')::integer;
        
        RAISE NOTICE '   ✅ Recalculated % treatments', (v_result->>'treatments_recalculated')::integer;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ RECALCULATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Eco farms processed: %', v_total_farms;
    RAISE NOTICE 'Total treatments recalculated: %', v_total_treatments;
    RAISE NOTICE '========================================';
    
    IF v_total_farms = 0 THEN
        RAISE NOTICE '⚠️  No eco farms found. Nothing to recalculate.';
    END IF;
END $$;
