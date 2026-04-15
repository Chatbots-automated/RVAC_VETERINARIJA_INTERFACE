-- =====================================================================
-- Fix Missing Bulk Treatments in Reports
-- =====================================================================
-- Purpose: Diagnose and fix why bulk treatments (masinis gydymas) are
-- showing in Gydymų Savikainos but not in reports
-- =====================================================================

-- Step 1: Find treatments without usage_items or treatment_courses
SELECT 
    '=== ORPHANED TREATMENTS (No usage_items or treatment_courses) ===' as section,
    t.id,
    t.reg_date,
    t.farm_id,
    f.name as farm_name,
    t.animal_id,
    a.tag_no,
    (SELECT COUNT(*) FROM usage_items WHERE treatment_id = t.id) as usage_items_count,
    (SELECT COUNT(*) FROM treatment_courses WHERE treatment_id = t.id) as treatment_courses_count
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
LEFT JOIN farms f ON f.id = t.farm_id
WHERE NOT EXISTS (
    SELECT 1 FROM usage_items ui WHERE ui.treatment_id = t.id
)
AND NOT EXISTS (
    SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id
)
ORDER BY t.created_at DESC
LIMIT 20;

-- Step 2: Check if Vidmantas Petrauskas farm has this issue
WITH vidmantas_farm AS (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
    LIMIT 1
)
SELECT 
    '=== Vidmantas Petrauskas Farm - Treatment Status ===' as section,
    t.id as treatment_id,
    t.reg_date,
    a.tag_no,
    t.disease_id,
    d.name as disease_name,
    (SELECT COUNT(*) FROM usage_items WHERE treatment_id = t.id) as usage_items_count,
    (SELECT COUNT(*) FROM treatment_courses WHERE treatment_id = t.id) as treatment_courses_count,
    CASE 
        WHEN EXISTS (SELECT 1 FROM usage_items WHERE treatment_id = t.id) THEN 'Has usage_items'
        WHEN EXISTS (SELECT 1 FROM treatment_courses WHERE treatment_id = t.id) THEN 'Has treatment_courses'
        ELSE '❌ ORPHANED - No medication records!'
    END as status
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
LEFT JOIN diseases d ON d.id = t.disease_id
WHERE t.farm_id IN (SELECT id FROM vidmantas_farm)
ORDER BY t.created_at DESC
LIMIT 20;

-- Step 3: Check usage_items that might be missing treatment_id
SELECT 
    '=== USAGE ITEMS without treatment_id (for Vidmantas farm) ===' as section,
    ui.id,
    ui.administered_date,
    ui.qty,
    ui.unit,
    ui.purpose,
    ui.treatment_id,
    p.name as product_name,
    f.name as farm_name
FROM usage_items ui
LEFT JOIN products p ON p.id = ui.product_id
LEFT JOIN farms f ON f.id = ui.farm_id
WHERE ui.farm_id IN (
    SELECT id FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
)
AND ui.treatment_id IS NULL
ORDER BY ui.created_at DESC
LIMIT 20;

-- Step 4: Summary
WITH vidmantas_farm AS (
    SELECT id, name FROM farms 
    WHERE name LIKE '%Vidmantas%' OR name LIKE '%Petrauskas%'
    LIMIT 1
)
SELECT 
    '=== SUMMARY for ' || MAX(f.name) || ' ===' as section,
    COUNT(DISTINCT t.id) as total_treatments,
    COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM usage_items WHERE treatment_id = t.id) THEN t.id END) as with_usage_items,
    COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM treatment_courses WHERE treatment_id = t.id) THEN t.id END) as with_treatment_courses,
    COUNT(DISTINCT CASE WHEN NOT EXISTS (SELECT 1 FROM usage_items WHERE treatment_id = t.id) 
                            AND NOT EXISTS (SELECT 1 FROM treatment_courses WHERE treatment_id = t.id) 
                        THEN t.id END) as orphaned
FROM treatments t
CROSS JOIN vidmantas_farm f
WHERE t.farm_id = f.id;
