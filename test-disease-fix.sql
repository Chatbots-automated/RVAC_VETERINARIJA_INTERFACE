-- Test script to verify the disease fix is working
-- Run this AFTER applying the migration

-- ============================================================================
-- TEST 1: Verify the function was updated
-- ============================================================================
SELECT '=== TEST 1: Check if function contains disease copying logic ===' as test;

SELECT 
    CASE 
        WHEN pg_get_functiondef(oid) LIKE '%v_related_treatment%' 
        THEN '✅ PASS - Function updated with v_related_treatment variable'
        ELSE '❌ FAIL - Function not updated yet'
    END as result
FROM pg_proc 
WHERE proname = 'process_visit_medications';

-- ============================================================================
-- TEST 2: Check recent course visits
-- ============================================================================
SELECT '=== TEST 2: Recent course visits (should have disease info after fix) ===' as test;

SELECT 
    t.reg_date,
    a.tag_no,
    CASE 
        WHEN t.disease_id IS NOT NULL THEN '✅ Has disease_id'
        WHEN t.clinical_diagnosis IS NOT NULL AND TRIM(t.clinical_diagnosis) != '' THEN '✅ Has clinical_diagnosis'
        ELSE '❌ Missing disease info'
    END as disease_status,
    d.name as disease_name,
    t.clinical_diagnosis,
    v.related_treatment_id IS NOT NULL as is_course_visit,
    -- Show what related treatment has
    CASE 
        WHEN v.related_treatment_id IS NOT NULL THEN
            (SELECT COALESCE(rd.name, rt.clinical_diagnosis, 'No disease in related')
             FROM treatments rt
             LEFT JOIN diseases rd ON rd.id = rt.disease_id
             WHERE rt.id = v.related_treatment_id)
        ELSE 'N/A - not a course visit'
    END as related_treatment_disease
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
LEFT JOIN animal_visits v ON v.id = t.visit_id
WHERE 
    t.reg_date >= CURRENT_DATE - INTERVAL '7 days'
    AND v.related_treatment_id IS NOT NULL
ORDER BY t.reg_date DESC, a.tag_no
LIMIT 20;

-- ============================================================================
-- TEST 3: Count improvements
-- ============================================================================
SELECT '=== TEST 3: Before/After comparison ===' as test;

SELECT 
    'Course visits with disease info' as metric,
    COUNT(CASE WHEN t.disease_id IS NOT NULL OR (t.clinical_diagnosis IS NOT NULL AND TRIM(t.clinical_diagnosis) != '') THEN 1 END) as count,
    COUNT(*) as total,
    ROUND(COUNT(CASE WHEN t.disease_id IS NOT NULL OR (t.clinical_diagnosis IS NOT NULL AND TRIM(t.clinical_diagnosis) != '') THEN 1 END) * 100.0 / COUNT(*), 2) as percentage
FROM treatments t
JOIN animal_visits v ON v.id = t.visit_id
WHERE v.related_treatment_id IS NOT NULL;

-- ============================================================================
-- TEST 4: Simulate what would happen with a new course visit
-- ============================================================================
SELECT '=== TEST 4: Simulation - What will happen when completing a course visit ===' as test;

-- Find a recent treatment that has courses
WITH recent_course AS (
    SELECT t.id, t.disease_id, d.name as disease_name, t.clinical_diagnosis
    FROM treatments t
    LEFT JOIN diseases d ON d.id = t.disease_id
    WHERE EXISTS (
        SELECT 1 FROM animal_visits v 
        WHERE v.related_treatment_id = t.id
        AND v.status = 'Planuojamas'
    )
    ORDER BY t.created_at DESC
    LIMIT 1
)
SELECT 
    'If a course visit is completed now, it will create a treatment with:' as scenario,
    disease_id as will_have_disease_id,
    disease_name as will_show_disease_name,
    clinical_diagnosis as will_have_clinical_diagnosis
FROM recent_course;
