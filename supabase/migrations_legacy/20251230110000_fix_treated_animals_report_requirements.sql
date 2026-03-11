/*
  # Fix Treated Animals Report - Complete Requirements

  ## Fixed
  1. Veterinarian: Always shows "ARTŪRAS ABROMAITIS" (legal requirement)
  2. Medications: Pulls from usage_items, treatment_courses, AND animal_visits.planned_medications JSON
     - Includes ALL product categories: medicines, hygiene, prevention, vaccines, etc.
  3. Treatment duration: Defaults to 1 day minimum
  4. Disease: Shows clinical_diagnosis or animal_condition when disease is missing (34% of cases)

  ## Tables used
  - treatments (main table)
  - usage_items (direct medication entries)
  - treatment_courses (multi-day courses)
  - animal_visits (planned_medications JSON array)
*/

DROP VIEW IF EXISTS vw_treated_animals CASCADE;

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

    -- Disease: Use database disease, or fallback to clinical_diagnosis or animal_condition
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), '')
    ) as disease_name,

    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,

    -- Combine medications from usage_items, treatment_courses AND animal_visits
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
                    -- Add separator if needed
                    CASE
                        WHEN EXISTS(SELECT 1 FROM usage_items WHERE treatment_id = t.id)
                             AND (EXISTS(SELECT 1 FROM treatment_courses WHERE treatment_id = t.id)
                                  OR (t.visit_id IS NOT NULL AND EXISTS(
                                      SELECT 1 FROM animal_visits av
                                      WHERE av.id = t.visit_id
                                      AND av.planned_medications IS NOT NULL
                                      AND jsonb_array_length(av.planned_medications::jsonb) > 0
                                  )))
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
                    ),
                    -- Add separator if needed
                    CASE
                        WHEN (EXISTS(SELECT 1 FROM usage_items WHERE treatment_id = t.id)
                              OR EXISTS(SELECT 1 FROM treatment_courses WHERE treatment_id = t.id))
                             AND t.visit_id IS NOT NULL
                             AND EXISTS(
                                 SELECT 1 FROM animal_visits av
                                 WHERE av.id = t.visit_id
                                 AND av.planned_medications IS NOT NULL
                                 AND jsonb_array_length(av.planned_medications::jsonb) > 0
                             )
                        THEN ', '
                        ELSE ''
                    END,
                    -- Medications from animal_visits.planned_medications JSON
                    COALESCE(
                        (SELECT STRING_AGG(DISTINCT p.name, ', ')
                         FROM animal_visits av,
                         jsonb_array_elements(av.planned_medications::jsonb) as med
                         JOIN products p ON p.id = (med->>'product_id')::uuid
                         WHERE av.id = t.visit_id),
                        ''
                    )
                )
            ),
            ''
        ),
        NULL
    ) as products_used,

    -- Dose summary from all sources
    COALESCE(
        NULLIF(
            TRIM(
                CONCAT(
                    -- Usage items doses
                    COALESCE(
                        (SELECT STRING_AGG(
                            CONCAT(ui.qty, ' ', ui.unit, ' (', p.name, ')'),
                            '; '
                            ORDER BY p.name
                        )
                         FROM usage_items ui
                         JOIN products p ON ui.product_id = p.id
                         WHERE ui.treatment_id = t.id),
                        ''
                    ),
                    -- Separator
                    CASE
                        WHEN EXISTS(SELECT 1 FROM usage_items WHERE treatment_id = t.id)
                             AND (EXISTS(SELECT 1 FROM treatment_courses WHERE treatment_id = t.id)
                                  OR (t.visit_id IS NOT NULL AND EXISTS(
                                      SELECT 1 FROM animal_visits av
                                      WHERE av.id = t.visit_id
                                      AND av.planned_medications IS NOT NULL
                                      AND jsonb_array_length(av.planned_medications::jsonb) > 0
                                  )))
                        THEN '; '
                        ELSE ''
                    END,
                    -- Treatment course doses
                    COALESCE(
                        (SELECT STRING_AGG(
                            CONCAT(tc.total_dose, ' ', tc.unit, ' (', p.name, ')'),
                            '; '
                            ORDER BY p.name
                        )
                         FROM treatment_courses tc
                         JOIN products p ON tc.product_id = p.id
                         WHERE tc.treatment_id = t.id),
                        ''
                    ),
                    -- Separator
                    CASE
                        WHEN (EXISTS(SELECT 1 FROM usage_items WHERE treatment_id = t.id)
                              OR EXISTS(SELECT 1 FROM treatment_courses WHERE treatment_id = t.id))
                             AND t.visit_id IS NOT NULL
                             AND EXISTS(
                                 SELECT 1 FROM animal_visits av
                                 WHERE av.id = t.visit_id
                                 AND av.planned_medications IS NOT NULL
                                 AND jsonb_array_length(av.planned_medications::jsonb) > 0
                             )
                        THEN '; '
                        ELSE ''
                    END,
                    -- Doses from animal_visits.planned_medications JSON
                    COALESCE(
                        (SELECT STRING_AGG(
                            CONCAT((med->>'qty')::text, ' ', med->>'unit', ' (', p.name, ')'),
                            '; '
                            ORDER BY p.name
                        )
                         FROM animal_visits av,
                         jsonb_array_elements(av.planned_medications::jsonb) as med
                         JOIN products p ON p.id = (med->>'product_id')::uuid
                         WHERE av.id = t.visit_id),
                        ''
                    )
                )
            ),
            ''
        ),
        NULL
    ) as dose_summary,

    -- Treatment duration: from courses OR 1 day default
    COALESCE(
        (SELECT MAX(tc.days)
         FROM treatment_courses tc
         WHERE tc.treatment_id = t.id),
        1
    ) as treatment_days,

    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,

    -- LEGAL REQUIREMENT: Always show ARTŪRAS ABROMAITIS as responsible veterinarian
    'ARTŪRAS ABROMAITIS' as veterinarian,

    t.notes
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
ORDER BY t.reg_date DESC;
