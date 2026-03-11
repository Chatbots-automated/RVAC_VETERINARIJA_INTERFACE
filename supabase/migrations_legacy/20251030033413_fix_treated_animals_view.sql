/*
  # Fix Treated Animals View

  Updates the vw_treated_animals view to properly show medication details from both:
  - usage_items (one-time administrations)
  - treatment_courses (ongoing owner-administered treatments)

  Columns added:
  - medication_summary: Combined list of all medications used
  - total_dose_given: Total dose administered
  - treatment_duration_days: Duration of treatment in days
*/

DROP VIEW IF EXISTS vw_treated_animals;

CREATE VIEW vw_treated_animals AS
SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,
    d.name as disease_name,
    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,

    -- Combine medications from both usage_items and treatment_courses
    COALESCE(
        NULLIF(
            TRIM(
                CONCAT(
                    -- One-time usage items
                    COALESCE(
                        (SELECT STRING_AGG(DISTINCT p.name, ', ')
                         FROM usage_items ui
                         JOIN products p ON ui.product_id = p.id
                         WHERE ui.treatment_id = t.id),
                        ''
                    ),
                    -- Add separator if both exist
                    CASE
                        WHEN EXISTS(SELECT 1 FROM usage_items WHERE treatment_id = t.id)
                             AND EXISTS(SELECT 1 FROM treatment_courses WHERE treatment_id = t.id)
                        THEN ', '
                        ELSE ''
                    END,
                    -- Treatment courses
                    COALESCE(
                        (SELECT STRING_AGG(DISTINCT p.name, ', ')
                         FROM treatment_courses tc
                         JOIN products p ON tc.product_id = p.id
                         WHERE tc.treatment_id = t.id),
                        ''
                    )
                )
            ),
            ''
        ),
        NULL
    ) as products_used,

    -- Total dose given (from treatment courses)
    (SELECT STRING_AGG(
        CONCAT(tc.total_dose, ' ', tc.unit, ' (', p.name, ')'),
        '; '
    )
     FROM treatment_courses tc
     JOIN products p ON tc.product_id = p.id
     WHERE tc.treatment_id = t.id
    ) as dose_summary,

    -- Treatment duration (from treatment courses)
    (SELECT MAX(tc.days)
     FROM treatment_courses tc
     WHERE tc.treatment_id = t.id
    ) as treatment_days,

    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    t.vet_name as veterinarian,
    t.notes
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
ORDER BY t.reg_date DESC;
