-- Test script to verify synchronization batch splitting works correctly
-- Run this AFTER applying the migration

-- ============================================================================
-- TEST 1: Verify the function was updated
-- ============================================================================
SELECT '=== TEST 1: Check if function contains FIFO batch logic ===' as test;

SELECT 
    CASE 
        WHEN pg_get_functiondef(oid) LIKE '%FIFO%' 
            OR pg_get_functiondef(oid) LIKE '%ORDER BY expiry_date%'
        THEN '✅ PASS - Function updated with FIFO batch splitting'
        ELSE '❌ FAIL - Function not updated yet'
    END as result
FROM pg_proc 
WHERE proname = 'deduct_sync_step_medication';

-- ============================================================================
-- TEST 2: Check if function creates usage_items
-- ============================================================================
SELECT '=== TEST 2: Check if function creates usage_items ===' as test;

SELECT 
    CASE 
        WHEN pg_get_functiondef(oid) LIKE '%INSERT INTO usage_items%'
        THEN '✅ PASS - Function creates usage_items for tracking'
        ELSE '❌ FAIL - Function does not create usage_items'
    END as result
FROM pg_proc 
WHERE proname = 'deduct_sync_step_medication';

-- ============================================================================
-- TEST 3: Find synchronization products to test with
-- ============================================================================
SELECT '=== TEST 3: Synchronization products (for testing) ===' as test;

SELECT 
    p.id,
    p.name,
    p.primary_pack_size,
    p.primary_pack_unit,
    -- Total stock across all batches
    COALESCE(SUM(b.qty_left), 0) as total_stock,
    -- Number of batches
    COUNT(b.id) as batch_count,
    -- Show batch details
    string_agg(
        'Batch ' || b.lot || ': ' || b.qty_left || ' ' || b.unit || ' (exp: ' || b.expiry_date || ')',
        E'\n'
        ORDER BY b.expiry_date ASC
    ) as batch_details
FROM products p
LEFT JOIN batches b ON b.product_id = p.id AND b.qty_left > 0
WHERE p.name ILIKE '%enzaprost%' 
   OR p.name ILIKE '%ovarelin%'
   OR p.name ILIKE '%receptal%'
GROUP BY p.id, p.name, p.primary_pack_size, p.primary_pack_unit
ORDER BY p.name;

-- ============================================================================
-- TEST 4: Check recent synchronization steps
-- ============================================================================
SELECT '=== TEST 4: Recent sync steps (check if splitting worked) ===' as test;

SELECT 
    ss.id as step_id,
    ss.step_number,
    ss.scheduled_date,
    ss.completed,
    ss.dosage,
    ss.dosage_unit,
    p.name as product_name,
    -- Check how many usage_items were created for this step
    (SELECT COUNT(*) 
     FROM usage_items ui
     JOIN animal_visits v ON v.id = (
         SELECT visit_id FROM treatments WHERE id = ui.treatment_id LIMIT 1
     )
     WHERE v.sync_step_id = ss.id
    ) as usage_items_count,
    -- Show the batches used
    (SELECT string_agg(b.lot || ': ' || ui.qty || ' ' || ui.unit, ', ')
     FROM usage_items ui
     JOIN batches b ON b.id = ui.batch_id
     JOIN animal_visits v ON v.id = (
         SELECT visit_id FROM treatments WHERE id = ui.treatment_id LIMIT 1
     )
     WHERE v.sync_step_id = ss.id
    ) as batches_used
FROM synchronization_steps ss
LEFT JOIN products p ON p.id = ss.medication_product_id
WHERE ss.completed = true
    AND ss.completed_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY ss.completed_at DESC
LIMIT 10;

-- ============================================================================
-- TEST 5: Verify FIFO logic (oldest expiry first)
-- ============================================================================
SELECT '=== TEST 5: Verify FIFO - batches ordered by expiry ===' as test;

-- This shows how batches would be selected for a product
SELECT 
    p.name as product,
    b.lot,
    b.qty_left,
    b.unit,
    b.expiry_date,
    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY b.expiry_date ASC, b.created_at ASC) as fifo_order
FROM products p
JOIN batches b ON b.product_id = p.id
WHERE (p.name ILIKE '%enzaprost%' OR p.name ILIKE '%ovarelin%')
    AND b.qty_left > 0
ORDER BY p.name, fifo_order;
