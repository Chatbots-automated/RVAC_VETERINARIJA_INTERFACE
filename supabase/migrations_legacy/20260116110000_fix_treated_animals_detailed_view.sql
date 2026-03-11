/*
  # Fix Treated Animals Detailed View

  1. Changes
    - Disease name is NEVER NULL - fallback to "Nespecifikuota liga" if all sources are empty
    - Treatment duration now calculated from ALL treatment_courses for that treatment
      - If treatment has courses, ALL medications show the maximum course duration
      - If no courses, defaults to 1 day

  2. Security
    - No RLS changes needed (view inherits from base tables)
*/

CREATE OR REPLACE VIEW vw_treated_animals_detailed AS
-- Medications from usage_items (one-time usage)
SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,

    -- Disease name - NEVER NULL
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) as disease_name,

    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,

    -- Individual medication details
    p.name as product_name,
    CONCAT(ui.qty, ' ', ui.unit) as dose,

    -- Treatment duration from ANY course in this treatment
    COALESCE(
        (SELECT MAX(tc.days)
         FROM treatment_courses tc
         WHERE tc.treatment_id = t.id),
        1
    ) as treatment_days,

    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    'ARTŪRAS ABROMAITIS' as veterinarian,
    t.notes,

    'usage_item' as medication_source
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN usage_items ui ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id

UNION ALL

-- Medications from treatment_courses (multi-day courses)
SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,

    -- Disease name - NEVER NULL
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) as disease_name,

    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,

    p.name as product_name,
    CONCAT(tc.total_dose, ' ', tc.unit) as dose,

    -- Use the course duration for this specific course medication
    tc.days as treatment_days,

    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    'ARTŪRAS ABROMAITIS' as veterinarian,
    t.notes,

    'treatment_course' as medication_source
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN treatment_courses tc ON tc.treatment_id = t.id
INNER JOIN products p ON tc.product_id = p.id

UNION ALL

-- Medications from animal_visits.planned_medications JSON
SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,

    -- Disease name - NEVER NULL
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) as disease_name,

    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,

    p.name as product_name,
    CONCAT((med->>'qty')::text, ' ', med->>'unit') as dose,

    -- Treatment duration from ANY course in this treatment
    COALESCE(
        (SELECT MAX(tc.days)
         FROM treatment_courses tc
         WHERE tc.treatment_id = t.id),
        1
    ) as treatment_days,

    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    'ARTŪRAS ABROMAITIS' as veterinarian,
    t.notes,

    'planned_medication' as medication_source
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN animal_visits av ON av.id = t.visit_id
CROSS JOIN jsonb_array_elements(av.planned_medications::jsonb) as med
INNER JOIN products p ON p.id = (med->>'product_id')::uuid
WHERE av.planned_medications IS NOT NULL
  AND jsonb_array_length(av.planned_medications::jsonb) > 0

ORDER BY registration_date DESC;

COMMENT ON VIEW vw_treated_animals_detailed IS 'Detailed view of treated animals with one row per medication. Disease is NEVER NULL. Treatment duration calculated from treatment courses.';
