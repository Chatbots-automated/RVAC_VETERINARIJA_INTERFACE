-- =====================================================================
-- Verify Treatment Deletion
-- =====================================================================
-- Use this to check if treatments were actually deleted
-- =====================================================================

-- Check treatments table directly
SELECT 
    'treatments' AS table_name,
    COUNT(*) AS count
FROM treatments
WHERE reg_date >= '2026-04-09'

UNION ALL

-- Check usage_items
SELECT 
    'usage_items' AS table_name,
    COUNT(*) AS count
FROM usage_items
WHERE treatment_id IN (
    SELECT id FROM treatments WHERE reg_date >= '2026-04-09'
)

UNION ALL

-- Check treatment_courses
SELECT 
    'treatment_courses' AS table_name,
    COUNT(*) AS count
FROM treatment_courses
WHERE treatment_id IN (
    SELECT id FROM treatments WHERE reg_date >= '2026-04-09'
)

UNION ALL

-- Check view
SELECT 
    'vw_treated_animals_detailed' AS table_name,
    COUNT(DISTINCT treatment_id) AS count
FROM vw_treated_animals_detailed
WHERE registration_date >= '2026-04-09';

-- Detailed check - show what's still there
SELECT 
    t.id,
    t.reg_date,
    a.tag_no,
    t.clinical_diagnosis,
    t.created_at,
    (SELECT COUNT(*) FROM usage_items WHERE treatment_id = t.id) AS usage_items_count,
    (SELECT COUNT(*) FROM treatment_courses WHERE treatment_id = t.id) AS courses_count
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE t.reg_date >= '2026-04-09'
ORDER BY t.created_at DESC;
