-- Check the specific treatments for cow LT000009135958 on 2026-02-23
-- This will show us exactly what's stored in the database

SELECT 
    t.id as treatment_id,
    t.reg_date,
    a.tag_no,
    t.disease_id,
    d.name as disease_name_from_table,
    t.clinical_diagnosis,
    t.animal_condition,
    -- Show what the view will display
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) AS disease_name_in_view,
    -- Check if has courses
    EXISTS (SELECT 1 FROM treatment_courses tc WHERE tc.treatment_id = t.id) as has_courses,
    -- Count medications
    (SELECT COUNT(*) FROM usage_items ui WHERE ui.treatment_id = t.id) as usage_items_count,
    -- Show medications
    (SELECT string_agg(p.name || ' (' || ui.qty || ' ' || ui.unit || ')', ', ')
     FROM usage_items ui
     JOIN products p ON ui.product_id = p.id
     WHERE ui.treatment_id = t.id) as medications_used
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
WHERE 
    a.tag_no = 'LT000009135958'
    AND t.reg_date = '2026-02-23'
ORDER BY t.id;

-- Also check the actual view output for this animal/date
SELECT *
FROM vw_treated_animals_detailed
WHERE animal_tag = 'LT000009135958'
    AND registration_date = '2026-02-23'
ORDER BY treatment_id;
