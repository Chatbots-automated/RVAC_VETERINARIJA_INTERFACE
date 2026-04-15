-- =====================================================================
-- Check Vaccination Batch Pricing
-- =====================================================================
-- Purpose: Find out why vaccination costs show as €0.00
-- =====================================================================

-- Check BioBos vaccine batches
SELECT 
    '=== BioBos Vaccine Batches ===' as section,
    b.id,
    b.batch_number,
    b.received_qty,
    b.qty_left,
    b.purchase_price,
    b.doc_number,
    b.created_at,
    p.name as product_name
FROM batches b
JOIN products p ON p.id = b.product_id
WHERE p.name LIKE '%BioBos%'
ORDER BY b.created_at DESC;

-- Check vaccinations using BioBos
SELECT 
    '=== BioBos Vaccinations ===' as section,
    v.id,
    v.vaccination_date,
    v.dose_amount,
    v.unit,
    v.batch_id,
    p.name as product_name,
    b.purchase_price,
    b.received_qty,
    CASE 
        WHEN b.purchase_price IS NULL OR b.purchase_price = 0 THEN '❌ NO PRICE'
        ELSE '✓ Has price'
    END as price_status
FROM vaccinations v
JOIN products p ON p.id = v.product_id
LEFT JOIN batches b ON b.id = v.batch_id
WHERE p.name LIKE '%BioBos%'
ORDER BY v.vaccination_date DESC
LIMIT 20;

-- Check usage_items for BioBos vaccinations
SELECT 
    '=== BioBos Usage Items (Vaccinations) ===' as section,
    ui.id,
    ui.administered_date,
    ui.qty,
    ui.unit,
    ui.purpose,
    ui.batch_id,
    p.name as product_name,
    b.purchase_price,
    b.received_qty,
    CASE 
        WHEN b.purchase_price IS NULL OR b.purchase_price = 0 THEN '❌ NO PRICE'
        ELSE '✓ Has price'
    END as price_status
FROM usage_items ui
JOIN products p ON p.id = ui.product_id
LEFT JOIN batches b ON b.id = ui.batch_id
WHERE p.name LIKE '%BioBos%'
AND ui.purpose = 'vaccination'
ORDER BY ui.administered_date DESC
LIMIT 20;

-- Summary: Count batches with/without pricing
SELECT 
    '=== Summary: BioBos Batches Pricing ===' as section,
    COUNT(*) as total_batches,
    COUNT(CASE WHEN purchase_price IS NULL OR purchase_price = 0 THEN 1 END) as batches_without_price,
    COUNT(CASE WHEN purchase_price > 0 THEN 1 END) as batches_with_price,
    AVG(CASE WHEN purchase_price > 0 THEN purchase_price END) as avg_price
FROM batches b
JOIN products p ON p.id = b.product_id
WHERE p.name LIKE '%BioBos%';
