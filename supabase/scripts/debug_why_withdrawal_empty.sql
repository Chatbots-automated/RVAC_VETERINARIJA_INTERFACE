-- =====================================================================
-- Debug: Why is IŠLAUKŲ ATASKAITA Empty?
-- =====================================================================

-- Step 1: Check if vw_withdrawal_report view exists
SELECT 
    'View exists?' as check_type,
    COUNT(*) as count
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name IN ('vw_withdrawal_report', 'vw_withdrawal_journal_all_farms');

-- Step 2: Check total treatments with medicines
SELECT 
    'Treatments with medicines' as check_type,
    COUNT(DISTINCT t.id) as count
FROM treatments t
INNER JOIN usage_items ui ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id
WHERE p.category = 'medicines';

-- Step 3: Check what vw_withdrawal_report returns
SELECT 
    'vw_withdrawal_report rows' as check_type,
    COUNT(*) as count
FROM vw_withdrawal_report;

-- Step 4: Sample from vw_withdrawal_report
SELECT 
    farm_name,
    is_eco_farm,
    animal_tag,
    treatment_date,
    product_name,
    withdrawal_until_meat_original,
    withdrawal_until_meat,
    withdrawal_days_meat,
    withdrawal_until_milk_original,
    withdrawal_until_milk,
    withdrawal_days_milk
FROM vw_withdrawal_report
LIMIT 5;

-- Step 5: Check farms eco status
SELECT 
    f.name,
    f.is_eco_farm,
    COUNT(t.id) as treatment_count
FROM farms f
LEFT JOIN treatments t ON t.farm_id = f.id
GROUP BY f.id, f.name, f.is_eco_farm
ORDER BY f.name;

-- Step 6: Check a specific treatment's data
SELECT 
    t.id as treatment_id,
    f.name as farm_name,
    f.is_eco_farm,
    t.reg_date,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    p.name as product_name,
    p.withdrawal_days_meat,
    p.withdrawal_days_milk,
    ui.qty,
    ui.administered_date
FROM treatments t
INNER JOIN farms f ON t.farm_id = f.id
INNER JOIN usage_items ui ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id
WHERE p.category = 'medicines'
LIMIT 3;
