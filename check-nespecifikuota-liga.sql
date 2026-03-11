-- Diagnostic script to check treatments with "Nespecifikuota liga"
-- Run this in Supabase SQL Editor to see which treatments need disease info

-- 1. Count treatments with missing disease information
SELECT 
    COUNT(*) as total_treatments_with_nespecifikuota_liga,
    COUNT(DISTINCT t.animal_id) as affected_animals,
    COUNT(DISTINCT t.reg_date) as affected_dates
FROM treatments t
LEFT JOIN diseases d ON t.disease_id = d.id
WHERE 
    d.name IS NULL 
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (t.animal_condition IS NULL OR TRIM(t.animal_condition) = '');

-- 2. Show recent examples (last 20)
SELECT 
    t.id as treatment_id,
    t.reg_date,
    a.tag_no as animal_tag,
    t.disease_id,
    d.name as disease_name,
    t.clinical_diagnosis,
    t.animal_condition,
    -- Check if this treatment has courses (likely from course planner)
    CASE 
        WHEN EXISTS (SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id) 
        THEN 'YES - has courses' 
        ELSE 'NO - single treatment' 
    END as has_treatment_course,
    -- Count medications
    (SELECT COUNT(*) FROM usage_items ui WHERE ui.treatment_id = t.id) as medication_count
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
WHERE 
    d.name IS NULL 
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (t.animal_condition IS NULL OR TRIM(t.animal_condition) = '')
ORDER BY t.reg_date DESC
LIMIT 20;

-- 3. Breakdown by whether they have courses or not
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id) 
        THEN 'With courses (likely from planner)' 
        ELSE 'Without courses (single treatment)' 
    END as treatment_type,
    COUNT(*) as count
FROM treatments t
LEFT JOIN diseases d ON t.disease_id = d.id
WHERE 
    d.name IS NULL 
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (t.animal_condition IS NULL OR TRIM(t.animal_condition) = '')
GROUP BY 
    CASE 
        WHEN EXISTS (SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id) 
        THEN 'With courses (likely from planner)' 
        ELSE 'Without courses (single treatment)' 
    END;
