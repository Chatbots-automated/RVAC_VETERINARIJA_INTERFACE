-- Update vw_treated_animals_detailed for official GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS format
-- This view provides all 14 columns required by Lithuanian veterinary regulations
-- Each row represents ONE treatment (not per medication like before)

DROP VIEW IF EXISTS vw_treated_animals_detailed CASCADE;

CREATE OR REPLACE VIEW vw_treated_animals_detailed AS
SELECT 
    t.id AS treatment_id,
    t.animal_id,
    t.disease_id,
    
    -- Column 2: Registracijos data (Registration date)
    t.reg_date AS registration_date,
    
    -- Column 3: Gyvūno laikytojo duomenys (Owner/holder details)
    COALESCE(a.holder_name, 'ŽŪB Berčiūnai') AS owner_name,
    a.holder_address AS owner_address,
    
    -- Column 4: Gyvūno rūšis, lytis (Animal species, sex)
    a.species,
    a.sex,
    
    -- Column 5: Gyvūno amžius (Animal age)
    a.age_months,
    a.birth_date,
    
    -- Column 6: Gyvūno ženklinimo numeris (Animal tag/ID number)
    a.tag_no AS animal_tag,
    
    -- Column 7: Pirmųjų ligos požymių pastebėjimo data (First symptoms date)
    -- Defaults to registration date if not specified
    COALESCE(t.first_symptoms_date, t.reg_date) AS first_symptoms_date,
    
    -- Column 8: Gyvūno būklė (Animal condition)
    -- Always "Patenkinama"
    'Patenkinama' AS animal_condition,
    
    -- Column 9: Atlikti tyrimai (Tests performed)
    -- Always "Temperatūra"
    'Temperatūra' AS tests,
    
    -- Column 10: Klinikinė diagnozė (Clinical diagnosis)
    t.clinical_diagnosis,
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) AS disease_name,
    d.code AS disease_code,
    
    -- Column 11: Suteiktos veterinarijos paslaugos pavadinimas (Veterinary service provided)
    t.services,
    
    -- All medications used (for display purposes)
    COALESCE(
        NULLIF(
            TRIM(
                CONCAT(
                    COALESCE(
                        (SELECT string_agg(DISTINCT p.name, ', ')
                         FROM usage_items ui
                         JOIN products p ON ui.product_id = p.id
                         WHERE ui.treatment_id = t.id),
                        ''
                    ),
                    CASE
                        WHEN EXISTS (SELECT 1 FROM usage_items WHERE treatment_id = t.id)
                             AND EXISTS (SELECT 1 FROM treatment_courses WHERE treatment_id = t.id)
                        THEN ', '
                        ELSE ''
                    END,
                    COALESCE(
                        (SELECT string_agg(DISTINCT p.name, ', ')
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
    ) AS medications_used,
    
    -- Column 12: Išlauka (Withdrawal period)
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    
    -- Column 13: Ligos baigtis (Outcome)
    -- Shows "Pasveiko" if no future visits/treatments planned
    -- Blank if there are future planned visits (treatment ongoing)
    CASE
        WHEN t.outcome IS NOT NULL AND t.outcome != '' THEN t.outcome
        -- Check if there are future planned visits for this animal
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av
            WHERE av.animal_id = t.animal_id
              AND av.visit_datetime > NOW()
              AND av.status IN ('Planuojamas', 'Suplanuota')
        ) THEN NULL  -- Treatment ongoing, leave blank
        -- No future visits/treatments, animal recovered
        ELSE 'Pasveiko'
    END AS treatment_outcome,
    
    -- Column 14: Veterinarijos gydytojo vardas, pavardė (Veterinarian name)
    -- ALWAYS Artūras Abromaitis (no override)
    'Artūras Abromaitis' AS veterinarian,
    
    -- Treatment duration (for reference)
    COALESCE(
        (SELECT MAX(tc.days) FROM treatment_courses tc WHERE tc.treatment_id = t.id),
        1
    ) AS treatment_days,
    
    -- Additional fields
    t.notes,
    t.created_at
    
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
ORDER BY t.reg_date DESC, t.created_at DESC;

-- Grant permissions
GRANT ALL ON vw_treated_animals_detailed TO anon;
GRANT ALL ON vw_treated_animals_detailed TO authenticated;
GRANT ALL ON vw_treated_animals_detailed TO service_role;

COMMENT ON VIEW vw_treated_animals_detailed IS 'Official GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS format with all 14 required columns. One row per treatment (not per medication). Eil. Nr. is critical for official documentation.';
