-- =====================================================================
-- Debug Missing Treatments in Reports
-- =====================================================================
-- Purpose: Find out why treatments show in Gydymų Savikainos but not
-- in Gydymų Istorija / GYDOMŲ GYVŪNŲ REGISTRAS / IŠLAUKŲ ATASKAITA
-- =====================================================================

-- Find Vidmantas Petrauskas farm
SELECT '=== FARM INFO ===' as section;
SELECT id, name, code, is_active
FROM farms
WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
LIMIT 5;

-- Check recent treatments for this farm
SELECT '=== RECENT TREATMENTS ===' as section;
SELECT 
    t.id,
    t.reg_date,
    t.animal_id,
    a.tag_no,
    t.disease_id,
    d.name as disease_name,
    t.veterinarian,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.created_at
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
LEFT JOIN diseases d ON d.id = t.disease_id
WHERE t.farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
ORDER BY t.created_at DESC
LIMIT 10;

-- Check if treatments have usage_items
SELECT '=== USAGE ITEMS FOR TREATMENTS ===' as section;
SELECT 
    t.id as treatment_id,
    t.reg_date,
    a.tag_no,
    COUNT(ui.id) as usage_items_count,
    STRING_AGG(p.name, ', ') as products_used
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
LEFT JOIN usage_items ui ON ui.treatment_id = t.id
LEFT JOIN products p ON p.id = ui.product_id
WHERE t.farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
GROUP BY t.id, t.reg_date, a.tag_no
ORDER BY t.created_at DESC
LIMIT 10;

-- Check vw_treated_animals_detailed view
SELECT '=== VIEW: vw_treated_animals_detailed ===' as section;
SELECT 
    registration_date,
    animal_tag,
    disease_name,
    medicine_name,
    farm_name,
    veterinarian
FROM vw_treated_animals_detailed
WHERE farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
ORDER BY registration_date DESC
LIMIT 10;

-- Check if treatments are in vw_withdrawal_report
SELECT '=== VIEW: vw_withdrawal_report ===' as section;
SELECT 
    treatment_date,
    animal_tag,
    disease_name,
    medicines_used,
    farm_name,
    veterinarian
FROM vw_withdrawal_report
WHERE farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
ORDER BY treatment_date DESC
LIMIT 10;

-- Check for NULL or missing critical fields
SELECT '=== TREATMENTS WITH MISSING DATA ===' as section;
SELECT 
    t.id,
    t.reg_date,
    t.animal_id IS NULL as missing_animal,
    t.disease_id IS NULL as missing_disease,
    t.veterinarian IS NULL as missing_vet,
    a.tag_no,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE t.farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
ORDER BY t.created_at DESC
LIMIT 10;

-- Check animal_visits related to treatments
SELECT '=== ANIMAL VISITS ===' as section;
SELECT 
    av.id,
    av.visit_datetime,
    av.related_treatment_id,
    av.procedures,
    av.status,
    a.tag_no
FROM animal_visits av
JOIN animals a ON a.id = av.animal_id
WHERE av.farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
ORDER BY av.visit_datetime DESC
LIMIT 10;
