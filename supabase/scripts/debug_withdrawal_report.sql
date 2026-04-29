-- =====================================================================
-- Debug: Check Withdrawal Report Data
-- =====================================================================
-- Purpose: Check what's in the database and why withdrawal report might be empty
-- =====================================================================

-- Step 1: Check how many treatments exist
SELECT 
    'Total Treatments' as check_name,
    COUNT(*) as count,
    COUNT(CASE WHEN withdrawal_until_meat IS NOT NULL THEN 1 END) as has_meat_withdrawal,
    COUNT(CASE WHEN withdrawal_until_milk IS NOT NULL THEN 1 END) as has_milk_withdrawal
FROM treatments;

-- Step 2: Check treatments with usage_items
SELECT 
    'Treatments with Usage Items' as check_name,
    COUNT(DISTINCT t.id) as treatment_count,
    COUNT(*) as usage_item_count
FROM treatments t
INNER JOIN usage_items ui ON ui.treatment_id = t.id
WHERE t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL;

-- Step 3: Check treatments with medicines
SELECT 
    'Treatments with Medicine Products' as check_name,
    COUNT(DISTINCT t.id) as treatment_count
FROM treatments t
INNER JOIN usage_items ui ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id
WHERE p.category = 'medicines'
  AND (t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL);

-- Step 4: Sample data from vw_withdrawal_report
SELECT 
    'Sample from vw_withdrawal_report' as info,
    COUNT(*) as total_rows
FROM vw_withdrawal_report;

-- Step 5: Check a specific treatment
SELECT 
    t.id,
    t.farm_id,
    t.reg_date,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    COUNT(ui.id) as usage_items_count,
    STRING_AGG(p.name, ', ') as products_used,
    STRING_AGG(p.category, ', ') as product_categories
FROM treatments t
LEFT JOIN usage_items ui ON ui.treatment_id = t.id
LEFT JOIN products p ON ui.product_id = p.id
WHERE t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL
GROUP BY t.id, t.farm_id, t.reg_date, t.withdrawal_until_meat, t.withdrawal_until_milk
LIMIT 5;

-- Step 6: Check if farms are eco
SELECT 
    f.id,
    f.name,
    f.is_eco_farm,
    COUNT(t.id) as treatment_count,
    COUNT(CASE WHEN t.withdrawal_until_meat IS NOT NULL THEN 1 END) as has_meat_withdrawal,
    COUNT(CASE WHEN t.withdrawal_until_milk IS NOT NULL THEN 1 END) as has_milk_withdrawal
FROM farms f
LEFT JOIN treatments t ON t.farm_id = f.id
GROUP BY f.id, f.name, f.is_eco_farm
ORDER BY f.name;
