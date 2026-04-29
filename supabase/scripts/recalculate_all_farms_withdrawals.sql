-- =====================================================================
-- Script: Recalculate Withdrawal Dates for ALL Farms
-- =====================================================================
-- Purpose: Recalculates withdrawal dates for ALL farms (eco and non-eco)
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
    RAISE NOTICE '🔄 RECALCULATING ALL FARMS WITHDRAWAL DATES';
    RAISE NOTICE '========================================';
    
    -- Loop through ALL farms
    FOR v_farm_record IN 
        SELECT id, name, COALESCE(is_eco_farm, false) as is_eco_farm
        FROM farms
        ORDER BY name
    LOOP
        RAISE NOTICE '';
        RAISE NOTICE '📋 Processing farm: % (Eco: %)', v_farm_record.name, v_farm_record.is_eco_farm;
        
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
    RAISE NOTICE 'Total farms processed: %', v_total_farms;
    RAISE NOTICE 'Total treatments recalculated: %', v_total_treatments;
    RAISE NOTICE '========================================';
    
    IF v_total_farms = 0 THEN
        RAISE NOTICE '⚠️  No farms found. Nothing to recalculate.';
    END IF;
END $$;
