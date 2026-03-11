-- Comprehensive diagnostic for "Nespecifikuota liga" issue
-- Run this in Supabase SQL Editor to understand the scope

-- ============================================================================
-- PART 1: Check the specific example from the user (LT000009135958, 2026-02-23)
-- ============================================================================
SELECT 
    '=== SPECIFIC EXAMPLE: LT000009135958 on 2026-02-23 ===' as section;

SELECT 
    t.id as treatment_id,
    t.reg_date,
    a.tag_no,
    v.id as visit_id,
    v.status as visit_status,
    v.related_treatment_id,
    v.treatment_required,
    -- Disease fields
    t.disease_id,
    d.name as disease_from_table,
    t.clinical_diagnosis,
    t.animal_condition,
    -- What will appear in report
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) AS disease_in_report,
    -- Check if this is from a course
    v.related_treatment_id IS NOT NULL as is_course_visit,
    -- Medications
    (SELECT string_agg(p.name || ' (' || ui.qty || ' ' || ui.unit || ')', ', ')
     FROM usage_items ui
     JOIN products p ON ui.product_id = p.id
     WHERE ui.treatment_id = t.id) as medications
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
LEFT JOIN animal_visits v ON v.id = t.visit_id
WHERE 
    a.tag_no = 'LT000009135958'
    AND t.reg_date = '2026-02-23'
ORDER BY t.id;

-- ============================================================================
-- PART 2: Count total treatments with "Nespecifikuota liga"
-- ============================================================================
SELECT 
    '=== TOTAL COUNT OF AFFECTED TREATMENTS ===' as section;

SELECT 
    COUNT(*) as total_with_nespecifikuota,
    COUNT(DISTINCT t.animal_id) as affected_animals,
    MIN(t.reg_date) as earliest_date,
    MAX(t.reg_date) as latest_date
FROM treatments t
LEFT JOIN diseases d ON t.disease_id = d.id
WHERE 
    d.name IS NULL 
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (t.animal_condition IS NULL OR TRIM(t.animal_condition) = '');

-- ============================================================================
-- PART 3: Breakdown by whether they're from courses
-- ============================================================================
SELECT 
    '=== BREAKDOWN: COURSE vs SINGLE TREATMENTS ===' as section;

SELECT 
    CASE 
        WHEN v.related_treatment_id IS NOT NULL THEN 'Course visit (has related_treatment_id)'
        WHEN EXISTS (SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id) THEN 'Has treatment_courses'
        ELSE 'Single treatment (no course)'
    END as treatment_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM treatments t
LEFT JOIN diseases d ON t.disease_id = d.id
LEFT JOIN animal_visits v ON v.id = t.visit_id
WHERE 
    d.name IS NULL 
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (t.animal_condition IS NULL OR TRIM(t.animal_condition) = '')
GROUP BY 
    CASE 
        WHEN v.related_treatment_id IS NOT NULL THEN 'Course visit (has related_treatment_id)'
        WHEN EXISTS (SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id) THEN 'Has treatment_courses'
        ELSE 'Single treatment (no course)'
    END
ORDER BY count DESC;

-- ============================================================================
-- PART 4: Sample of course visits that SHOULD have disease info
-- ============================================================================
SELECT 
    '=== SAMPLE: Course visits missing disease (should be copied from related) ===' as section;

SELECT 
    t.id as treatment_id,
    t.reg_date,
    a.tag_no,
    v.related_treatment_id,
    -- What the related treatment has
    rt.disease_id as related_disease_id,
    rd.name as related_disease_name,
    rt.clinical_diagnosis as related_clinical_diagnosis,
    -- What this treatment has (should match but doesn't)
    t.disease_id as current_disease_id,
    d.name as current_disease_name,
    t.clinical_diagnosis as current_clinical_diagnosis,
    -- Result
    'MISSING!' as status
FROM treatments t
LEFT JOIN animal_visits v ON v.id = t.visit_id
LEFT JOIN treatments rt ON rt.id = v.related_treatment_id
LEFT JOIN diseases rd ON rd.id = rt.disease_id
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
WHERE 
    v.related_treatment_id IS NOT NULL
    AND t.disease_id IS NULL
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (rt.disease_id IS NOT NULL OR rt.clinical_diagnosis IS NOT NULL)
ORDER BY t.reg_date DESC
LIMIT 10;

-- ============================================================================
-- PART 5: Check if related treatments have disease info
-- ============================================================================
SELECT 
    '=== VERIFICATION: Do related treatments have disease info? ===' as section;

SELECT 
    COUNT(*) as total_course_visits,
    COUNT(CASE WHEN rt.disease_id IS NOT NULL THEN 1 END) as related_has_disease_id,
    COUNT(CASE WHEN rt.clinical_diagnosis IS NOT NULL AND TRIM(rt.clinical_diagnosis) != '' THEN 1 END) as related_has_diagnosis,
    COUNT(CASE WHEN rt.disease_id IS NOT NULL OR (rt.clinical_diagnosis IS NOT NULL AND TRIM(rt.clinical_diagnosis) != '') THEN 1 END) as related_has_either
FROM treatments t
JOIN animal_visits v ON v.id = t.visit_id
LEFT JOIN treatments rt ON rt.id = v.related_treatment_id
WHERE v.related_treatment_id IS NOT NULL;
