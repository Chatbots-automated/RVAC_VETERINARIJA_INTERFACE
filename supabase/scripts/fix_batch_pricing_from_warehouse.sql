-- =====================================================================
-- Fix Batch Pricing from Warehouse Allocations
-- =====================================================================
-- Purpose: Copy purchase_price from warehouse_batches to farm batches
-- that were allocated but don't have pricing information
-- =====================================================================

DO $$
DECLARE
    v_batch_record record;
    v_updated_count int := 0;
    v_total_batches int := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING BATCH PRICING FROM WAREHOUSE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';

    -- Count batches without pricing that have allocation_id
    SELECT COUNT(*) INTO v_total_batches
    FROM batches b
    WHERE (b.purchase_price IS NULL OR b.purchase_price = 0)
    AND b.allocation_id IS NOT NULL;

    RAISE NOTICE 'Found % batches without pricing (but have allocation_id)', v_total_batches;
    RAISE NOTICE '';

    -- Loop through batches and copy pricing from warehouse
    FOR v_batch_record IN 
        SELECT 
            b.id as batch_id,
            b.batch_number,
            b.received_qty as farm_qty,
            fsa.allocated_qty,
            wb.purchase_price as warehouse_price,
            wb.received_qty as warehouse_qty,
            wb.currency,
            p.name as product_name,
            f.name as farm_name
        FROM batches b
        JOIN farm_stock_allocations fsa ON fsa.id = b.allocation_id
        JOIN warehouse_batches wb ON wb.id = fsa.warehouse_batch_id
        JOIN products p ON p.id = b.product_id
        JOIN farms f ON f.id = b.farm_id
        WHERE (b.purchase_price IS NULL OR b.purchase_price = 0)
        ORDER BY b.created_at DESC
    LOOP
        -- Calculate proportional price based on allocated quantity
        -- If warehouse had 100ml for €10, and we allocated 40ml,
        -- the farm batch should have purchase_price = €4
        DECLARE
            v_unit_price numeric;
            v_farm_total_price numeric;
        BEGIN
            -- Calculate unit price from warehouse
            v_unit_price := v_batch_record.warehouse_price / NULLIF(v_batch_record.warehouse_qty, 0);
            
            -- Calculate total price for farm batch
            v_farm_total_price := v_unit_price * v_batch_record.farm_qty;
            
            -- Update farm batch with pricing
            UPDATE batches
            SET 
                purchase_price = v_farm_total_price,
                currency = v_batch_record.currency
            WHERE id = v_batch_record.batch_id;
            
            v_updated_count := v_updated_count + 1;
            
            RAISE NOTICE '  ✓ % @ %: %.2f ml × €%.4f/unit = €%.2f',
                v_batch_record.farm_name,
                v_batch_record.product_name,
                v_batch_record.farm_qty,
                v_unit_price,
                v_farm_total_price;
        END;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PRICING FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total batches: %', v_total_batches;
    RAISE NOTICE 'Successfully updated: %', v_updated_count;
    RAISE NOTICE '========================================';

END $$;

-- Verification
SELECT 
    'Verification: Batches still without pricing' as check_type,
    COUNT(*) as count
FROM batches b
WHERE (b.purchase_price IS NULL OR b.purchase_price = 0)
AND b.allocation_id IS NOT NULL;

SELECT 
    'Verification: Batches with pricing' as check_type,
    COUNT(*) as count
FROM batches b
WHERE b.purchase_price > 0
AND b.allocation_id IS NOT NULL;

-- Sample of fixed batches
SELECT 
    'Sample: BioBos batches now with pricing' as info,
    f.name as farm_name,
    p.name as product_name,
    b.received_qty,
    b.purchase_price,
    b.currency,
    CASE 
        WHEN b.purchase_price > 0 THEN '✓ Fixed'
        ELSE '❌ Still missing'
    END as status
FROM batches b
JOIN products p ON p.id = b.product_id
JOIN farms f ON f.id = b.farm_id
WHERE p.name LIKE '%BioBos%'
ORDER BY b.created_at DESC
LIMIT 10;
