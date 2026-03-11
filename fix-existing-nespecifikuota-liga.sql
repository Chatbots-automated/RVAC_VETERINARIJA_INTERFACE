-- OPTIONAL: Fix existing treatments with "Nespecifikuota liga"
-- This updates historical records to copy disease info from related treatments
-- 
-- ⚠️ WARNING: This modifies existing treatment records
-- ⚠️ Run diagnose-nespecifikuota-liga.sql first to see what will be affected
-- ⚠️ Consider backing up the treatments table before running this
--
-- This script will:
-- 1. Find treatments that are part of courses (have related_treatment_id)
-- 2. Copy disease_id and clinical_diagnosis from the related treatment
-- 3. Only update records where the related treatment has disease info

-- Preview what will be updated (run this first!)
SELECT 
    t.id as treatment_id,
    t.reg_date,
    a.tag_no,
    'WILL UPDATE' as action,
    -- Current values (empty)
    t.disease_id as current_disease_id,
    t.clinical_diagnosis as current_clinical_diagnosis,
    -- New values (from related)
    rt.disease_id as new_disease_id,
    rd.name as new_disease_name,
    rt.clinical_diagnosis as new_clinical_diagnosis
FROM treatments t
JOIN animal_visits v ON v.id = t.visit_id
JOIN treatments rt ON rt.id = v.related_treatment_id
LEFT JOIN diseases rd ON rd.id = rt.disease_id
LEFT JOIN animals a ON t.animal_id = a.id
WHERE 
    v.related_treatment_id IS NOT NULL
    AND t.disease_id IS NULL
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (rt.disease_id IS NOT NULL OR rt.clinical_diagnosis IS NOT NULL)
ORDER BY t.reg_date DESC;

-- If the preview looks good, uncomment and run this UPDATE:
/*
UPDATE treatments t
SET 
    disease_id = rt.disease_id,
    clinical_diagnosis = rt.clinical_diagnosis,
    animal_condition = rt.animal_condition,
    tests = rt.tests,
    services = rt.services,
    notes = COALESCE(t.notes || E'\n\n', '') || '[Updated: Copied disease info from related treatment]'
FROM animal_visits v
JOIN treatments rt ON rt.id = v.related_treatment_id
WHERE 
    v.id = t.visit_id
    AND v.related_treatment_id IS NOT NULL
    AND t.disease_id IS NULL
    AND (t.clinical_diagnosis IS NULL OR TRIM(t.clinical_diagnosis) = '')
    AND (rt.disease_id IS NOT NULL OR rt.clinical_diagnosis IS NOT NULL);

-- Show results
SELECT 
    'Updated ' || COUNT(*) || ' treatment records' as result
FROM treatments t
JOIN animal_visits v ON v.id = t.visit_id
WHERE 
    v.related_treatment_id IS NOT NULL
    AND t.notes LIKE '%[Updated: Copied disease info from related treatment]%';
*/
